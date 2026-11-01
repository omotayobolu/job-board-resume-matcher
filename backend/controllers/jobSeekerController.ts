import type { Request, Response, NextFunction } from "express";
import { HttpStatusCode, CustomError } from "../utils/error-handler";
import pool from "../db";
import { cloudinary } from "../config/cloudinary";
import streamifier from "streamifier";
import extractText from "../utils/extractResumeText";
import { parseResumeText } from "../utils/parseResume";
import { embedResume } from "../utils/embed";
import index from "../config/pinecone";
import { jobSeekerProfileSchema } from "../schemas";
import type { JobSeekerProfileRow } from "../types/domain";

const createProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const user_id = req.user.id;
  try {
    const { job_title, location, remote_preference } =
      jobSeekerProfileSchema.parse(req.body as unknown);
    if (!user_id) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "User ID is required.",
        true,
      );
    }
    const userCheck = await pool.query<{ id: string; role: string | null }>(
      "SELECT id, role FROM users WHERE id = $1",
      [user_id],
    );
    if (userCheck.rowCount === 0) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "User not found",
        true,
      );
    }

    const user = userCheck.rows[0];

    if (user?.role !== "job_seeker") {
      throw new CustomError(
        "FORBIDDEN",
        HttpStatusCode.FORBIDDEN,
        "A recruiter cannot create a job seeker profile.",
        true,
      );
    }
    const existingProfile = await pool.query(
      "SELECT 1 FROM job_seeker WHERE user_id = $1 LIMIT 1",
      [user_id],
    );
    if (existingProfile.rowCount !== 0) {
      throw new CustomError(
        "CONFLICT",
        HttpStatusCode.CONFLICT,
        "You already have a profile",
        true,
      );
    }
    if (!job_title || !location || !remote_preference || !req.file) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Job title, location, remote preference, and resume are required.",
        true,
      );
    }
    if (
      ![
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ].includes(req.file.mimetype)
    ) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Resume must be a PDF or DOCX file.",
        true,
      );
    }
    const resumeText = await extractText(req.file.buffer, req.file.mimetype);
    const parsedResume = await parseResumeText(resumeText);
    const embedding = await embedResume(parsedResume);

    const vector = {
      id: String(user_id),
      values: Array.from(embedding),
      metadata: {
        type: "resume",
        name: parsedResume.name || "unknown",
        experience_years: parsedResume.years_of_experience || "",
        skills: parsedResume.skills || "",
        education: parsedResume.education || "",
        certifications: parsedResume.certifications || "",
        job_experience_details:
          JSON.stringify(
            parsedResume.work_experience?.map((exp) => ({
              jobTitle: exp.title || "",
              company: exp.company || "",
              responsibilities: exp.responsibilities || [],
            })),
          ) || [],
      },
    };

    await index.namespace("job_seeker").upsert([vector]);

    const streamUpload = (
      buffer: Buffer,
      originalname: string,
    ): Promise<{ secure_url: string }> => {
      return new Promise((resolve, reject) => {
        const ext = originalname.split(".").pop();
        const baseName = originalname.replace(/\.[^/.]+$/, "");
        const publicId = `resumes/${baseName}_${Date.now()}.${ext}`;
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: "raw",
            public_id: publicId,
            use_filename: false,
            unique_filename: false,
            overwrite: true,
          },
          (error, result) => {
            if (result?.secure_url) resolve({ secure_url: result.secure_url });
            else reject(error);
          },
        );
        streamifier.createReadStream(buffer).pipe(stream);
      });
    };

    const resume = await streamUpload(req.file.buffer, req.file.originalname);

    const result = await pool.query<JobSeekerProfileRow>(
      "INSERT INTO job_seeker (user_id, job_title, location, remote_preference, resume_url, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *",
      [user_id, job_title, location, remote_preference, resume.secure_url],
    );

    await pool.query("UPDATE users SET hasprofile = true WHERE id = $1", [
      user_id,
    ]);

    const jobSeeker = result.rows[0];

    res
      .status(HttpStatusCode.CREATED)
      .json({ jobSeeker, message: "Profile created successfully" });
  } catch (error) {
    next(error);
  }
};

export { createProfile };

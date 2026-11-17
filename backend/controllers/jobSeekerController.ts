import type { Request, Response, NextFunction } from "express";
import { HttpStatusCode, CustomError } from "../utils/error-handler";
import pool from "../db";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { validateResumeFile, uploadResume } from "../utils/resumeUpload";
import { s3 } from "../config/s3";
import { requiredEnv } from "../env";
import { jobSeekerProfileSchema } from "../schemas";
import type { JobSeekerProfileRow } from "../types/domain";
import { errorHandler } from "../utils/error-handler";
import { resumeQueue } from "../utils/resumeQueue";

const createProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const user_id = req.user.id;
  let uploadedKey: string | null = null;
  let profileSaved = false;
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
    const resumeFile = validateResumeFile(req.file, "Job title, location, remote preference, and resume are required.");

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
    const key = await uploadResume(resumeFile, user_id);
    uploadedKey = key;
    const jobSeeker = await pool.transaction(async (client) => {
      const result = await client.query<JobSeekerProfileRow>(
        `INSERT INTO job_seeker
           (user_id, job_title, location, remote_preference,
            resume_s3_key, resume_filename, resume_processing_status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
         RETURNING id, user_id, job_title, location, remote_preference,
                   resume_s3_key, resume_filename, resume_processing_status, created_at`,
        [
          user_id,
          job_title,
          location,
          remote_preference,
          key,
          resumeFile.originalname,
        ],
      );
      const profile = result.rows[0];
      if (!profile) throw new Error("Profile insert returned no row");

      await client.query("UPDATE users SET hasprofile = true WHERE id = $1", [
        user_id,
      ]);
      const jobId = await resumeQueue.enqueue(client, profile.id);
      await client.query(
        "UPDATE job_seeker SET resume_job_id = $1 WHERE id = $2",
        [jobId, profile.id],
      );
      return { ...profile, resume_job_id: jobId };
    });
    profileSaved = true;

    res
      .status(HttpStatusCode.ACCEPTED)
      .json({
        jobSeeker,
        message: "Profile saved. Your resume is processing.",
      });
  } catch (error) {
    if (uploadedKey && !profileSaved) {
      try {
        const saved = await pool.query(
          "SELECT 1 FROM job_seeker WHERE resume_s3_key = $1 LIMIT 1",
          [uploadedKey],
        );
        if (saved.rowCount === 0) {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: requiredEnv("S3_BUCKET_NAME"),
              Key: uploadedKey,
            }),
          );
        }
      } catch (cleanupError) {
        errorHandler.handleError(cleanupError);
      }
    }
    if (error instanceof Error && "code" in error && error.code === "23505") {
      return next(
        new CustomError(
          "CONFLICT",
          HttpStatusCode.CONFLICT,
          "You already have a profile",
          true,
        ),
      );
    }
    next(error);
  }
};

const getResumeContent = async (req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.user.role !== "job_seeker") {
      throw new CustomError("FORBIDDEN", HttpStatusCode.FORBIDDEN, "Only job seekers can preview their resume.", true);
    }
    const result = await pool.query<Pick<JobSeekerProfileRow, "resume_s3_key">>(
      "SELECT resume_s3_key FROM job_seeker WHERE user_id = $1", [req.user.id],
    );
    const key = result.rows[0]?.resume_s3_key;
    if (!key) throw new CustomError("NOT FOUND", HttpStatusCode.NOT_FOUND, "Resume not found", true);
    const object = await s3.send(new GetObjectCommand({ Bucket: requiredEnv("S3_BUCKET_NAME"), Key: key }));
    if (!object.Body) throw new CustomError("NOT FOUND", HttpStatusCode.NOT_FOUND, "Resume not found", true);
    res.setHeader("Content-Type", key.toLowerCase().endsWith(".pdf") ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(HttpStatusCode.OK).send(Buffer.from(await object.Body.transformToByteArray()));
  } catch (error) {
    next(error);
  }
};

const getResumePreview = async (req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.user.role !== "job_seeker") {
      throw new CustomError("FORBIDDEN", HttpStatusCode.FORBIDDEN, "Only job seekers can preview their resume.", true);
    }
    const result = await pool.query<Pick<JobSeekerProfileRow, "resume_s3_key" | "resume_filename">>(
      "SELECT resume_s3_key, resume_filename FROM job_seeker WHERE user_id = $1",
      [req.user.id],
    );
    const profile = result.rows[0];
    if (!profile?.resume_s3_key) {
      throw new CustomError("NOT FOUND", HttpStatusCode.NOT_FOUND, "Resume not found", true);
    }
    const isPdf = profile.resume_s3_key.toLowerCase().endsWith(".pdf");
    const filename = profile.resume_filename || (isPdf ? "resume.pdf" : "resume.docx");
    // Encode the stored filename so it cannot inject response headers.
    const encodedFilename = encodeURIComponent(filename).replace(/[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    const url = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: requiredEnv("S3_BUCKET_NAME"),
      Key: profile.resume_s3_key,
      ResponseContentType: isPdf ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ResponseContentDisposition: `${isPdf ? "inline" : "attachment"}; filename*=UTF-8''${encodedFilename}`,
      ResponseCacheControl: "no-store",
    }), { expiresIn: 300 });
    res.status(HttpStatusCode.OK).json({ url, filename, content_type: isPdf ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  } catch (error) {
    next(error);
  }
};

const replaceResume = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  let uploadedKey: string | null = null;
  let profileSaved = false;
  try {
    const user_id = req.user.id;
    if (!user_id) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "User ID is required.",
        true,
      );
    }
    const resumeFile = validateResumeFile(req.file, "Resume is required.");

    const userCheck = await pool.query<{ id: string; role: string | null }>(
      "SELECT id, role FROM users WHERE id = $1",
      [user_id],
    );
    const user = userCheck.rows[0];
    if (!user) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "User not found",
        true,
      );
    }
    if (user.role !== "job_seeker") {
      throw new CustomError(
        "FORBIDDEN",
        HttpStatusCode.FORBIDDEN,
        "Only job seekers can replace a resume.",
        true,
      );
    }

    const existingProfile = await pool.query<Pick<JobSeekerProfileRow, "id">>(
      "SELECT id FROM job_seeker WHERE user_id = $1 LIMIT 1",
      [user_id],
    );
    if (!existingProfile.rows[0]) {
      throw new CustomError("NOT FOUND", HttpStatusCode.NOT_FOUND, "Profile not found", true);
    }

    const bucket = requiredEnv("S3_BUCKET_NAME");
    const key = await uploadResume(resumeFile, user_id);
    uploadedKey = key;
    const oldKey = await pool.transaction(async (client) => {
      const result = await client.query<
        Pick<JobSeekerProfileRow, "id" | "resume_s3_key" | "resume_processing_status">
      >(
        "SELECT id, resume_s3_key, resume_processing_status FROM job_seeker WHERE user_id = $1 FOR UPDATE",
        [user_id],
      );
      const profile = result.rows[0];
      if (!profile) {
        throw new CustomError(
          "NOT FOUND",
          HttpStatusCode.NOT_FOUND,
          "Profile not found",
          true,
        );
      }
      if (profile.resume_processing_status === "pending" || profile.resume_processing_status === "processing") {
        throw new CustomError(
          "CONFLICT", HttpStatusCode.CONFLICT,
          "Resume processing is already in progress. Please wait before replacing it.", true,
        );
      }
      await client.query(
        `UPDATE job_seeker
         SET resume_s3_key = $1, resume_filename = $2,
             resume_processing_status = 'pending', resume_processing_token = NULL,
             parsed_resume = NULL, embedding = NULL
         WHERE id = $3`,
        [key, resumeFile.originalname, profile.id],
      );
      const jobId = await resumeQueue.enqueue(client, profile.id);
      await client.query(
        "UPDATE job_seeker SET resume_job_id = $1 WHERE id = $2",
        [jobId, profile.id],
      );
      return profile.resume_s3_key;
    });
    profileSaved = true;
    if (oldKey) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: oldKey }));
      } catch (cleanupError) {
        errorHandler.handleError(cleanupError);
      }
    }
    res
      .status(HttpStatusCode.ACCEPTED)
      .json({ resume_processing_status: "pending" });
  } catch (error) {
    if (uploadedKey && !profileSaved) {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: requiredEnv("S3_BUCKET_NAME"),
            Key: uploadedKey,
          }),
        );
      } catch (cleanupError) {
        errorHandler.handleError(cleanupError);
      }
    }
    next(error);
  }
};

type ResumeStatusRow = Pick<
  JobSeekerProfileRow,
  "id" | "resume_job_id" | "resume_processing_status"
>;

async function resolveResumeStatus(
  profile: ResumeStatusRow,
): Promise<JobSeekerProfileRow["resume_processing_status"]> {
  const jobState = profile.resume_job_id
    ? await resumeQueue.jobState(profile.resume_job_id)
    : null;
  let status = profile.resume_processing_status;
  if (status !== "completed") {
    if (jobState === "failed") status = "failed";
    else if (jobState === "completed") status = "completed";
    else if (jobState === "created" || jobState === "retry") status = "pending";
    else if (jobState === "active") status = "processing";
  }

  if (
    status !== profile.resume_processing_status &&
    (status === "failed" || status === "completed")
  ) {
    await pool.query(
      `UPDATE job_seeker SET resume_processing_status = $1, resume_processing_token = NULL
       WHERE id = $2 AND resume_job_id = $3`,
      [status, profile.id, profile.resume_job_id],
    );
  }
  return status;
}

const getProfileStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await pool.query<
      Pick<
        JobSeekerProfileRow,
        "id" | "resume_processing_status" | "resume_filename" | "resume_job_id"
      > & { can_retry: boolean }
    >(
      "SELECT id, resume_processing_status, resume_filename, resume_job_id, (resume_s3_key IS NOT NULL OR parsed_resume IS NOT NULL) AS can_retry FROM job_seeker WHERE user_id = $1",
      [req.user.id],
    );
    const profile = result.rows[0];
    if (!profile) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "Profile not found",
        true,
      );
    }
    const status = await resolveResumeStatus(profile);
    res.status(HttpStatusCode.OK).json({
      resume_processing_status: status,
      resume_filename: profile.resume_filename,
      can_retry: profile.can_retry,
    });
  } catch (error) {
    next(error);
  }
};

type ProfilePageRow = Pick<
  JobSeekerProfileRow,
  | "id"
  | "job_title"
  | "location"
  | "remote_preference"
  | "resume_filename"
  | "resume_processing_status"
  | "resume_job_id"
  | "created_at"
> & {
  full_name: string | null;
  email: string | null;
  professional_summary: string | null;
  skills: string | null;
  years_of_experience: string | null;
  education: string | null;
  certifications: string | null;
  has_parsed_resume: boolean;
};

const getProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query<ProfilePageRow>(
      `SELECT js.id, js.job_title, js.location, js.remote_preference,
              js.resume_filename, js.resume_processing_status, js.resume_job_id, js.created_at,
              u.full_name, u.email,
              js.parsed_resume ->> 'professional_summary' AS professional_summary,
              js.parsed_resume ->> 'skills' AS skills,
              js.parsed_resume ->> 'years_of_experience' AS years_of_experience,
              js.parsed_resume ->> 'education' AS education,
              js.parsed_resume ->> 'certifications' AS certifications,
              js.parsed_resume IS NOT NULL AS has_parsed_resume
       FROM job_seeker AS js
       JOIN users AS u ON u.id = js.user_id
       WHERE js.user_id = $1`,
      [req.user.id],
    );
    const profile = result.rows[0];
    if (!profile) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "Profile not found",
        true,
      );
    }
    const status = await resolveResumeStatus(profile);

    res.status(HttpStatusCode.OK).json({
      profile: {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        job_title: profile.job_title,
        location: profile.location,
        remote_preference: profile.remote_preference,
        resume_filename: profile.resume_filename,
        resume_processing_status: status,
        created_at: profile.created_at,
        parsed_resume: profile.has_parsed_resume
          ? {
              professional_summary: profile.professional_summary,
              skills: profile.skills,
              years_of_experience: profile.years_of_experience,
              education: profile.education,
              certifications: profile.certifications,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

const retryProfileProcessing = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    await pool.transaction(async (client) => {
      const result = await client.query<
        Pick<
          JobSeekerProfileRow,
          "id" | "resume_job_id" | "resume_processing_status" | "resume_s3_key"
        > & { has_parsed_resume: boolean }
      >(
        `SELECT id, resume_job_id, resume_processing_status, resume_s3_key,
                parsed_resume IS NOT NULL AS has_parsed_resume
         FROM job_seeker WHERE user_id = $1 FOR UPDATE`,
        [req.user.id],
      );
      const profile = result.rows[0];
      const jobState = profile?.resume_job_id
        ? await resumeQueue.jobState(profile.resume_job_id)
        : null;
      if (
        (!profile?.resume_s3_key && !profile?.has_parsed_resume) ||
        profile?.resume_processing_status === "completed" ||
        (jobState !== "failed" &&
          !(jobState === null && profile.resume_processing_status === "failed"))
      ) {
        throw new CustomError(
          "CONFLICT",
          HttpStatusCode.CONFLICT,
          "No failed resume processing to retry",
          true,
        );
      }
      const jobId = await resumeQueue.enqueue(client, profile.id);
      await client.query(
        `UPDATE job_seeker
         SET resume_job_id = $1, resume_processing_status = 'pending',
             resume_processing_token = NULL
         WHERE id = $2`,
        [jobId, profile.id],
      );
    });
    res.status(HttpStatusCode.ACCEPTED).json({
      resume_processing_status: "pending",
      message: "Resume processing queued again.",
    });
  } catch (error) {
    next(error);
  }
};

export {
  getResumeContent,
  getResumePreview,
  replaceResume,
  createProfile,
  getProfile,
  getProfileStatus,
  retryProfileProcessing,
};

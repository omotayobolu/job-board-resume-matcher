import type { Request, Response, NextFunction } from "express";
import { HttpStatusCode, CustomError } from "../utils/error-handler";
import pool from "../db";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
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
    if (!req.file) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Job title, location, remote preference, and resume are required.",
        true,
      );
    }
    const resumeFile = req.file;
    if (
      ![
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ].includes(resumeFile.mimetype)
    ) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Resume must be a PDF or DOCX file.",
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
    const bucket = requiredEnv("S3_BUCKET_NAME");
    const extension = resumeFile.mimetype === "application/pdf" ? "pdf" : "docx";
    const key = `resumes/${user_id}/${randomUUID()}.${extension}`;
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: resumeFile.buffer,
      ContentType: resumeFile.mimetype,
    }));
    uploadedKey = key;
    const jobSeeker = await pool.transaction(async (client) => {
      const result = await client.query<JobSeekerProfileRow>(
        `INSERT INTO job_seeker
           (user_id, job_title, location, remote_preference,
            resume_s3_key, resume_filename, resume_processing_status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
         RETURNING id, user_id, job_title, location, remote_preference,
                   resume_s3_key, resume_filename, resume_processing_status, created_at`,
        [user_id, job_title, location, remote_preference, key, resumeFile.originalname],
      );
      const profile = result.rows[0];
      if (!profile) throw new Error("Profile insert returned no row");

      await client.query("UPDATE users SET hasprofile = true WHERE id = $1", [user_id]);
      const jobId = await resumeQueue.enqueue(client, profile.id);
      await client.query("UPDATE job_seeker SET resume_job_id = $1 WHERE id = $2", [jobId, profile.id]);
      return { ...profile, resume_job_id: jobId };
    });
    profileSaved = true;

    res
      .status(HttpStatusCode.ACCEPTED)
      .json({ jobSeeker, message: "Profile saved. Your resume is processing." });
  } catch (error) {
    if (uploadedKey && !profileSaved) {
      try {
        const saved = await pool.query(
          "SELECT 1 FROM job_seeker WHERE resume_s3_key = $1 LIMIT 1",
          [uploadedKey],
        );
        if (saved.rowCount === 0) {
          await s3.send(new DeleteObjectCommand({
            Bucket: requiredEnv("S3_BUCKET_NAME"),
            Key: uploadedKey,
          }));
        }
      } catch (cleanupError) {
        errorHandler.handleError(cleanupError);
      }
    }
    if (error instanceof Error && "code" in error && error.code === "23505") {
      return next(new CustomError(
        "CONFLICT", HttpStatusCode.CONFLICT, "You already have a profile", true,
      ));
    }
    next(error);
  }
};

const getProfileStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query<Pick<JobSeekerProfileRow, "id" | "resume_processing_status" | "resume_filename" | "resume_job_id"> & { can_retry: boolean }>(
      "SELECT id, resume_processing_status, resume_filename, resume_job_id, (resume_s3_key IS NOT NULL OR parsed_resume IS NOT NULL) AS can_retry FROM job_seeker WHERE user_id = $1",
      [req.user.id],
    );
    const profile = result.rows[0];
    if (!profile) {
      throw new CustomError("NOT FOUND", HttpStatusCode.NOT_FOUND, "Profile not found", true);
    }
    const jobState = profile.resume_job_id ? await resumeQueue.jobState(profile.resume_job_id) : null;
    let status = profile.resume_processing_status;
    if (status !== "completed") {
      if (jobState === "failed") status = "failed";
      else if (jobState === "completed") status = "completed";
      else if (jobState === "created" || jobState === "retry") status = "pending";
      else if (jobState === "active") status = "processing";
    }

    if (status !== profile.resume_processing_status && (status === "failed" || status === "completed")) {
      await pool.query(
        `UPDATE job_seeker SET resume_processing_status = $1, resume_processing_token = NULL
         WHERE id = $2 AND resume_job_id = $3`,
        [status, profile.id, profile.resume_job_id],
      );
    }
    res.status(HttpStatusCode.OK).json({
      resume_processing_status: status,
      resume_filename: profile.resume_filename,
      can_retry: profile.can_retry,
    });
  } catch (error) {
    next(error);
  }
};

const retryProfileProcessing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await pool.transaction(async (client) => {
      const result = await client.query<Pick<JobSeekerProfileRow, "id" | "resume_job_id" | "resume_processing_status" | "resume_s3_key"> & { has_parsed_resume: boolean }>(
        `SELECT id, resume_job_id, resume_processing_status, resume_s3_key,
                parsed_resume IS NOT NULL AS has_parsed_resume
         FROM job_seeker WHERE user_id = $1 FOR UPDATE`,
        [req.user.id],
      );
      const profile = result.rows[0];
      const jobState = profile?.resume_job_id ? await resumeQueue.jobState(profile.resume_job_id) : null;
      if ((!profile?.resume_s3_key && !profile?.has_parsed_resume)
        || profile?.resume_processing_status === "completed"
        || (jobState !== "failed" && !(jobState === null && profile.resume_processing_status === "failed"))) {
        throw new CustomError("CONFLICT", HttpStatusCode.CONFLICT, "No failed resume processing to retry", true);
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

export { createProfile, getProfileStatus, retryProfileProcessing };

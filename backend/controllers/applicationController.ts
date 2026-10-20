import type { Request, Response, NextFunction } from "express";
import { HttpStatusCode, CustomError } from "../utils/error-handler";
import pool from "../db";
import { fetchVector } from "../utils/fetchVector";
import cosineSimilarity from "../utils/cosineSimilarity";
import { applySchema, jobIdParamSchema } from "../schemas";
import type { ApplicationRow } from "../types/domain";

const applyToJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = applySchema.parse(req.body as unknown);
    const jobSeekerId = req.user.id;
    if (!jobId || !jobSeekerId) {
      return res
        .status(HttpStatusCode.BAD_REQUEST)
        .json({ error: "jobId and jobSeekerId are required" });
    }

    const checkJobExists = await pool.query<{ recruiter_id: string }>(
      `SELECT recruiter_id FROM jobs WHERE id = $1`,
      [jobId]
    );

    if (checkJobExists.rowCount === 0) {
      return res
        .status(HttpStatusCode.NOT_FOUND)
        .json({ error: "Job not found" });
    }

    const recruiterId = checkJobExists.rows[0]!.recruiter_id;

    const jobSeekerExists = await pool.query<{ id: string; role: string | null }>(
      `SELECT id, role FROM users WHERE id = $1`,
      [jobSeekerId]
    );

    if (jobSeekerExists.rowCount === 0) {
      return res
        .status(HttpStatusCode.NOT_FOUND)
        .json({ error: "Job seeker not found" });
    }

    if (jobSeekerExists.rows[0]?.role !== "job_seeker") {
      return res
        .status(HttpStatusCode.FORBIDDEN)
        .json({ error: "Only job seekers can apply to jobs" });
    }

    const existingApplication = await pool.query(
      `SELECT id FROM applications WHERE job_id = $1 AND job_seeker_id = $2`,
      [jobId, jobSeekerId]
    );

    if (existingApplication.rows.length > 0) {
      return res
        .status(HttpStatusCode.BAD_REQUEST)
        .json({ error: "You have already applied to this job" });
    }

    const result = await pool.query<ApplicationRow>(
      `INSERT INTO applications ( job_id, job_seeker_id, status, score, applied_at)
       VALUES ($1, $2, 'Applied', 0, NOW())
       RETURNING *`,
      [jobId, jobSeekerId]
    );

    const application = result.rows[0];
    if (!application) throw new Error("Application insert returned no row");
    await updateHighestMatchNotification(recruiterId);

    res.status(HttpStatusCode.CREATED).json({
      message: "Application submitted successfully",
      application,
    });

    processApplication(
      application.id,
      jobId,
      jobSeekerId,
      recruiterId
    ).catch((error) => {
      console.error(
        `Error processing application ${application.id}:`,
        error
      );
    });
  } catch (error) {
    next(error);
  }
};

async function processApplication(
  applicationId: string,
  jobId: string,
  jobSeekerId: string,
  recruiterId: string
) {
  try {
    // Fetch vectors
    const [jobSeekerVector, jobVector] = await Promise.all([
      fetchVector(jobSeekerId, "job_seeker"),
      fetchVector(jobId, "job"),
    ]);

    if (!jobSeekerVector || !jobVector) {
      console.error(
        `Could not retrieve embeddings for application ${applicationId}`
      );
      return;
    }

    // Calculate match score
    const matchScore = cosineSimilarity(jobSeekerVector, jobVector);

    // Update application with calculated score
    await pool.query(`UPDATE applications SET score = $1 WHERE id = $2`, [
      matchScore,
      applicationId,
    ]);

    // Update highest match notification
    await updateHighestMatchNotification(recruiterId);

    console.log(
      `Application ${applicationId} processed with score: ${matchScore}`
    );
  } catch (error) {
    console.error(
      `Error processing application score for ${applicationId}:`,
      error
    );
  }
}

const getAllApplications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = jobIdParamSchema.parse(req.params);
    if (!req.user || req.user.role !== "recruiter") {
      return res
        .status(HttpStatusCode.FORBIDDEN)
        .json({ error: "Only recruiters can view applications" });
    }
    if (!jobId) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        error: "Job ID is required to fetch applications",
      });
    }
    const applications = await pool.query<ApplicationRow & { job_seeker_name: string }>(
      `SELECT 
      a.id,
      a.job_seeker_id,
      a.job_id,
      u.full_name AS job_seeker_name,
      a.score,
      a.status,
      a.applied_at
      FROM 
      applications a
      INNER JOIN users u ON a.job_seeker_id = u.id
      WHERE a.job_id = $1
      `,
      [jobId]
    );
    res.status(HttpStatusCode.OK).json({ applications: applications.rows });
  } catch (error) {
    next(error);
  }
};

const updateHighestMatchNotification = async (recruiterId: string) => {
  try {
    const jobs = await pool.query<{ id: string; job_title: string }>(
      "SELECT id, job_title FROM jobs WHERE recruiter_id = $1",
      [recruiterId]
    );
    if (jobs.rowCount === 0) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "No jobs found for this recruiter.",
        true
      );
    }

    const jobIds = jobs.rows.map((job) => job.id);
    const highestMatch = await pool.query<{ job_id: string; job_seeker_id: string; score: number }>(
      "SELECT a.job_id, a.job_seeker_id, a.score FROM applications a WHERE a.job_id = ANY($1) ORDER BY a.score DESC LIMIT 1",
      [jobIds]
    );

    if (highestMatch.rowCount === 0) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "No applications found for these jobs.",
        true
      );
    }

    const { job_id, job_seeker_id, score } = highestMatch.rows[0]!;

    const jobSeekerName = await pool.query<{ full_name: string }>(
      "SELECT full_name FROM users WHERE id = $1",
      [job_seeker_id]
    );

    if (jobSeekerName.rowCount === 0) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "Job seeker not found.",
        true
      );
    }

    const existingNotification = await pool.query<{ id: string }>(
      "SELECT id FROM notifications WHERE user_id = $1 AND heading = 'Top Match!'",
      [recruiterId]
    );

    const job = jobs.rows.find((job) => job.id === job_id);
    if (!job) throw new Error("Notification job not found");
    const applicantName = jobSeekerName.rows[0]!.full_name;

    const message = `${
      applicantName
    } matched above ${Math.round(score)}% in your active ${
      job.job_title
    } listing. ${
      applicantName.split(" ")[0]
    } appears to be the most suitable candidate for this role based on their skills, tools, and experience.`;

    if (existingNotification.rows.length > 0) {
      await pool.query(
        "UPDATE notifications SET heading = $1, message = $2, priority = $3, applicant_id = $4, job_id = $5 WHERE id = $6",
        [
          "Top Match!",
          message,
          score > 60 ? "high" : "medium",
          job_seeker_id,
          job_id,
          existingNotification.rows[0]!.id,
        ]
      );
    } else {
      await pool.query(
        "INSERT INTO notifications (user_id, heading, message, priority, is_read, applicant_id, job_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          recruiterId,
          "Top Match!",
          message,
          score > 60 ? "high" : "medium",
          false,
          job_seeker_id,
          job_id,
        ]
      );
    }
  } catch (error) {
    console.error("Error updating highest match notification:", error);
  }
};

export { applyToJob,getAllApplications };

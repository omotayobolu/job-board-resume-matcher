import type { Request, Response, NextFunction } from "express";
import { HttpStatusCode, CustomError } from "../utils/error-handler";
import pool from "../db";
import { parseJobDescription } from "../utils/parseResume";
import { embedJob } from "../utils/embed";
import index from "../config/pinecone";
import { createJobSchema, idParamSchema, jobStatusSchema, recruiterIdParamSchema } from "../schemas";
import type { JobDetails, JobRow } from "../types/domain";

const createJob = async (req: Request, res: Response, next: NextFunction) => {
  const recruiter_id = req.user.id;
  try {
    const { job_details } = createJobSchema.parse(req.body as unknown);
    if (!recruiter_id || !job_details) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Recruiter id and job details are required."
      );
    }

    const result = await pool.query<{ id: string }>(
      "INSERT INTO jobs (recruiter_id, job_title, job_description, location, required_skills, job_status, work_type, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING id",
      [
        recruiter_id,
        job_details.job_title,
        job_details.job_description,
        job_details.location,
        job_details.required_skills,
        "active",
        job_details.work_type,
      ]
    );

    const saved = result.rows[0];
    if (!saved) throw new Error("Job insert returned no row");
    const job_id = saved.id;

    res
      .status(HttpStatusCode.CREATED)
      .json({ message: "Job created successfully." });

    processEmbeddings(job_id, job_details).catch((error) => {
      console.error(`Embedding failed for job ${job_id}:`, error);
    });
  } catch (error) {
    next(error);
  }
};

async function processEmbeddings(job_id: string, job_details: JobDetails) {
  const jobDetails = await parseJobDescription(job_details.job_description);
  const complete_job_details = {
    ...job_details,
    responsibilities: jobDetails.responsibilities,
  };
  const embedding = await embedJob(complete_job_details);

  const jobVector = {
    id: job_id,
    values: Array.from(embedding),
    metadata: {
      type: "job",
      title: complete_job_details.job_title || "unknown",
      location: complete_job_details.location || "",
      work_type: complete_job_details.work_type || "",
      status: complete_job_details.job_status || "",
      required_skills: Array.isArray(complete_job_details.required_skills)
        ? complete_job_details.required_skills.join(", ")
        : complete_job_details.required_skills || "",
      responsibilities: Array.isArray(complete_job_details.responsibilities)
        ? complete_job_details.responsibilities
        : [],
    },
  };

  await index.namespace("job").upsert([jobVector]);
}

const getJobs = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user.id;
  try {
    const jobs = await pool.query<Omit<JobRow, "recruiter_id"> & { hasapplied: boolean }>(
      `SELECT
      jobs.id,
      jobs.job_title,
      jobs.job_description,
      jobs.summary,
      jobs.location,
      jobs.required_skills,
      jobs.created_at,
      jobs.work_type,
      jobs.job_status,
      CASE 
        WHEN applications.job_seeker_id = $1 THEN true
      ELSE false
      END AS hasApplied
      FROM jobs
      LEFT JOIN applications
      ON jobs.id = applications.job_id AND applications.job_seeker_id = $1
      ORDER BY jobs.created_at DESC`,
      [userId]
    );
    res.status(HttpStatusCode.OK).json({ jobs: jobs.rows });
  } catch (error) {
    next(error);
  }
};

const getJobsByRecruiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { recruiterId } = recruiterIdParamSchema.parse(req.params);
    if (!recruiterId) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Recruiter ID is required in params.",
        true
      );
    }

    const recruiterCheck = await pool.query<{ id: string; role: string | null }>(
      "SELECT id, role FROM users WHERE id = $1",
      [recruiterId]
    );

    if (recruiterCheck.rowCount === 0) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "Recruiter not found.",
        true
      );
    }

    if (recruiterCheck.rows[0]?.role !== "recruiter") {
      throw new CustomError(
        "FORBIDDEN",
        HttpStatusCode.FORBIDDEN,
        "User is not a recruiter.",
        true
      );
    }

    const jobs = await pool.query<Omit<JobRow, "recruiter_id"> & { applicants_count: string; top_match: number | null }>(
      `SELECT 
      jobs.id,
      jobs.job_title,
      jobs.job_description,
      jobs.summary,
      jobs.location,
      jobs.required_skills,
      jobs.created_at,
      jobs.work_type,
      jobs.job_status,
      COUNT(applications.id) AS applicants_count,
      MAX(applications.score) AS top_match
      FROM jobs
      LEFT JOIN applications
        ON jobs.id = applications.job_id
      WHERE recruiter_id = $1 
      GROUP BY jobs.id, jobs.job_title, jobs.job_description, jobs.location, jobs.required_skills, jobs.created_at
      ORDER BY created_at DESC`,
      [recruiterId]
    );

    res.status(HttpStatusCode.OK).json({ jobs: jobs.rows });
  } catch (error) {
    next(error);
  }
};

const getJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    if (!id) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Job id is required in params.",
        true
      );
    }

    const job = await pool.query<JobRow>("SELECT * FROM jobs WHERE id = $1", [id]);

    if (job.rowCount === 0) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "Job not found",
        true
      );
    }

    res.status(HttpStatusCode.OK).json({ job: job.rows[0] });
  } catch (error) {
    next(error);
  }
};

const updateJobStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const { job_status } = jobStatusSchema.parse(req.body as unknown);
    if (!id || !job_status) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        error: "Job ID and status are required to update job status.",
      });
    }

    const recruiter_id = req.user.id;
    const existingJob = await pool.query<JobRow>(
      "SELECT * FROM jobs WHERE id = $1 AND recruiter_id = $2",
      [id, recruiter_id]
    );

    if (existingJob.rowCount === 0) {
      return res.status(HttpStatusCode.NOT_FOUND).json({
        error: "Job not found.",
      });
    }

    const result = await pool.query<JobRow>(
      "UPDATE jobs SET job_status = $1 WHERE id = $2 RETURNING *",
      [job_status, id]
    );

    res.status(HttpStatusCode.OK).json({
      message: "Job status updated successfully.",
      job: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

const deleteJob = async (req: Request, res: Response, next: NextFunction) => {
  const recruiter_id = req.user.id;
  try {
    const { id } = idParamSchema.parse(req.params);
    if (!id || !recruiter_id) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Job Id and recruiter_id are needed to delete a job post",
        true
      );
    }

    const result = await pool.query<JobRow>(
      "DELETE FROM jobs WHERE id = $1 AND recruiter_id = $2 RETURNING *",
      [id, recruiter_id]
    );

    if (result.rowCount === 0) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "Job not found",
        true
      );
    }

    res.status(HttpStatusCode.OK).json({ message: "Job deleted successfully" });
  } catch (error) {
    next(error);
  }
};

export { createJob,getJobs,getJob,deleteJob,getJobsByRecruiter,updateJobStatus };

const { HttpStatusCode, CustomError } = require("../utils/error-handler");
const pool = require("../db");
const { parseJobDescription } = require("../utils/parseResume");
const { embedJob } = require("../utils/embed");
const index = require("../config/pinecone");

const createJob = async (req, res, next) => {
  const { job_details } = req.body;
  const recruiter_id = req.user.id;
  try {
    if (!recruiter_id || !job_details) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Recruiter id and job details are required."
      );
    }

    const result = await pool.query(
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

    const job_id = result.rows[0].id.toString();

    res
      .status(HttpStatusCode.CREATED)
      .json({ message: "Job created successfully." });

    processEmbeddings(job_id, job_details);
  } catch (error) {
    next(error);
  }
};

async function processEmbeddings(job_id, job_details) {
  try {
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
  } catch (error) {
    console.error("Error processing embeddings:", error);
    next(error);
  }
}

const getJobs = async (req, res, next) => {
  const userId = req.user.id;
  try {
    const jobs = await pool.query(
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
      ON jobs.id = applications.job_id AND applications.job_seeker_id = $1`,
      [userId]
    );
    res.status(HttpStatusCode.OK).json({ jobs: jobs.rows });
  } catch (error) {
    next(error);
  }
};

const getJobsByRecruiter = async (req, res, next) => {
  try {
    const { recruiterId } = req.params;
    if (!recruiterId) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Recruiter ID is required in params.",
        true
      );
    }

    const recruiterCheck = await pool.query(
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

    if (recruiterCheck.rows[0].role !== "recruiter") {
      throw new CustomError(
        "FORBIDDEN",
        HttpStatusCode.FORBIDDEN,
        "User is not a recruiter.",
        true
      );
    }

    const jobs = await pool.query(
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

const getJob = async (req, res, next) => {
  const { id } = req.params;
  try {
    if (!id) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Job id is required in params.",
        true
      );
    }

    const job = await pool.query("SELECT * FROM jobs WHERE id = $1", [id]);

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

const updateJobStatus = async (req, res, next) => {
  const { id } = req.params;
  const { job_status } = req.body;

  try {
    if (!id || !job_status) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        error: "Job ID and status are required to update job status.",
      });
    }

    const recruiter_id = req.user.id;
    const existingJob = await pool.query(
      "SELECT * FROM jobs WHERE id = $1 AND recruiter_id = $2",
      [id, recruiter_id]
    );

    if (existingJob.rowCount === 0) {
      return res.status(HttpStatusCode.NOT_FOUND).json({
        error: "Job not found.",
      });
    }

    const result = await pool.query(
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

const deleteJob = async (req, res, next) => {
  const { id } = req.params;
  const recruiter_id = req.user.id;
  try {
    if (!id || !recruiter_id) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Job Id and recruiter_id are needed to delete a job post",
        true
      );
    }

    const result = await pool.query(
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

module.exports = {
  createJob,
  getJobs,
  getJob,
  deleteJob,
  getJobsByRecruiter,
  updateJobStatus,
};

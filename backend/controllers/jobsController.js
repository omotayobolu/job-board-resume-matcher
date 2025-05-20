const { HttpStatusCode, CustomError } = require("../utils/error-handler");
const pool = require("../db");
const { parseJobDescription } = require("../utils/parseResume");
const { embedJob } = require("../utils/embed");
const index = require("../config/pinecone");

const createJob = async (req, res, next) => {
  const { recruiter_id, job_details } = req.body;
  try {
    if (!recruiter_id || !job_details) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Recruiter id and job details are required."
      );
    }

    const job_responsibilities = await parseJobDescription(
      job_details.job_description
    );
    const complete_job_details = {
      ...job_details,
      responsibilities: job_responsibilities.responsibilities,
    };
    const embedding = await embedJob(complete_job_details);

    const isRecruiter = await pool.query(
      "SELECT id, role FROM users WHERE id = $1",
      [recruiter_id]
    );

    if (isRecruiter.rowCount === 0) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "Recruiter not found",
        true
      );
    }

    if (isRecruiter.rows[0].role !== "recruiter") {
      throw new CustomError(
        "UNAUTHORIZED",
        HttpStatusCode.UNAUTHORIZED,
        "Only recruiters can create jobs",
        true
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
        job_details.job_status,
        job_details.work_type,
      ]
    );

    const job_id = result.rows[0].id.toString();

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

    res
      .status(HttpStatusCode.CREATED)
      .json({ message: "Job created successfully." });
  } catch (error) {
    next(error);
  }
};

const getJobs = async (req, res, next) => {
  try {
    const jobs = await pool.query("SELECT * FROM jobs");
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

const deleteJob = async (req, res, next) => {
  const { id } = req.params;
  const { recruiter_id } = req.body;
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

module.exports = { createJob, getJobs, getJob, deleteJob };

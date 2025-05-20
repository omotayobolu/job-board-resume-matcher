const { HttpStatusCode } = require("../utils/error-handler");
const pool = require("../db");
const { fetchVector } = require("../utils/fetchVector");
const cosineSimilarity = require("../utils/cosineSimilarity");

const applyToJob = async (req, res, next) => {
  try {
    const { jobSeekerId, jobId } = req.body;
    if (!jobId || !jobSeekerId) {
      return res
        .status(HttpStatusCode.BAD_REQUEST)
        .json({ error: "jobId and jobSeekerId are required" });
    }

    const checkJobExists = await pool.query(
      `SELECT id FROM jobs WHERE id = $1`,
      [jobId]
    );

    if (checkJobExists.rowCount === 0) {
      return res
        .status(HttpStatusCode.NOT_FOUND)
        .json({ error: "Job not found" });
    }

    const jobSeekerExists = await pool.query(
      `SELECT id, role FROM users WHERE id = $1`,
      [jobSeekerId]
    );

    if (jobSeekerExists.rowCount === 0) {
      return res
        .status(HttpStatusCode.NOT_FOUND)
        .json({ error: "Job seeker not found" });
    }

    if (jobSeekerExists.rows[0].role !== "job seeker") {
      return res
        .status(HttpStatusCode.FORBIDDEN)
        .json({ error: "Only job seekers can apply to jobs" });
    }

    const jobSeekerVector = await fetchVector(jobSeekerId, "job_seeker");
    const jobVector = await fetchVector(jobId, "job");

    if (!jobSeekerVector || !jobVector) {
      return res
        .status(HttpStatusCode.INTERNAL_SERVER)
        .json({ error: "Could not retrieve embeddings" });
    }

    const matchScore = cosineSimilarity(jobSeekerVector, jobVector);

    const result = await pool.query(
      `INSERT INTO applications ( job_id, job_seeker_id, status, score, applied_at)
       VALUES ($1, $2, 'applied', $3, NOW())
       RETURNING *`,
      [jobId, jobSeekerId, matchScore]
    );

    res.status(HttpStatusCode.CREATED).json({
      message: "Application submitted successfully",
      application: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

const getAllApplications = async (req, res, next) => {
  try {
    const applications = await pool.query("SELECT * FROM applications");
    res.status(HttpStatusCode.OK).json({ applications: applications.rows });
  } catch (error) {
    next(error);
  }
};

module.exports = { applyToJob, getAllApplications };

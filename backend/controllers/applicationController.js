const { HttpStatusCode, CustomError } = require("../utils/error-handler");
const pool = require("../db");
const { fetchVector } = require("../utils/fetchVector");
const cosineSimilarity = require("../utils/cosineSimilarity");

const applyToJob = async (req, res, next) => {
  try {
    const { jobId } = req.body;
    const jobSeekerId = req.user.id;
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

    const recruiterId = checkJobExists.rows[0].recruiter_id;

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

    await updateHighestMatchNotification(recruiterId);

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
    const { jobId } = req.params;
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
    const applications = await pool.query(
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

const updateHighestMatchNotification = async (recruiterId) => {
  try {
    const jobs = await pool.query(
      "SELECT id FROM jobs WHERE recruiter_id = $1",
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
    const highestMatch = await pool.query(
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

    const { job_id, job_seeker_id, score } = highestMatch.rows[0];

    const jobSeekerName = await pool.query(
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

    const existingNotification = await pool.query(
      "SELECT id FROM notifications WHERE user_id = $1 AND heading = 'Top Match!'",
      [recruiterId]
    );

    const job = jobs.rows.find((job) => job.id === job_id);

    const message = `${
      jobSeekerName.rows[0].full_name
    } matched above ${Math.round(score)}% in your active ${
      job.job_title
    } listing. ${
      jobSeekerName.rows[0].full_name.split(" ")[0]
    } appears to be the most suitable candidate for this role based on their skills, tools, and experience.`;

    if (existingNotification.rowCount > 0) {
      await pool.query(
        "UPDATE notifications SET heading = $1, message = $2, priority = $3, applicant_id = $4, job_id = $5 WHERE id = $6",
        [
          "Top Match!",
          message,
          score > 60 ? "high" : "medium",
          job_seeker_id,
          job_id,
          existingNotification.rows[0].id,
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

module.exports = { applyToJob, getAllApplications };

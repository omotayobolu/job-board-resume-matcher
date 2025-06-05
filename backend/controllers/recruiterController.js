const { HttpStatusCode, CustomError } = require("../utils/error-handler");
const pool = require("../db");
const { embedQuestion } = require("../utils/embed");
const index = require("../config/pinecone");

const createRecruiterProfile = async (req, res, next) => {
  const { user_id, company_name, type_of_organization, location } = req.body;
  try {
    if (!user_id || !company_name || !type_of_organization || !location) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Company Name, type of organization and location are required",
        true
      );
    }

    const userCheck = await pool.query(
      "SELECT id, role FROM users WHERE id = $1",
      [user_id]
    );

    if (userCheck.rowCount === 0) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "User with the given ID does not exist.",
        true
      );
    }

    const user = userCheck.rows[0];

    if (user.role === "job seeker") {
      throw new CustomError(
        "UNAUTHORIZED",
        HttpStatusCode.UNAUTHORIZED,
        "Job seekers cannot create a recruiter profile.",
        true
      );
    }

    const result = await pool.query(
      "INSERT INTO recruiter (user_id, company_name, type_of_organization, location, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *",
      [user_id, company_name, type_of_organization, location]
    );

    await pool.query("UPDATE users SET hasProfile = true WHERE id = $1", [
      user_id,
    ]);

    console.log(result);

    const recruiter = result.rows[0];
    res
      .status(HttpStatusCode.OK)
      .json({ recruiter, message: "Profile created successfully" });
  } catch (error) {
    next(error);
  }
};

const queryApplications = async (req, res, next) => {
  const { recruiterId, question, jobId } = req.body;
  try {
    if (!recruiterId || !question) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Recruiter id, job id and a question are needed to query a resume",
        true
      );
    }

    const checkRecruiter = await pool.query(
      "SELECT * FROM users WHERE id = $1",
      [recruiterId]
    );

    if (checkRecruiter.rowCount === 0) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "No recuiter with this id"
      );
    }

    const recruiter = checkRecruiter.rows[0];

    if (recruiter.role === "job seeker") {
      throw new CustomError(
        "UNAUTHORIZED",
        HttpStatusCode.UNAUTHORIZED,
        "Job seekers cannot query applications",
        true
      );
    }

    const checkJob = await pool.query("SELECT id FROM jobs where id = $1", [
      jobId,
    ]);

    if (checkJob.rowCount === 0) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "No job found with the provided jobId",
        true
      );
    }

    const embeddedQuestion = await embedQuestion(question);

    const results = await index.namespace("job_seeker").query({
      vector: Array.from(embeddedQuestion),
      topK: 10,
      includeMetadata: true,
    });

    const appliedJobseekersId = await pool.query(
      "SELECT job_seeker_id FROM applications where job_id = $1",
      [jobId]
    );

    const appliedIds = appliedJobseekersId.rows.map((row) => row.job_seeker_id);

    const appliedJobseekers = results.matches.filter((r) =>
      appliedIds.includes(r.id)
    );

    console.log("Applied job seekers ", appliedJobseekers);

    const context = appliedJobseekers
      .map(
        (r, i) =>
          `${i + 1}. ${r.metadata.name}:\n${r.metadata.job_experience_details}`
      )
      .join("\n\n");

    const prompt = `
        You are an expert recruiter assistant. Based on the resumes below, answer the question:

        Question: ${question}

        Resumes:
        ${context}

        When answering, always include the names of the applicants mentioned in the resumes and provide a clear and concise response to the question.
        `;

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4-turbo",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        }),
      }
    );

    const data = await response.json();

    console.log("Data", data);
    const answer = data.choices[0].message.content;

    res.status(HttpStatusCode.OK).json({ answer });
  } catch (error) {
    next(error);
  }
};

module.exports = { createRecruiterProfile, queryApplications };

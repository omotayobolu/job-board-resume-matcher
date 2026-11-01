import type { Request, Response, NextFunction } from "express";
import { HttpStatusCode, CustomError } from "../utils/error-handler";
import pool from "../db";
import { embedQuestion } from "../utils/embed";
import { vectorLiteral } from "../utils/vector";
import { recruiterProfileSchema, recruiterQuestionSchema, jobIdParamSchema, completionSchema } from "../schemas";
import { requiredEnv } from "../env";
import type { RecruiterProfileRow } from "../types/domain";

const createRecruiterProfile = async (req: Request, res: Response, next: NextFunction) => {
  const user_id = req.user.id;
  try {
    const { company_name, type_of_organization, location } = recruiterProfileSchema.parse(req.body as unknown);
    if (!user_id || !company_name || !type_of_organization || !location) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Company Name, type of organization and location are required",
        true
      );
    }

    const userCheck = await pool.query<{ id: string; role: string | null }>(
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

    if (user?.role !== "recruiter") {
      throw new CustomError(
        "UNAUTHORIZED",
        HttpStatusCode.UNAUTHORIZED,
        "Job seekers cannot create a recruiter profile.",
        true
      );
    }

    const result = await pool.query<RecruiterProfileRow>(
      "INSERT INTO recruiter (user_id, company_name, type_of_organization, location, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *",
      [user_id, company_name, type_of_organization, location]
    );

    await pool.query("UPDATE users SET hasprofile = true WHERE id = $1", [
      user_id,
    ]);

    const recruiter = result.rows[0];
    res
      .status(HttpStatusCode.OK)
      .json({ recruiter, message: "Profile created successfully" });
  } catch (error) {
    next(error);
  }
};

const queryApplications = async (req: Request, res: Response, next: NextFunction) => {
  const recruiterId = req.user.id;
  try {
    const { question } = recruiterQuestionSchema.parse(req.body as unknown);
    const { jobId } = jobIdParamSchema.parse(req.params);
    if (!recruiterId || !question) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Recruiter id, job id and a question are needed to query a resume",
        true
      );
    }

    const checkRecruiter = await pool.query<{ id: string; role: string | null }>(
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

    if (recruiter?.role !== "recruiter") {
      throw new CustomError(
        "UNAUTHORIZED",
        HttpStatusCode.UNAUTHORIZED,
        "Job seekers cannot query applications",
        true
      );
    }

    const checkJob = await pool.query(
      "SELECT id FROM jobs WHERE id = $1 AND recruiter_id = $2",
      [jobId, recruiterId]
    );

    if (checkJob.rowCount === 0) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "No job found with the provided jobId",
        true
      );
    }

    const embeddedQuestion = vectorLiteral(await embedQuestion(question));
    const applicants = await pool.query<{
      name: string;
      work_experience: unknown;
    }>(
      `SELECT COALESCE(NULLIF(js.parsed_resume->>'name', ''), u.full_name, 'Unknown') AS name,
              js.parsed_resume->'work_experience' AS work_experience
       FROM applications AS a
       JOIN job_seeker AS js ON js.user_id = a.job_seeker_id
       JOIN users AS u ON u.id = a.job_seeker_id
       WHERE a.job_id = $1
         AND js.embedding IS NOT NULL
         AND js.parsed_resume IS NOT NULL
       ORDER BY js.embedding <=> $2::vector
       LIMIT 10`,
      [jobId, embeddedQuestion]
    );

    const context = applicants.rows
      .map(
        (r, i) =>
          `${i + 1}. ${r.name}:\n${JSON.stringify(r.work_experience ?? [])}`
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
          Authorization: `Bearer ${requiredEnv("OPENROUTER_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4-turbo",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        }),
      }
    );

    if (!response.ok) throw new Error("OpenRouter request failed");
    const data: unknown = await response.json();
    const answer = completionSchema.parse(data).choices[0]!.message.content;

    res.status(HttpStatusCode.OK).json({ answer });
  } catch (error) {
    next(error);
  }
};

export { createRecruiterProfile,queryApplications };

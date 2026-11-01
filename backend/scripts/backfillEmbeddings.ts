import "dotenv/config";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import pool from "../db";
import { s3 } from "../config/s3";
import { requiredEnv } from "../env";
import { embedJob, embedResume } from "../utils/embed";
import { parseResumeFile } from "../utils/parseResume";
import { vectorLiteral } from "../utils/vector";
import { resumeOutputSchema } from "../schemas";
import type { JobDetails } from "../types/domain";

type JobToBackfill = JobDetails & { id: string };
type ResumeToBackfill = {
  user_id: string;
  resume_s3_key: string | null;
  parsed_resume: unknown;
};

async function backfillJobs(): Promise<number> {
  let failures = 0;
  const jobs = await pool.query<JobToBackfill>(
    `SELECT id, job_title, job_description, location, required_skills,
            work_type, job_status
     FROM jobs WHERE embedding IS NULL`
  );
  for (const job of jobs.rows) {
    try {
      const embedding = vectorLiteral(await embedJob(job));
      await pool.query("UPDATE jobs SET embedding = $1::vector WHERE id = $2", [
        embedding,
        job.id,
      ]);
      console.log(`Backfilled job ${job.id}`);
    } catch (error) {
      failures += 1;
      console.error(`Could not backfill job ${job.id}:`, error);
    }
  }
  return failures;
}

async function backfillResumes(): Promise<number> {
  let failures = 0;
  const resumes = await pool.query<ResumeToBackfill>(
    `SELECT user_id, resume_s3_key, parsed_resume
     FROM job_seeker
     WHERE (embedding IS NULL OR parsed_resume IS NULL)
       AND (resume_s3_key IS NOT NULL OR parsed_resume IS NOT NULL)
       AND resume_processing_status <> 'processing'`
  );
  for (const resume of resumes.rows) {
    try {
      let parsedResume;
      if (resume.parsed_resume) {
        parsedResume = resumeOutputSchema.parse(resume.parsed_resume);
      } else {
        if (!resume.resume_s3_key) throw new Error("Resume has no S3 key");
        const object = await s3.send(new GetObjectCommand({
          Bucket: requiredEnv("S3_BUCKET_NAME"),
          Key: resume.resume_s3_key,
        }));
        if (!object.Body) throw new Error("S3 object has no body");
        const buffer = Buffer.from(await object.Body.transformToByteArray());
        const mimeType = object.ContentType
          ?? (resume.resume_s3_key.toLowerCase().endsWith(".pdf")
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        parsedResume = await parseResumeFile(buffer, mimeType);
      }
      const embedding = vectorLiteral(await embedResume(parsedResume));
      const updated = await pool.query(
        `UPDATE job_seeker
         SET embedding = $1::vector, parsed_resume = $2::jsonb,
             resume_processing_status = 'completed',
             resume_processing_token = NULL
         WHERE user_id = $3 AND resume_processing_status <> 'processing'`,
        [embedding, JSON.stringify(parsedResume), resume.user_id]
      );
      if (updated.rowCount) console.log(`Backfilled resume for user ${resume.user_id}`);
    } catch (error) {
      failures += 1;
      console.error(`Could not backfill resume for user ${resume.user_id}:`, error);
    }
  }
  const unavailable = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM job_seeker
     WHERE embedding IS NULL AND resume_s3_key IS NULL AND parsed_resume IS NULL`
  );
  console.log(`${unavailable.rows[0]?.count ?? "0"} resumes have no S3 key and need a new upload`);
  return failures;
}

async function main(): Promise<void> {
  try {
    const failures = await backfillJobs() + await backfillResumes();
    const result = await pool.query(
      `UPDATE applications AS a
       SET score = 1 - (js.embedding <=> j.embedding)
       FROM job_seeker AS js, jobs AS j
       WHERE js.user_id = a.job_seeker_id
         AND j.id = a.job_id
         AND js.embedding IS NOT NULL
         AND j.embedding IS NOT NULL`
    );
    console.log(`Updated ${result.rowCount ?? 0} application scores`);
    if (failures > 0) {
      console.error(`${failures} embeddings could not be backfilled`);
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Embedding backfill failed:", error);
  process.exitCode = 1;
});

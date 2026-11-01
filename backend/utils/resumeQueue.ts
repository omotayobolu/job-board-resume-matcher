import { randomUUID } from "node:crypto";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import type { PoolClient } from "pg";
import type { PgBoss, Db, JobStates } from "pg-boss" with { "resolution-mode": "import" };
import pool from "../db";
import { s3 } from "../config/s3";
import { requiredEnv } from "../env";
import { resumeOutputSchema } from "../schemas";
import { embedResume } from "./embed";
import { errorHandler } from "./error-handler";
import { parseResumeFile } from "./parseResume";
import { vectorLiteral } from "./vector";

const QUEUE = "resume-processing";
const RETRY_LIMIT = 2;
type ResumeJob = { profileId: string };
type ProfileToProcess = {
  id: string;
  user_id: string;
  resume_s3_key: string | null;
  parsed_resume: unknown;
  has_embedding: boolean;
};

let boss: PgBoss | null = null;

function getBoss(): PgBoss {
  if (!boss) throw new Error("Resume queue is not ready");
  return boss;
}

function transactionDb(client: PoolClient): Db {
  return { executeSql: (text, values) => client.query(text, values) };
}

async function enqueue(client: PoolClient, profileId: string): Promise<string> {
  const id = await getBoss().send(QUEUE, { profileId }, { db: transactionDb(client) });
  if (!id) throw new Error("Could not enqueue resume processing");
  return id;
}

async function jobState(jobId: string): Promise<keyof JobStates | null> {
  const jobs = await getBoss().findJobs<ResumeJob>(QUEUE, { id: jobId });
  return jobs[0]?.state ?? null;
}

async function processResumeJob(job: { id: string; data: ResumeJob; retryCount: number }): Promise<void> {
  const token = randomUUID();
  const claimed = await pool.query<ProfileToProcess>(
    `UPDATE job_seeker
     SET resume_processing_status = 'processing', resume_processing_token = $3
     WHERE id = $1 AND resume_job_id = $2
       AND resume_processing_status <> 'completed'
     RETURNING id, user_id, resume_s3_key, parsed_resume,
               embedding IS NOT NULL AS has_embedding`,
    [job.data.profileId, job.id, token],
  );
  const profile = claimed.rows[0];
  if (!profile) return; // Already completed or superseded by a newer job.

  try {
    if (!profile.has_embedding || !profile.parsed_resume) {
      let parsedResume;
      if (profile.parsed_resume) {
        parsedResume = resumeOutputSchema.parse(profile.parsed_resume);
      } else {
        if (!profile.resume_s3_key) throw new Error("Resume has no S3 key");
        const object = await s3.send(new GetObjectCommand({
          Bucket: requiredEnv("S3_BUCKET_NAME"),
          Key: profile.resume_s3_key,
        }));
        if (!object.Body) throw new Error("S3 resume has no body");
        const buffer = Buffer.from(await object.Body.transformToByteArray());
        const mimeType = object.ContentType
          ?? (profile.resume_s3_key.toLowerCase().endsWith(".pdf")
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        parsedResume = await parseResumeFile(buffer, mimeType);
      }

      const embedding = vectorLiteral(await embedResume(parsedResume));
      const saved = await pool.query(
        `UPDATE job_seeker
         SET parsed_resume = $1::jsonb, embedding = $2::vector
         WHERE id = $3 AND resume_job_id = $4 AND resume_processing_token = $5`,
        [JSON.stringify(parsedResume), embedding, profile.id, job.id, token],
      );
      if (saved.rowCount === 0) return;
    }

    await pool.query(
      `UPDATE applications AS a
       SET score = 1 - (js.embedding <=> j.embedding)
       FROM job_seeker AS js, jobs AS j
       WHERE a.job_seeker_id = $1
         AND js.user_id = a.job_seeker_id
         AND j.id = a.job_id
         AND js.embedding IS NOT NULL
         AND j.embedding IS NOT NULL`,
      [profile.user_id],
    );
    await pool.query(
      `UPDATE job_seeker
       SET resume_processing_status = 'completed', resume_processing_token = NULL
       WHERE id = $1 AND resume_job_id = $2 AND resume_processing_token = $3`,
      [profile.id, job.id, token],
    );
  } catch (error) {
    errorHandler.handleError(error);
    await pool.query(
      `UPDATE job_seeker
       SET resume_processing_status = $4, resume_processing_token = NULL
       WHERE id = $1 AND resume_job_id = $2 AND resume_processing_token = $3`,
      [profile.id, job.id, token, job.retryCount >= RETRY_LIMIT ? "failed" : "pending"],
    );
    throw error; // pg-boss applies retry/backoff and records terminal failure.
  }
}

async function enqueueUnqueuedProfiles(): Promise<void> {
  while (await pool.transaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM job_seeker
       WHERE resume_job_id IS NULL
         AND (resume_s3_key IS NOT NULL OR parsed_resume IS NOT NULL)
         AND resume_processing_status IN ('pending', 'processing')
       ORDER BY created_at NULLS LAST, id
       FOR UPDATE SKIP LOCKED LIMIT 1`,
    );
    const profile = result.rows[0];
    if (!profile) return false;
    const jobId = await enqueue(client, profile.id);
    await client.query(
      `UPDATE job_seeker
       SET resume_job_id = $1, resume_processing_status = 'pending',
           resume_processing_token = NULL
       WHERE id = $2`,
      [jobId, profile.id],
    );
    return true;
  })) { /* Recover profiles saved by the previous worker. */ }
}

async function start(): Promise<void> {
  // pg-boss is ESM; this dynamic import works in the backend's CommonJS build.
  const { PgBoss } = await import("pg-boss");
  const instance = new PgBoss({ connectionString: requiredEnv("DATABASE_URL") });
  instance.on("error", (error) => errorHandler.handleError(error));
  await instance.start();
  await instance.createQueue(QUEUE, {
    retryLimit: RETRY_LIMIT,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 1800,
    heartbeatSeconds: 60,
  });
  boss = instance;
  await enqueueUnqueuedProfiles();
  await instance.work<ResumeJob>(QUEUE, async ([job]) => {
    if (job) await processResumeJob(job);
  });
}

async function stop(): Promise<void> {
  if (boss) await boss.stop();
  boss = null;
}

export const resumeQueue = { enqueue, jobState, start, stop };

import type { PoolClient } from "pg";
import type { PgBoss, Db } from "pg-boss" with { "resolution-mode": "import" };
import pool from "../db";
import type { JobDetails } from "../types/domain";
import { parseJobDescription } from "./parseResume";
import { embedJob } from "./embed";
import { vectorLiteral } from "./vector";
import { errorHandler } from "./error-handler";
import { getQueueBoss, queuePolicy, startQueueBoss, stopQueueBoss } from "./queueBoss";

const QUEUE = "job-embedding";
type EmbeddingJob = { jobId: string };
type JobToEmbed = JobDetails & { id: string; has_embedding: boolean };

function getBoss(): PgBoss {
  try {
    return getQueueBoss();
  } catch {
    throw new Error("Job embedding queue is not ready");
  }
}

async function enqueue(client: PoolClient, jobId: string): Promise<string> {
  const db: Db = { executeSql: (text, values) => client.query(text, values) };
  const id = await getBoss().send(QUEUE, { jobId }, { db });
  if (!id) throw new Error("Could not enqueue job embedding");
  return id;
}

export async function processJobEmbedding(job: { data: EmbeddingJob; retryCount: number }): Promise<void> {
  const { jobId } = job.data;
  try {
    await pool.query("UPDATE jobs SET embedding_status = 'processing' WHERE id = $1", [jobId]);
    const exists = await pool.transaction(async (client) => {
      // Serialize duplicate deliveries for this job, including the AI work.
      const result = await client.query<JobToEmbed>(
        `SELECT id, job_title, job_description, location, required_skills, work_type,
                job_status, embedding IS NOT NULL AS has_embedding
         FROM jobs WHERE id = $1 FOR UPDATE`, [jobId],
      );
      const row = result.rows[0];
      if (!row) return false; // The recruiter may have deleted the job.
      if (!row.has_embedding) {
        const parsed = await parseJobDescription(row.job_description);
        const embedding = vectorLiteral(await embedJob({ ...row, responsibilities: parsed.responsibilities }));
        await client.query(
          "UPDATE jobs SET embedding = $1::vector, summary = $2 WHERE id = $3",
          [embedding, parsed.summary, jobId],
        );
      }
      return true;
    });
    if (!exists) return;

    // Keep the saved vector if scoring fails so retries do not repeat AI calls.
    await pool.transaction(async (client) => {
      await client.query(
        `UPDATE applications AS a
         SET score = 1 - (js.embedding <=> j.embedding)
         FROM job_seeker AS js, jobs AS j
         WHERE a.job_id = $1 AND j.id = a.job_id
           AND js.user_id = a.job_seeker_id
           AND js.embedding IS NOT NULL AND j.embedding IS NOT NULL`, [jobId],
      );
      await client.query("UPDATE jobs SET embedding_status = 'completed' WHERE id = $1", [jobId]);
    });
  } catch (error) {
    errorHandler.handleError(error);
    await pool.query("UPDATE jobs SET embedding_status = $1 WHERE id = $2", [
      job.retryCount >= queuePolicy.retryLimit ? "failed" : "pending", jobId,
    ]);
    throw error;
  }
}

async function enqueueUnqueuedJobs(): Promise<void> {
  while (await pool.transaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM jobs WHERE embedding_job_id IS NULL
         AND embedding_status IN ('pending', 'processing')
       ORDER BY created_at NULLS LAST, id FOR UPDATE SKIP LOCKED LIMIT 1`,
    );
    const row = result.rows[0];
    if (!row) return false;
    const id = await enqueue(client, row.id);
    await client.query(
      "UPDATE jobs SET embedding_job_id = $1, embedding_status = 'pending' WHERE id = $2", [id, row.id],
    );
    return true;
  })) { /* Recover jobs created before queue-backed processing. */ }
}

async function start(): Promise<void> {
  const instance = await startQueueBoss();
  await instance.createQueue(QUEUE, queuePolicy);
  await enqueueUnqueuedJobs();
  await instance.work<EmbeddingJob>(QUEUE, async ([job]) => {
    if (job) await processJobEmbedding(job);
  });
}

async function stop(): Promise<void> {
  await stopQueueBoss();
}

export const jobEmbeddingQueue = { enqueue, start, stop };

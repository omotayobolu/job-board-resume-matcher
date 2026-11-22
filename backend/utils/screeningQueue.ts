import { randomUUID } from "node:crypto";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import type { PoolClient } from "pg";
import type { Db } from "pg-boss" with { "resolution-mode": "import" };
import { s3 } from "../config/s3";
import pool from "../db";
import { requiredEnv } from "../env";
import { resumeOutputSchema } from "../schemas";
import { embedResume } from "./embed";
import { errorHandler } from "./error-handler";
import { parseResumeFile } from "./parseResume";
import { getQueueBoss, queuePolicy, startQueueBoss, stopQueueBoss } from "./queueBoss";
import { vectorLiteral } from "./vector";

const QUEUE = "screening-cv";

export type ScreeningCvJob = {
  candidateId: string;
  screeningId: string;
  batchFileId: string;
};

type ClaimedCandidate = {
  id: string;
  resume_s3_key: string | null;
  parsed_resume: unknown;
  has_embedding: boolean;
};

type ScreeningState = {
  score: number | null;
  has_candidate_embedding: boolean;
  has_job_embedding: boolean;
};

class JobEmbeddingNotReady extends Error {
  constructor() {
    super("Job embedding is not ready");
    this.name = "JobEmbeddingNotReady";
  }
}

class CandidateStillProcessing extends Error {
  constructor() {
    super("Candidate resume is still processing");
    this.name = "CandidateStillProcessing";
  }
}

function transactionDb(client: PoolClient): Db {
  return { executeSql: (text, values) => client.query(text, values) };
}

async function enqueue(client: PoolClient, payload: ScreeningCvJob): Promise<string> {
  const id = await getQueueBoss().send(QUEUE, payload, { db: transactionDb(client) });
  if (!id) throw new Error("Could not enqueue screening");
  return id;
}

async function loadCandidate(candidateId: string): Promise<ClaimedCandidate | undefined> {
  const result = await pool.query<ClaimedCandidate>(
    `SELECT id, resume_s3_key, parsed_resume, embedding IS NOT NULL AS has_embedding
     FROM candidates WHERE id = $1`,
    [candidateId],
  );
  return result.rows[0];
}

async function ensureParsed(job: { id: string; data: ScreeningCvJob; retryCount: number }): Promise<void> {
  const existing = await loadCandidate(job.data.candidateId);
  if (!existing) return;
  if (existing.parsed_resume && existing.has_embedding) return;

  const token = randomUUID();
  const claimed = await pool.query<ClaimedCandidate>(
    `UPDATE candidates
     SET processing_status = 'processing', processing_token = $3
     WHERE id = $1 AND processing_job_id = $2
       AND processing_status <> 'completed'
     RETURNING id, resume_s3_key, parsed_resume, embedding IS NOT NULL AS has_embedding`,
    [job.data.candidateId, job.id, token],
  );
  const candidate = claimed.rows[0];
  if (!candidate) {
    const again = await loadCandidate(job.data.candidateId);
    if (again?.parsed_resume && again.has_embedding) return;
    throw new CandidateStillProcessing();
  }

  try {
    let parsed = candidate.parsed_resume
      ? resumeOutputSchema.parse(candidate.parsed_resume)
      : null;
    if (!parsed) {
      if (!candidate.resume_s3_key) throw new Error("Resume has no S3 key");
      const object = await s3.send(new GetObjectCommand({
        Bucket: requiredEnv("S3_BUCKET_NAME"),
        Key: candidate.resume_s3_key,
      }));
      if (!object.Body) throw new Error("S3 resume has no body");
      const buffer = Buffer.from(await object.Body.transformToByteArray());
      const mimeType = object.ContentType
        ?? (candidate.resume_s3_key.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      // parseResumeFile already accepts PDF and DOCX, so DOCX needs no extra extractor.
      parsed = await parseResumeFile(buffer, mimeType);
      const savedParse = await pool.query(
        `UPDATE candidates
         SET parsed_resume = $1::jsonb,
             full_name = NULLIF(btrim($2), ''),
             email = NULLIF(btrim($3), ''),
             phone = NULLIF(btrim($4), '')
         WHERE id = $5 AND processing_job_id = $6 AND processing_token = $7`,
        [JSON.stringify(parsed), parsed.name, parsed.email, parsed.phone, candidate.id, job.id, token],
      );
      if (savedParse.rowCount === 0) return;
    }

    const embedding = vectorLiteral(await embedResume(parsed));
    const saved = await pool.query(
      `UPDATE candidates
       SET embedding = $1::vector, processing_status = 'completed', processing_token = NULL
       WHERE id = $2 AND processing_job_id = $3 AND processing_token = $4`,
      [embedding, candidate.id, job.id, token],
    );
    if (saved.rowCount === 0) return;
  } catch (error) {
    await pool.query(
      `UPDATE candidates
       SET processing_status = $4, processing_token = NULL
       WHERE id = $1 AND processing_job_id = $2 AND processing_token = $3`,
      [candidate.id, job.id, token, job.retryCount >= queuePolicy.retryLimit ? "failed" : "pending"],
    );
    throw error;
  }
}

async function scoreReadyScreenings(candidateId: string): Promise<void> {
  await pool.query(
    `UPDATE screenings AS s
     SET score = GREATEST(0, 1 - (c.embedding <=> j.embedding))
     FROM candidates AS c, jobs AS j
     WHERE s.candidate_id = $1
       AND c.id = s.candidate_id
       AND j.id = s.job_id
       AND s.score IS NULL
       AND c.embedding IS NOT NULL
       AND j.embedding IS NOT NULL`,
    [candidateId],
  );
}

async function screeningState(screeningId: string): Promise<ScreeningState | undefined> {
  const result = await pool.query<ScreeningState>(
    `SELECT s.score,
            c.embedding IS NOT NULL AS has_candidate_embedding,
            j.embedding IS NOT NULL AS has_job_embedding
     FROM screenings s
     JOIN candidates c ON c.id = s.candidate_id
     JOIN jobs j ON j.id = s.job_id
     WHERE s.id = $1`,
    [screeningId],
  );
  return result.rows[0];
}

// Move a file to a terminal status once. A second delivery must not bump counters again.
async function finishBatchFile(fileId: string, status: "completed" | "failed"): Promise<void> {
  const updated = await pool.query<{ batch_id: string }>(
    `UPDATE upload_batch_files
     SET status = $2
     WHERE id = $1 AND status IN ('pending', 'processing')
     RETURNING batch_id`,
    [fileId, status],
  );
  const batchId = updated.rows[0]?.batch_id;
  if (!batchId) return;

  if (status === "completed") {
    await pool.query(
      `UPDATE upload_batches
       SET processed_files = processed_files + 1,
           status = CASE
             WHEN processed_files + 1 + failed_files + skipped_files >= total_files THEN 'completed'
             ELSE 'processing'
           END,
           completed_at = CASE
             WHEN processed_files + 1 + failed_files + skipped_files >= total_files THEN COALESCE(completed_at, now())
             ELSE completed_at
           END
       WHERE id = $1`,
      [batchId],
    );
    return;
  }

  await pool.query(
    `UPDATE upload_batches
     SET failed_files = failed_files + 1,
         status = CASE
           WHEN processed_files + failed_files + 1 + skipped_files >= total_files THEN 'completed'
           ELSE 'processing'
         END,
         completed_at = CASE
           WHEN processed_files + failed_files + 1 + skipped_files >= total_files THEN COALESCE(completed_at, now())
           ELSE completed_at
         END
     WHERE id = $1`,
    [batchId],
  );
}

async function finishScoredFiles(candidateId: string): Promise<void> {
  const files = await pool.query<{ id: string }>(
    `SELECT f.id
     FROM upload_batch_files f
     JOIN screenings s ON s.id = f.screening_id
     WHERE s.candidate_id = $1
       AND s.score IS NOT NULL
       AND f.status IN ('pending', 'processing')`,
    [candidateId],
  );
  for (const file of files.rows) {
    await finishBatchFile(file.id, "completed");
  }
}

async function releaseFile(fileId: string): Promise<void> {
  await pool.query(
    `UPDATE upload_batch_files
     SET status = 'pending'
     WHERE id = $1 AND status = 'processing'`,
    [fileId],
  );
}

export async function processScreeningCv(job: { id: string; data: ScreeningCvJob; retryCount: number }): Promise<void> {
  const file = await pool.query<{ status: string }>(
    `SELECT status FROM upload_batch_files WHERE id = $1`,
    [job.data.batchFileId],
  );
  const status = file.rows[0]?.status;
  if (!status || status === "completed" || status === "skipped" || status === "failed") return;

  await pool.query(
    `UPDATE upload_batch_files SET status = 'processing' WHERE id = $1 AND status = 'pending'`,
    [job.data.batchFileId],
  );
  await pool.query(
    `UPDATE upload_batches SET status = 'processing'
     WHERE id = (SELECT batch_id FROM upload_batch_files WHERE id = $1)
       AND status = 'pending'`,
    [job.data.batchFileId],
  );

  try {
    await ensureParsed(job);
    await scoreReadyScreenings(job.data.candidateId);
    const state = await screeningState(job.data.screeningId);
    if (!state) return;
    if (state.score === null) {
      // Parsed data stays on the candidate. The next attempt only scores.
      throw new JobEmbeddingNotReady();
    }
    await finishScoredFiles(job.data.candidateId);
  } catch (error) {
    if (!(error instanceof JobEmbeddingNotReady) && !(error instanceof CandidateStillProcessing)) {
      errorHandler.handleError(error);
    }
    if (job.retryCount >= queuePolicy.retryLimit) {
      await finishBatchFile(job.data.batchFileId, "failed");
    } else {
      await releaseFile(job.data.batchFileId);
    }
    throw error;
  }
}

async function enqueueUnqueuedCandidates(): Promise<void> {
  while (await pool.transaction(async (client) => {
    const result = await client.query<{ candidate_id: string; screening_id: string; batch_file_id: string }>(
      `SELECT c.id AS candidate_id, s.id AS screening_id, f.id AS batch_file_id
       FROM candidates c
       JOIN screenings s ON s.candidate_id = c.id AND s.score IS NULL
       JOIN upload_batch_files f ON f.screening_id = s.id AND f.status IN ('pending', 'processing')
       WHERE c.processing_job_id IS NULL
         AND c.processing_status IN ('pending', 'processing')
         AND c.resume_s3_key IS NOT NULL
       ORDER BY c.created_at NULLS LAST, c.id
       FOR UPDATE OF c SKIP LOCKED
       LIMIT 1`,
    );
    const row = result.rows[0];
    if (!row) return false;
    const jobId = await enqueue(client, {
      candidateId: row.candidate_id,
      screeningId: row.screening_id,
      batchFileId: row.batch_file_id,
    });
    await client.query(
      `UPDATE candidates
       SET processing_job_id = $1, processing_status = 'pending', processing_token = NULL
       WHERE id = $2`,
      [jobId, row.candidate_id],
    );
    return true;
  })) { /* Recover CVs saved before the queue job was recorded. */ }
}

async function start(): Promise<void> {
  const instance = await startQueueBoss();
  await instance.createQueue(QUEUE, queuePolicy);
  await enqueueUnqueuedCandidates();
  await instance.work<ScreeningCvJob>(QUEUE, async ([job]) => {
    if (job) await processScreeningCv(job);
  });
}

async function stop(): Promise<void> {
  await stopQueueBoss();
}

export const screeningQueue = { enqueue, start, stop };

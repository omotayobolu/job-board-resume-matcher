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
import { assessScreenFit } from "./screenFit";
import { vectorLiteral } from "./vector";

const QUEUE = "screening-cv";

// Scoring waits on the role embedding. This is not a parse failure, so it does not
// use the queue retry limit. A follow-up job is delayed until the deadline.
export const scoreWait = {
  maxMs: 10 * 60 * 1000,
  delaySeconds: 20,
} as const;

const scoreTimeoutReason = "The role embedding was not ready within 10 minutes.";

export type ScreeningCvJob = {
  candidateId: string;
  screeningId: string;
  batchFileId?: string;
  reasonOnly?: boolean;
  scoreOnly?: boolean;
  scoreDeadline?: string;
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

class CandidateStillProcessing extends Error {
  constructor() {
    super("Candidate resume is still processing");
    this.name = "CandidateStillProcessing";
  }
}

class ReasonsStillProcessing extends Error {
  constructor() {
    super("Screening reasons are still processing");
    this.name = "ReasonsStillProcessing";
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

async function jobState(jobId: string): Promise<string | undefined> {
  const jobs = await getQueueBoss().findJobs<ScreeningCvJob>(QUEUE, { id: jobId });
  return jobs[0]?.state;
}

// A new queue job, not a retry of the parse job. startAfter keeps it off the retry budget.
async function scheduleScore(payload: ScreeningCvJob, delaySeconds: number): Promise<string> {
  const id = await getQueueBoss().send(QUEUE, payload, {
    startAfter: new Date(Date.now() + delaySeconds * 1000),
  });
  if (!id) throw new Error("Could not schedule scoring");
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
export async function finishBatchFile(fileId: string, status: "completed" | "failed", reason?: string): Promise<void> {
  await pool.transaction(async (client) => {
    const updated = await client.query<{ batch_id: string }>(
      `UPDATE upload_batch_files
       SET status = $2, reason = COALESCE($3, reason)
       WHERE id = $1 AND status IN ('pending', 'processing')
       RETURNING batch_id`,
      [fileId, status, reason ?? null],
    );
    const batchId = updated.rows[0]?.batch_id;
    if (!batchId) return;

    if (status === "completed") {
      await client.query(
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

    await client.query(
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
  });
}

async function finishScoredFiles(candidateId: string): Promise<void> {
  const files = await pool.query<{ id: string }>(
    `SELECT f.id
     FROM upload_batch_files f
     JOIN screenings s ON s.id = f.screening_id
     WHERE s.candidate_id = $1
       AND s.score IS NOT NULL
       AND s.reason_status = 'completed'
       AND s.reason_summary IS NOT NULL
       AND f.status IN ('pending', 'processing')`,
    [candidateId],
  );
  for (const file of files.rows) {
    await finishBatchFile(file.id, "completed");
  }
}

// One OpenAI fit call per screening. A stored summary is not requested again.
export async function ensureScreeningReasons(job: { id: string; data: ScreeningCvJob; retryCount: number }): Promise<void> {
  const screeningId = job.data.screeningId;
  const claimed = await pool.query<{ id: string }>(
    `UPDATE screenings
     SET reason_status = 'processing', reason_token = $2::uuid
     WHERE id = $1
       AND score IS NOT NULL
       AND reason_summary IS NULL
       AND (
         (reason_status IN ('pending', 'failed') AND (reason_token IS NULL OR reason_token = $2::uuid))
         OR (reason_status = 'processing' AND reason_token = $2::uuid)
       )
     RETURNING id`,
    [screeningId, job.id],
  );
  if (!claimed.rows[0]) {
    const current = await pool.query<{ reason_summary: string | null; score: number | null }>(
      `SELECT reason_summary, score FROM screenings WHERE id = $1`,
      [screeningId],
    );
    const row = current.rows[0];
    if (!row || row.score === null || row.reason_summary?.trim()) return;
    throw new ReasonsStillProcessing();
  }

  try {
    const context = await pool.query<{ job_title: string | null; job_description: string | null; parsed_resume: unknown }>(
      `SELECT j.job_title, j.job_description, c.parsed_resume
       FROM screenings s
       JOIN jobs j ON j.id = s.job_id
       JOIN candidates c ON c.id = s.candidate_id
       WHERE s.id = $1 AND s.reason_token = $2::uuid`,
      [screeningId, job.id],
    );
    const row = context.rows[0];
    if (!row?.parsed_resume) throw new Error("Screening has no parsed CV");
    const role = [row.job_title, row.job_description].filter((part) => part && part.trim()).join("\n");
    const fit = await assessScreenFit(role, row.parsed_resume);
    const saved = await pool.query(
      `UPDATE screenings
       SET reason_summary = $3,
           reason_strengths = $4,
           reason_gaps = $5,
           must_have_checks = $6::jsonb,
           reason_status = 'completed',
           reason_token = NULL
       WHERE id = $1 AND reason_token = $2::uuid AND reason_summary IS NULL`,
      [screeningId, job.id, fit.summary, fit.strengths, fit.gaps, JSON.stringify(fit.must_haves)],
    );
    if (saved.rowCount === 0) return;
  } catch (error) {
    await pool.query(
      `UPDATE screenings
       SET reason_status = $3, reason_token = $4::uuid
       WHERE id = $1 AND reason_token = $2::uuid AND reason_summary IS NULL`,
      [screeningId, job.id,
        job.retryCount >= queuePolicy.retryLimit ? "failed" : job.data.reasonOnly ? "processing" : "pending",
        job.data.reasonOnly && job.retryCount < queuePolicy.retryLimit ? job.id : null],
    );
    throw error;
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

async function deferScore(data: ScreeningCvJob): Promise<void> {
  if (!data.batchFileId) throw new Error("Scoring job has no batch file");
  const deadline = data.scoreDeadline && !Number.isNaN(Date.parse(data.scoreDeadline))
    ? data.scoreDeadline
    : new Date(Date.now() + scoreWait.maxMs).toISOString();
  if (Date.parse(deadline) <= Date.now()) {
    await finishBatchFile(data.batchFileId, "failed", scoreTimeoutReason);
    return;
  }
  await screeningQueue.scheduleScore({
    candidateId: data.candidateId,
    screeningId: data.screeningId,
    batchFileId: data.batchFileId,
    scoreOnly: true,
    scoreDeadline: deadline,
  }, scoreWait.delaySeconds);
  await releaseFile(data.batchFileId);
}

export async function processScreeningCv(job: { id: string; data: ScreeningCvJob; retryCount: number }): Promise<void> {
  if (job.data.reasonOnly) {
    await ensureScreeningReasons(job);
    await finishScoredFiles(job.data.candidateId);
    return;
  }
  const batchFileId = job.data.batchFileId;
  if (!batchFileId) throw new Error("Screening job has no batch file");
  const file = await pool.query<{ status: string }>(
    `SELECT status FROM upload_batch_files WHERE id = $1`,
    [batchFileId],
  );
  const status = file.rows[0]?.status;
  if (!status || status === "completed" || status === "skipped" || status === "failed") return;

  await pool.query(
    `UPDATE upload_batch_files SET status = 'processing' WHERE id = $1 AND status = 'pending'`,
    [batchFileId],
  );
  await pool.query(
    `UPDATE upload_batches SET status = 'processing'
     WHERE id = (SELECT batch_id FROM upload_batch_files WHERE id = $1)
       AND status = 'pending'`,
    [batchFileId],
  );

  try {
    if (job.data.scoreOnly) {
      const existing = await loadCandidate(job.data.candidateId);
      // Parsing already called OpenAI. This job waits for the role embedding, then writes fit notes once.
      if (!existing?.parsed_resume || !existing.has_embedding) {
        await deferScore(job.data);
        return;
      }
    } else {
      await ensureParsed(job);
    }
    await scoreReadyScreenings(job.data.candidateId);
    const state = await screeningState(job.data.screeningId);
    if (!state) return;
    if (state.score === null) {
      await deferScore(job.data);
      return;
    }
    await ensureScreeningReasons(job);
    await finishScoredFiles(job.data.candidateId);
  } catch (error) {
    if (!(error instanceof CandidateStillProcessing) && !(error instanceof ReasonsStillProcessing)) {
      errorHandler.handleError(error);
    }
    if (job.retryCount >= queuePolicy.retryLimit) {
      await finishBatchFile(batchFileId, "failed");
    } else {
      await releaseFile(batchFileId);
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

// Older scored screenings may have completed files or no upload batch at all.
// Reserve their reason job in the same transaction as enqueueing it, and only
// reclaim a reservation once pg-boss confirms that its owner is no longer live.
export async function enqueueMissingScreeningReasons(): Promise<void> {
  const missing = await pool.query<{ id: string }>(
    `SELECT s.id FROM screenings s
     JOIN candidates c ON c.id = s.candidate_id
     WHERE s.score IS NOT NULL AND s.reason_summary IS NULL
       AND s.reason_status IN ('pending', 'processing')
       AND c.parsed_resume IS NOT NULL
     ORDER BY s.created_at, s.id`,
  );
  for (const screening of missing.rows) {
    await pool.transaction(async (client) => {
      const selected = await client.query<{ candidate_id: string; reason_token: string | null }>(
        `SELECT s.candidate_id, s.reason_token FROM screenings s
         JOIN candidates c ON c.id = s.candidate_id
         WHERE s.id = $1 AND s.score IS NOT NULL AND s.reason_summary IS NULL
           AND s.reason_status IN ('pending', 'processing')
           AND c.parsed_resume IS NOT NULL
         FOR UPDATE OF s SKIP LOCKED`,
        [screening.id],
      );
      const row = selected.rows[0];
      if (!row) return;
      if (row.reason_token) {
        const state = await screeningQueue.jobState(row.reason_token);
        if (state === "created" || state === "active" || state === "retry") return;
      }
      const jobId = await screeningQueue.enqueue(client, {
        candidateId: row.candidate_id, screeningId: screening.id, reasonOnly: true,
      });
      await client.query(
        `UPDATE screenings SET reason_status = 'processing', reason_token = $2::uuid
         WHERE id = $1 AND reason_summary IS NULL`,
        [screening.id, jobId],
      );
    });
  }
}

async function start(): Promise<void> {
  const instance = await startQueueBoss();
  await instance.createQueue(QUEUE, queuePolicy);
  await enqueueUnqueuedCandidates();
  await enqueueMissingScreeningReasons();
  await instance.work<ScreeningCvJob>(QUEUE, async ([job]) => {
    if (job) await processScreeningCv(job);
  });
}

async function stop(): Promise<void> {
  await stopQueueBoss();
}

export const screeningQueue = { enqueue, jobState, scheduleScore, start, stop };

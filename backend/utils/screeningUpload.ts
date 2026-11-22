import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { DOCX_MIME, PDF_MIME, ZIP_MIMES, uploadLimits } from "../config/uploadLimits";
import pool from "../db";
import { CustomError, HttpStatusCode } from "./error-handler";
import { jobEmbeddingQueue } from "./jobEmbeddingQueue";
import { screeningQueue, type ScreeningCvJob } from "./screeningQueue";
import { uploadResume, validateResumeFile } from "./resumeUpload";
import { extractCvZip } from "./zipArchive";

export type CvFile = {
  filename: string;
  buffer: Buffer;
  mimetype: typeof PDF_MIME | typeof DOCX_MIME;
  sha256: string;
};

type SeenCandidate = {
  candidateId: string;
  screeningId: string | null;
  completed: boolean;
};

function badRequest(message: string): CustomError {
  return new CustomError("BAD REQUEST", HttpStatusCode.BAD_REQUEST, message, true);
}

function notFound(message: string): CustomError {
  return new CustomError("NOT FOUND", HttpStatusCode.NOT_FOUND, message, true);
}

export function fileSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function roleTextToJob(text: string): { job_title: string; job_description: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    throw badRequest("Enter a role title or paste a job description.");
  }
  if (trimmed.length > uploadLimits.maxRoleChars) {
    throw badRequest("That role text is too long.");
  }
  const firstLine = trimmed.split(/\r?\n/, 1)[0]?.trim() ?? trimmed;
  const title = firstLine.length > uploadLimits.maxTitleChars
    ? `${firstLine.slice(0, uploadLimits.maxTitleChars - 3)}...`
    : firstLine;
  return { job_title: title, job_description: trimmed };
}

function extensionOf(name: string): "pdf" | "docx" | "zip" | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".zip")) return "zip";
  return null;
}

function asResumeFile(filename: string, buffer: Buffer, mimetype: string): Express.Multer.File {
  return validateResumeFile({
    originalname: filename,
    mimetype,
    buffer,
    size: buffer.length,
  } as Express.Multer.File);
}

function cvFromBuffer(filename: string, buffer: Buffer, mimetype: typeof PDF_MIME | typeof DOCX_MIME): CvFile {
  if (buffer.length > uploadLimits.maxResumeBytes) {
    throw badRequest(`"${filename}" is larger than 10 MB.`);
  }
  if (buffer.length === 0) throw badRequest(`"${filename}" is empty.`);
  const file = asResumeFile(filename, buffer, mimetype);
  return { filename, buffer: file.buffer, mimetype, sha256: fileSha256(file.buffer) };
}

export async function collectCvs(files: Express.Multer.File[]): Promise<CvFile[]> {
  if (files.length === 0) {
    throw badRequest("Add at least one CV (PDF, DOCX, or a zip of CVs).");
  }
  if (files.length > uploadLimits.maxFilesPerBatch) {
    throw badRequest(`A screening can include at most ${uploadLimits.maxFilesPerBatch} files.`);
  }

  const cvs: CvFile[] = [];
  for (const file of files) {
    const extension = extensionOf(file.originalname || "");
    const isZip = extension === "zip" || ZIP_MIMES.has(file.mimetype);
    if (isZip) {
      if (file.size > uploadLimits.maxZipBytes || file.buffer.length > uploadLimits.maxZipBytes) {
        throw badRequest("Zip archives must be 50 MB or smaller.");
      }
      const extracted = await extractCvZip(file.buffer);
      for (const entry of extracted) {
        cvs.push(cvFromBuffer(entry.filename, entry.buffer, entry.mimetype));
      }
      continue;
    }
    if (extension !== "pdf" && extension !== "docx") {
      throw badRequest("Each CV must be a PDF or DOCX file. You can also upload a zip of those files.");
    }
    const mimetype = extension === "pdf" ? PDF_MIME : DOCX_MIME;
    cvs.push(cvFromBuffer(file.originalname, file.buffer, mimetype));
  }

  if (cvs.length === 0) {
    throw badRequest("No PDF or DOCX files were found in that upload.");
  }
  if (cvs.length > uploadLimits.maxFilesPerBatch) {
    throw badRequest(`A screening can include at most ${uploadLimits.maxFilesPerBatch} CVs.`);
  }
  return cvs;
}

async function workspaceIdFor(client: PoolClient, userId: string): Promise<string> {
  const result = await client.query<{ workspace_id: string }>(
    `SELECT workspace_id FROM workspace_members
     WHERE user_id = $1
     ORDER BY CASE member_role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, created_at
     LIMIT 1`,
    [userId],
  );
  const workspaceId = result.rows[0]?.workspace_id;
  if (!workspaceId) throw notFound("Workspace not found.");
  return workspaceId;
}

async function ownedJob(client: PoolClient, jobId: string, userId: string): Promise<{ id: string; workspace_id: string }> {
  const result = await client.query<{ id: string; workspace_id: string }>(
    `SELECT j.id, j.workspace_id
     FROM jobs j
     JOIN workspace_members wm ON wm.workspace_id = j.workspace_id AND wm.user_id = $2
     WHERE j.id = $1`,
    [jobId, userId],
  );
  const job = result.rows[0];
  if (!job) throw notFound("Role not found.");
  return job;
}

async function assertMonthlyCap(client: PoolClient, workspaceId: string, newCvCount: number): Promise<void> {
  if (newCvCount === 0) return;
  const result = await client.query<{ total: number }>(
    `SELECT count(*)::int AS total
     FROM candidates
     WHERE workspace_id = $1
       AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)
       AND created_at < date_trunc('month', CURRENT_TIMESTAMP) + interval '1 month'`,
    [workspaceId],
  );
  const used = result.rows[0]?.total ?? 0;
  if (used + newCvCount > uploadLimits.monthlyCvCap) {
    throw badRequest(
      `Free plan limit is ${uploadLimits.monthlyCvCap} CVs per workspace each calendar month. This upload would add ${newCvCount} new CV${newCvCount === 1 ? "" : "s"} and this workspace already has ${used} this month.`,
    );
  }
}

async function loadExisting(client: PoolClient, workspaceId: string, jobId: string, hashes: string[]): Promise<Map<string, SeenCandidate>> {
  const seen = new Map<string, SeenCandidate>();
  if (hashes.length === 0) return seen;
  const result = await client.query<{
    id: string;
    file_sha256: string;
    processing_status: string;
    screening_id: string | null;
  }>(
    `SELECT c.id, c.file_sha256, c.processing_status, s.id AS screening_id
     FROM candidates c
     LEFT JOIN screenings s ON s.candidate_id = c.id AND s.job_id = $2
     WHERE c.workspace_id = $1 AND c.file_sha256 = ANY($3::text[])`,
    [workspaceId, jobId, hashes],
  );
  for (const row of result.rows) {
    seen.set(row.file_sha256, {
      candidateId: row.id,
      screeningId: row.screening_id,
      completed: row.processing_status === "completed",
    });
  }
  return seen;
}

async function insertScreening(client: PoolClient, jobId: string, candidateId: string, batchId: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO screenings (job_id, candidate_id, batch_id, status, reason_status)
     VALUES ($1, $2, $3, 'new', 'pending')
     ON CONFLICT (job_id, candidate_id) DO NOTHING
     RETURNING id`,
    [jobId, candidateId, batchId],
  );
  if (result.rows[0]) return result.rows[0].id;
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM screenings WHERE job_id = $1 AND candidate_id = $2`,
    [jobId, candidateId],
  );
  const id = existing.rows[0]?.id;
  if (!id) throw new Error("Screening insert returned no row");
  return id;
}

async function insertBatchFile(
  client: PoolClient,
  batchId: string,
  candidateId: string,
  screeningId: string,
  filename: string,
  status: "pending" | "skipped",
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO upload_batch_files (batch_id, candidate_id, screening_id, filename, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [batchId, candidateId, screeningId, filename, status],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Batch file insert returned no row");
  return id;
}

async function insertCandidate(client: PoolClient, workspaceId: string, sha256: string, filename: string): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO candidates (workspace_id, file_sha256, resume_filename, processing_status)
     VALUES ($1, $2, $3, 'pending')
     ON CONFLICT (workspace_id, file_sha256) WHERE file_sha256 IS NOT NULL DO NOTHING
     RETURNING id`,
    [workspaceId, sha256, filename],
  );
  return result.rows[0]?.id ?? null;
}

// Dedupe is the SHA-256 of the file bytes, per workspace. The same bytes on a
// new role reuse the candidate. The same bytes on this role are skipped.
async function acceptCvs(
  client: PoolClient,
  args: { workspaceId: string; jobId: string; userId: string; cvs: CvFile[] },
): Promise<{ batch_id: string; total_files: number; skipped_files: number }> {
  await client.query(`SELECT id FROM workspaces WHERE id = $1 FOR UPDATE`, [args.workspaceId]);

  const uniqueHashes = [...new Set(args.cvs.map((cv) => cv.sha256))];
  const seen = await loadExisting(client, args.workspaceId, args.jobId, uniqueHashes);
  let newCvCount = 0;
  for (const hash of uniqueHashes) {
    if (!seen.has(hash)) newCvCount += 1;
  }
  await assertMonthlyCap(client, args.workspaceId, newCvCount);

  const queued: ScreeningCvJob[] = [];
  let skipped = 0;
  const batch = await client.query<{ id: string }>(
    `INSERT INTO upload_batches
       (workspace_id, job_id, uploaded_by, status, total_files, skipped_files)
     VALUES ($1, $2, $3, 'processing', $4, 0)
     RETURNING id`,
    [args.workspaceId, args.jobId, args.userId, args.cvs.length],
  );
  const batchId = batch.rows[0]?.id;
  if (!batchId) throw new Error("Batch insert returned no row");

  for (const cv of args.cvs) {
    let known = seen.get(cv.sha256);
    if (known?.screeningId) {
      await insertBatchFile(client, batchId, known.candidateId, known.screeningId, cv.filename, "skipped");
      skipped += 1;
      continue;
    }

    if (!known) {
      const createdId = await insertCandidate(client, args.workspaceId, cv.sha256, cv.filename);
      if (!createdId) {
        const again = await loadExisting(client, args.workspaceId, args.jobId, [cv.sha256]);
        known = again.get(cv.sha256);
        if (!known) throw new Error("Could not save or find the CV");
        seen.set(cv.sha256, known);
      } else {
        const file = asResumeFile(cv.filename, cv.buffer, cv.mimetype);
        const key = await uploadResume(file, args.workspaceId, { folder: "cvs", candidateId: createdId });
        await client.query(
          `UPDATE candidates SET resume_s3_key = $1, resume_filename = $2 WHERE id = $3`,
          [key, cv.filename, createdId],
        );
        known = { candidateId: createdId, screeningId: null, completed: false };
        seen.set(cv.sha256, known);
      }
    }

    if (known.screeningId) {
      await insertBatchFile(client, batchId, known.candidateId, known.screeningId, cv.filename, "skipped");
      skipped += 1;
      continue;
    }

    const screeningId = await insertScreening(client, args.jobId, known.candidateId, batchId);
    known.screeningId = screeningId;
    const alreadyOnRole = screeningId
      && (await client.query(
        `SELECT 1 FROM screenings WHERE id = $1 AND batch_id IS DISTINCT FROM $2`,
        [screeningId, batchId],
      )).rowCount;
    if (alreadyOnRole) {
      await insertBatchFile(client, batchId, known.candidateId, screeningId, cv.filename, "skipped");
      skipped += 1;
      continue;
    }

    const batchFileId = await insertBatchFile(client, batchId, known.candidateId, screeningId, cv.filename, "pending");
    const queueId = await screeningQueue.enqueue(client, {
      candidateId: known.candidateId,
      screeningId,
      batchFileId,
    });
    if (!known.completed) {
      await client.query(
        `UPDATE candidates
         SET processing_job_id = $2
         WHERE id = $1 AND processing_status <> 'completed' AND processing_job_id IS NULL`,
        [known.candidateId, queueId],
      );
    }
    queued.push({ candidateId: known.candidateId, screeningId, batchFileId });
  }

  const done = queued.length === 0;
  await client.query(
    `UPDATE upload_batches
     SET skipped_files = $2,
         status = $3,
         completed_at = CASE WHEN $3 = 'completed' THEN now() ELSE NULL END
     WHERE id = $1`,
    [batchId, skipped, done ? "completed" : "processing"],
  );

  return { batch_id: batchId, total_files: args.cvs.length, skipped_files: skipped };
}

export async function createRoleWithCvs(
  userId: string,
  roleText: string,
  files: Express.Multer.File[],
): Promise<{ job_id: string; batch_id: string; total_files: number; skipped_files: number }> {
  const { job_title, job_description } = roleTextToJob(roleText);
  const cvs = await collectCvs(files);
  return pool.transaction(async (client) => {
    const workspaceId = await workspaceIdFor(client, userId);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO jobs
         (recruiter_id, workspace_id, job_title, job_description, required_skills,
          job_status, embedding_status, created_at)
       VALUES ($1, $2, $3, $4, '{}', 'active', 'pending', NOW())
       RETURNING id`,
      [userId, workspaceId, job_title, job_description],
    );
    const jobId = inserted.rows[0]?.id;
    if (!jobId) throw new Error("Job insert returned no row");
    const queueId = await jobEmbeddingQueue.enqueue(client, jobId);
    await client.query(`UPDATE jobs SET embedding_job_id = $1 WHERE id = $2`, [queueId, jobId]);
    const batch = await acceptCvs(client, { workspaceId, jobId, userId, cvs });
    return { job_id: jobId, ...batch };
  });
}

export async function addCvsToRole(
  userId: string,
  jobId: string,
  files: Express.Multer.File[],
): Promise<{ job_id: string; batch_id: string; total_files: number; skipped_files: number }> {
  const cvs = await collectCvs(files);
  return pool.transaction(async (client) => {
    const job = await ownedJob(client, jobId, userId);
    const batch = await acceptCvs(client, {
      workspaceId: job.workspace_id,
      jobId: job.id,
      userId,
      cvs,
    });
    return { job_id: job.id, ...batch };
  });
}

export type BatchFileStatus = {
  id: string;
  filename: string;
  status: string;
  candidate_id: string | null;
  screening_id: string | null;
};

export type UploadBatchView = {
  id: string;
  job_id: string;
  status: string;
  total_files: number;
  processed_files: number;
  failed_files: number;
  skipped_files: number;
  files: BatchFileStatus[];
};

export async function getUploadBatch(userId: string, jobId: string, batchId: string): Promise<UploadBatchView> {
  const batch = await pool.query<{
    id: string;
    job_id: string;
    status: string;
    total_files: number;
    processed_files: number;
    failed_files: number;
    skipped_files: number;
  }>(
    `SELECT b.id, b.job_id, b.status, b.total_files, b.processed_files, b.failed_files, b.skipped_files
     FROM upload_batches b
     JOIN jobs j ON j.id = b.job_id
     JOIN workspace_members wm ON wm.workspace_id = j.workspace_id AND wm.user_id = $3
     WHERE b.id = $1 AND b.job_id = $2`,
    [batchId, jobId, userId],
  );
  const row = batch.rows[0];
  if (!row) throw notFound("Upload not found.");
  const files = await pool.query<BatchFileStatus>(
    `SELECT id, filename, status, candidate_id, screening_id
     FROM upload_batch_files
     WHERE batch_id = $1
     ORDER BY created_at, filename`,
    [batchId],
  );
  return { ...row, files: files.rows };
}

export async function retryFailedCvs(userId: string, jobId: string, batchId: string): Promise<UploadBatchView & { retried: number }> {
  const retried = await pool.transaction(async (client) => {
    const owned = await client.query<{ id: string }>(
      `SELECT b.id
       FROM upload_batches b
       JOIN jobs j ON j.id = b.job_id
       JOIN workspace_members wm ON wm.workspace_id = j.workspace_id AND wm.user_id = $3
       WHERE b.id = $1 AND b.job_id = $2
       FOR UPDATE OF b`,
      [batchId, jobId, userId],
    );
    if (!owned.rows[0]) throw notFound("Upload not found.");

    const failed = await client.query<{ id: string; candidate_id: string; screening_id: string; processing_status: string }>(
      `SELECT f.id, f.candidate_id, f.screening_id, c.processing_status
       FROM upload_batch_files f
       JOIN candidates c ON c.id = f.candidate_id
       WHERE f.batch_id = $1 AND f.status = 'failed' AND f.screening_id IS NOT NULL
       FOR UPDATE OF f`,
      [batchId],
    );

    for (const file of failed.rows) {
      const queueId = await screeningQueue.enqueue(client, {
        candidateId: file.candidate_id,
        screeningId: file.screening_id,
        batchFileId: file.id,
      });
      await client.query(
        `UPDATE upload_batch_files SET status = 'pending' WHERE id = $1 AND status = 'failed'`,
        [file.id],
      );
      if (file.processing_status === "failed") {
        await client.query(
          `UPDATE candidates
           SET processing_status = 'pending', processing_token = NULL, processing_job_id = $2
           WHERE id = $1 AND processing_status = 'failed'`,
          [file.candidate_id, queueId],
        );
      }
    }

    if (failed.rows.length > 0) {
      await client.query(
        `UPDATE upload_batches
         SET failed_files = GREATEST(0, failed_files - $2),
             status = 'processing',
             completed_at = NULL
         WHERE id = $1`,
        [batchId, failed.rows.length],
      );
    }
    return failed.rows.length;
  });

  const view = await getUploadBatch(userId, jobId, batchId);
  return { ...view, retried };
}

import pool from "../db";
import { jobIdParamSchema, idParamSchema } from "../schemas";
import type { MustHaveCheck } from "../types/domain";
import { CustomError, HttpStatusCode } from "./error-handler";
import { matchPercent } from "./matchPercent";
import { cvSigner, CV_URL_TTL_SECONDS } from "./signCvDownload";
import { shortlistCsv, type CsvScreening } from "./shortlistCsv";
import { z } from "zod";

export const screeningDecisionSchema = z.object({
  status: z.enum(["new", "shortlisted", "rejected"]),
});

export type ScreeningDecision = z.infer<typeof screeningDecisionSchema>["status"];

const mustHaveSchema = z.object({
  requirement: z.string(),
  met: z.enum(["yes", "no", "unclear"]),
  evidence: z.string(),
});

export type ShortlistItem = {
  id: string;
  candidate_id: string;
  name: string;
  email: string | null;
  filename: string | null;
  match_percent: number | null;
  status: "new" | "shortlisted" | "rejected" | "hired";
  summary: string | null;
  strengths: string[];
  gaps: string[];
  must_haves: MustHaveCheck[];
  pipeline: "processing" | "failed" | "ready";
  file_reason: string | null;
};

type ListedRow = {
  id: string;
  candidate_id: string;
  status: ShortlistItem["status"];
  score: number | null;
  reason_summary: string | null;
  reason_strengths: string[] | null;
  reason_gaps: string[] | null;
  must_have_checks: unknown;
  reason_status: string;
  full_name: string | null;
  email: string | null;
  resume_filename: string | null;
  processing_status: string;
  file_status: string | null;
  file_reason: string | null;
  job_title: string | null;
  job_description: string | null;
};

const rankedSql = `
  SELECT
    s.id,
    s.candidate_id,
    s.status,
    s.score,
    s.reason_summary,
    s.reason_strengths,
    s.reason_gaps,
    s.must_have_checks,
    s.reason_status,
    c.full_name,
    c.email,
    c.resume_filename,
    c.processing_status,
    f.status AS file_status,
    f.reason AS file_reason,
    j.job_title,
    j.job_description
  FROM screenings s
  JOIN jobs j ON j.id = s.job_id
  JOIN candidates c ON c.id = s.candidate_id AND c.workspace_id = j.workspace_id
  JOIN workspace_members wm ON wm.workspace_id = j.workspace_id AND wm.user_id = $2
  LEFT JOIN LATERAL (
    SELECT status, reason
    FROM upload_batch_files
    WHERE screening_id = s.id
    ORDER BY created_at DESC
    LIMIT 1
  ) f ON true
  WHERE s.job_id = $1
  ORDER BY
    CASE WHEN c.embedding IS NULL OR j.embedding IS NULL THEN 1 ELSE 0 END,
    CASE
      WHEN c.embedding IS NULL OR j.embedding IS NULL THEN NULL
      ELSE (c.embedding <=> j.embedding)
    END ASC NULLS LAST,
    s.created_at ASC
`;

function notFound(message: string): CustomError {
  return new CustomError("NOT FOUND", HttpStatusCode.NOT_FOUND, message, true);
}

function readScore(value: number | null): number | null {
  if (value === null || value === undefined) return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function readMustHaves(value: unknown): MustHaveCheck[] {
  const parsed = z.array(mustHaveSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function pipeline(row: ListedRow): ShortlistItem["pipeline"] {
  if (row.processing_status === "failed" || row.reason_status === "failed" || row.file_status === "failed") {
    return "failed";
  }
  const fileOpen = row.file_status === "pending" || row.file_status === "processing";
  const candidateOpen = row.processing_status === "pending" || row.processing_status === "processing";
  if (readScore(row.score) === null || fileOpen || candidateOpen || row.reason_status === "processing") {
    return "processing";
  }
  return "ready";
}

function toItem(row: ListedRow): ShortlistItem {
  const score = readScore(row.score);
  const email = row.email?.trim() ? row.email.trim() : null;
  const filename = row.resume_filename?.trim() ? row.resume_filename.trim() : null;
  return {
    id: row.id,
    candidate_id: row.candidate_id,
    name: row.full_name?.trim() || filename || "Unnamed candidate",
    email,
    filename,
    match_percent: score === null ? null : matchPercent(score),
    status: row.status,
    summary: row.reason_summary?.trim() ? row.reason_summary.trim() : null,
    strengths: row.reason_strengths ?? [],
    gaps: row.reason_gaps ?? [],
    must_haves: readMustHaves(row.must_have_checks),
    pipeline: pipeline(row),
    file_reason: row.file_reason,
  };
}

async function ownedJob(userId: string, jobId: string): Promise<{ id: string; job_title: string | null; job_description: string | null }> {
  const job = await pool.query<{ id: string; job_title: string | null; job_description: string | null }>(
    `SELECT j.id, j.job_title, j.job_description
     FROM jobs j
     JOIN workspace_members wm ON wm.workspace_id = j.workspace_id AND wm.user_id = $2
     WHERE j.id = $1`,
    [jobId, userId],
  );
  const row = job.rows[0];
  if (!row) throw notFound("Role not found.");
  return row;
}

export async function listRoleScreenings(userId: string, jobId: string) {
  const parsedId = jobIdParamSchema.parse({ jobId }).jobId;
  const job = await ownedJob(userId, parsedId);
  const rows = await pool.query<ListedRow>(rankedSql, [parsedId, userId]);
  return {
    role: {
      id: job.id,
      title: job.job_title ?? "",
      description: job.job_description ?? "",
    },
    screenings: rows.rows.map(toItem),
  };
}

export async function exportRoleScreenings(userId: string, jobId: string): Promise<{ filename: string; csv: string }> {
  const listed = await listRoleScreenings(userId, jobId);
  const rows: CsvScreening[] = listed.screenings.map((item) => ({
    name: item.name,
    email: item.email,
    matchPercent: item.match_percent,
    status: item.status,
    summary: item.summary,
    strengths: item.strengths,
    gaps: item.gaps,
  }));
  const slug = (listed.role.title || "role").replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "role";
  return { filename: `shortlist-${slug}.csv`, csv: shortlistCsv(rows) };
}

export async function updateScreeningStatus(userId: string, screeningId: string, status: ScreeningDecision) {
  const parsedId = idParamSchema.parse({ id: screeningId }).id;
  const updated = await pool.query<{ id: string; status: ScreeningDecision }>(
    `UPDATE screenings s
     SET status = $3
     FROM jobs j, candidates c, workspace_members wm
     WHERE s.id = $1
       AND j.id = s.job_id
       AND c.id = s.candidate_id
       AND c.workspace_id = j.workspace_id
       AND wm.workspace_id = j.workspace_id
       AND wm.user_id = $2
     RETURNING s.id, s.status`,
    [parsedId, userId, status],
  );
  const row = updated.rows[0];
  if (!row) throw notFound("Screening not found.");
  return row;
}

function cvContentType(key: string): string {
  return key.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

export async function screeningCvUrl(userId: string, screeningId: string) {
  const parsedId = idParamSchema.parse({ id: screeningId }).id;
  const result = await pool.query<{ resume_s3_key: string | null; resume_filename: string | null }>(
    `SELECT c.resume_s3_key, c.resume_filename
     FROM screenings s
     JOIN jobs j ON j.id = s.job_id
     JOIN candidates c ON c.id = s.candidate_id AND c.workspace_id = j.workspace_id
     JOIN workspace_members wm ON wm.workspace_id = j.workspace_id AND wm.user_id = $2
     WHERE s.id = $1`,
    [parsedId, userId],
  );
  const row = result.rows[0];
  if (!row) throw notFound("Screening not found.");
  if (!row.resume_s3_key) throw notFound("CV file not found.");
  const contentType = cvContentType(row.resume_s3_key);
  const filename = row.resume_filename?.trim()
    || (contentType === "application/pdf" ? "resume.pdf" : "resume.docx");
  const url = await cvSigner.sign({ key: row.resume_s3_key, filename, contentType });
  return { url, filename, content_type: contentType, expires_in: CV_URL_TTL_SECONDS };
}

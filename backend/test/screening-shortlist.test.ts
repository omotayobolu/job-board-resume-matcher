import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { Client } from "pg";
import { shortlistCsv } from "../utils/shortlistCsv";

const databaseUrl = "postgres://shortlistly:shortlistly@127.0.0.1:5432/shortlistly_phase3";
const adminUrl = "postgres://shortlistly:shortlistly@127.0.0.1:5432/postgres";
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET ??= "test-secret";
process.env.AWS_REGION ??= "us-east-1";
process.env.S3_BUCKET_NAME ??= "test-bucket";
process.env.AWS_EC2_METADATA_DISABLED = "true";

const modelsDir = path.join(process.cwd(), "models");
const adaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const linId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const graceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const skipJobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const perfectId = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const midId = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const clampedId = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
const fartherId = "cccccccc-cccc-4ccc-8ccc-ccccccccccc4";
const waitingId = "cccccccc-cccc-4ccc-8ccc-ccccccccccc5";
const leakedId = "cccccccc-cccc-4ccc-8ccc-ccccccccccc6";
const skipCandidateId = "cccccccc-cccc-4ccc-8ccc-ccccccccccc7";
const perfectScreening = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const midScreening = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
const clampedScreening = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";
const fartherScreening = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4";
const waitingScreening = "dddddddd-dddd-4ddd-8ddd-ddddddddddd5";
const leakedScreening = "dddddddd-dddd-4ddd-8ddd-ddddddddddd6";
const skipScreening = "dddddddd-dddd-4ddd-8ddd-ddddddddddd7";
const skipFileId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";

function sqlFile(name: string): string {
  return readFileSync(path.join(modelsDir, name), "utf8");
}

function vector(entries: Record<number, number>): string {
  const values = Array.from({ length: 768 }, () => 0);
  for (const [index, value] of Object.entries(entries)) values[Number(index)] = value;
  return `[${values.join(",")}]`;
}

async function query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<T>(text, params as unknown[]);
    return result.rows;
  } finally {
    await client.end();
  }
}

function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
) {
  let statusCode = 0;
  let body: unknown;
  let error: unknown;
  const headers: Record<string, string> = {};
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
    send(value: unknown) {
      body = value;
      return this;
    },
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
  };
  return handler(req as Request, res as unknown as Response, ((err: unknown) => {
    error = err;
  }) as NextFunction).then(() => ({ statusCode, body, error, headers }));
}

type Listed = {
  role: { title: string };
  screenings: Array<{ id: string; name: string; email: string | null; match_percent: number | null; status: string; pipeline: string }>;
};

describe("screening shortlist", { concurrency: 1 }, () => {
  let listScreenings: typeof import("../controllers/screeningController.js").listScreenings;
  let exportScreenings: typeof import("../controllers/screeningController.js").exportScreenings;
  let updateStatus: typeof import("../controllers/screeningController.js").updateStatus;
  let viewCv: typeof import("../controllers/screeningController.js").viewCv;
  let isRecruiter: typeof import("../middlewares/authMiddleware.js").isRecruiter;
  let processScreeningCv: typeof import("../utils/screeningQueue.js").processScreeningCv;
  let cvSigner: typeof import("../utils/signCvDownload.js").cvSigner;
  const signedKeys: string[] = [];
  let originalSign: typeof import("../utils/signCvDownload.js").cvSigner.sign;

  before(async () => {
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'shortlistly_phase3' AND pid <> pg_backend_pid()",
      );
      await admin.query("DROP DATABASE IF EXISTS shortlistly_phase3");
      await admin.query("CREATE DATABASE shortlistly_phase3");
    } finally {
      await admin.end();
    }

    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query(sqlFile("setup.sql"));
      await client.query("ALTER TABLE public.screenings DROP CONSTRAINT IF EXISTS screenings_must_have_checks_array");
      await client.query("ALTER TABLE public.screenings DROP COLUMN IF EXISTS must_have_checks");
      await client.query("ALTER TABLE public.screenings DROP COLUMN IF EXISTS reason_token");
      await client.query(sqlFile("20261125_screening_fit.sql"));
      await client.query(sqlFile("20261125_screening_fit.sql"));
      const columns = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'screenings'
           AND column_name IN ('must_have_checks', 'reason_token')`,
      );
      assert.equal(columns.rowCount, 2);

      await client.query(
        `INSERT INTO users (id, email, full_name, role, password_hash, hasprofile, created_at)
         VALUES ($1, 'ada@example.com', 'Ada Lovelace', 'recruiter', 'x', true, NOW()),
                ($2, 'lin@example.com', 'Lin', 'recruiter', 'x', true, NOW()),
                ($3, 'grace@example.com', 'Grace Hopper', 'recruiter', 'x', true, NOW())`,
        [adaId, linId, graceId],
      );
      const workspaces = await client.query<{ id: string }>(
        `INSERT INTO workspaces (name) VALUES ('Analytical Engines'), ('Compilers') RETURNING id`,
      );
      const adaWorkspace = workspaces.rows[0]?.id;
      const graceWorkspace = workspaces.rows[1]?.id;
      assert.ok(adaWorkspace && graceWorkspace);
      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, member_role)
         VALUES ($1, $2, 'owner'), ($1, $3, 'recruiter'), ($4, $5, 'owner')`,
        [adaWorkspace, adaId, linId, graceWorkspace, graceId],
      );
      const perfect = vector({ 0: 1 });
      const mid = vector({ 0: 0.6, 1: 0.8 });
      const clamped = vector({ 0: -0.2, 1: Math.sqrt(0.96) });
      const farther = vector({ 0: -1 });
      await client.query(
        `INSERT INTO jobs (id, recruiter_id, workspace_id, job_title, job_description, required_skills, job_status, embedding_status, embedding, created_at)
         VALUES ($1, $2, $3, 'Backend engineer', 'Node.js required. Must have 5 years.', '{}', 'active', 'completed', $4::vector, NOW()),
                ($5, $2, $3, 'Skip notes', 'Already scored.', '{}', 'active', 'completed', $4::vector, NOW())`,
        [jobId, adaId, adaWorkspace, perfect, skipJobId],
      );
      const candidateSql = `INSERT INTO candidates
         (id, workspace_id, full_name, email, resume_s3_key, resume_filename, embedding, processing_status, parsed_resume)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, $9::jsonb)`;
      const candidateRows: unknown[][] = [
        [perfectId, adaWorkspace, "Perfect, Ada", "ada@example.com", "cvs/perfect.pdf", "perfect.pdf", perfect, "completed", JSON.stringify({ skills: "Node.js" })],
        [midId, adaWorkspace, "Mid", null, "cvs/mid.pdf", "mid.pdf", mid, "completed", "{}"],
        [clampedId, adaWorkspace, "Clamped", null, "cvs/clamped.pdf", "clamped.pdf", clamped, "completed", "{}"],
        [fartherId, adaWorkspace, "Farther", null, "cvs/farther.pdf", "farther.pdf", farther, "completed", "{}"],
        [waitingId, adaWorkspace, "Waiting", null, "cvs/waiting.pdf", "waiting.pdf", null, "pending", null],
        [leakedId, graceWorkspace, "Leaked", "leak@example.com", "cvs/leaked.pdf", "leaked.pdf", perfect, "completed", "{}"],
        [skipCandidateId, adaWorkspace, "Noted", "noted@example.com", "cvs/noted.pdf", "noted.pdf", perfect, "completed", JSON.stringify({ skills: "Node.js" })],
      ];
      for (const params of candidateRows) await client.query(candidateSql, params);
      await client.query(
        `INSERT INTO screenings (id, job_id, candidate_id, status, score, reason_summary, reason_strengths, reason_gaps, must_have_checks, reason_status)
         VALUES
           ($1, $2, $3, 'new', 1, 'Closest fit.', ARRAY['APIs, billing'], ARRAY['Said "SQL"'], '[]'::jsonb, 'completed'),
           ($4, $2, $5, 'shortlisted', 0.6, 'Partial fit.', ARRAY['Some API work'], ARRAY[]::text[], '[]'::jsonb, 'completed'),
           ($6, $2, $7, 'new', 0, 'Weak fit.', ARRAY[]::text[], ARRAY['Missing Node'], '[]'::jsonb, 'completed'),
           ($8, $2, $9, 'rejected', 0, 'Poor fit.', ARRAY[]::text[], ARRAY['Different field'], '[]'::jsonb, 'completed'),
           ($10, $2, $11, 'new', NULL, NULL, NULL, NULL, '[]'::jsonb, 'pending'),
           ($12, $2, $13, 'new', 1, 'Should stay hidden.', ARRAY['Secret'], ARRAY[]::text[], '[]'::jsonb, 'completed'),
           ($14, $15, $16, 'new', 1, 'Already noted.', ARRAY['Stored'], ARRAY[]::text[], '[]'::jsonb, 'completed')`,
        [perfectScreening, jobId, perfectId, midScreening, midId, clampedScreening, clampedId, fartherScreening, fartherId,
          waitingScreening, waitingId, leakedScreening, leakedId, skipScreening, skipJobId, skipCandidateId],
      );
      await client.query(
        `INSERT INTO upload_batches (id, workspace_id, job_id, status, total_files)
         VALUES ('ffffffff-ffff-4fff-8fff-fffffffffff1', $1, $2, 'processing', 1)`,
        [adaWorkspace, skipJobId],
      );
      await client.query(
        `INSERT INTO upload_batch_files (id, batch_id, candidate_id, screening_id, filename, status)
         VALUES ($1, 'ffffffff-ffff-4fff-8fff-fffffffffff1', $2, $3, 'noted.pdf', 'pending')`,
        [skipFileId, skipCandidateId, skipScreening],
      );
    } finally {
      await client.end();
    }

    const controller = await import("../controllers/screeningController.js");
    const auth = await import("../middlewares/authMiddleware.js");
    const queue = await import("../utils/screeningQueue.js");
    const signer = await import("../utils/signCvDownload.js");
    listScreenings = controller.listScreenings;
    exportScreenings = controller.exportScreenings;
    updateStatus = controller.updateStatus;
    viewCv = controller.viewCv;
    isRecruiter = auth.isRecruiter;
    processScreeningCv = queue.processScreeningCv;
    cvSigner = signer.cvSigner;
    originalSign = cvSigner.sign;
    cvSigner.sign = async (input) => {
      signedKeys.push(input.key);
      return `https://signed.example/${encodeURIComponent(input.key)}?expires=300`;
    };
  });

  after(async () => {
    if (cvSigner && originalSign) cvSigner.sign = originalSign;
    const db = (await import("../db.js")).default as unknown as { end: () => Promise<void> };
    await db.end();
  });

  function asRecruiter(id: string, handler: typeof listScreenings, params: Record<string, string>, body?: unknown) {
    return invoke(handler, { user: { id, role: "recruiter" }, params, body } as Partial<Request>);
  }

  test("ranks by cosine distance, including tied scores of zero", async () => {
    const distances = await query<{ full_name: string; distance: number }>(
      `SELECT c.full_name, (c.embedding <=> j.embedding) AS distance
       FROM screenings s
       JOIN candidates c ON c.id = s.candidate_id
       JOIN jobs j ON j.id = s.job_id
       WHERE s.job_id = $1 AND c.embedding IS NOT NULL AND c.workspace_id = j.workspace_id
       ORDER BY (c.embedding <=> j.embedding) ASC`,
      [jobId],
    );
    assert.deepEqual(distances.map((row) => row.full_name), ["Perfect, Ada", "Mid", "Clamped", "Farther"]);
    assert.ok(Number(distances[2]?.distance) > 1);
    assert.ok(Number(distances[3]?.distance) > Number(distances[2]?.distance));

    const listed = await asRecruiter(adaId, listScreenings, { jobId });
    assert.equal(listed.error, undefined);
    const body = listed.body as Listed;
    assert.deepEqual(body.screenings.map((row) => row.name), ["Perfect, Ada", "Mid", "Clamped", "Farther", "Waiting"]);
    assert.deepEqual(body.screenings.map((row) => row.match_percent), [100, 60, 0, 0, null]);
    assert.equal(body.screenings[4]?.pipeline, "processing");
    assert.equal(body.screenings.some((row) => row.name === "Leaked"), false);
    assert.equal(body.screenings[0]?.email, "ada@example.com");

    const outsider = await asRecruiter(graceId, listScreenings, { jobId });
    assert.equal((outsider.error as { httpCode: number }).httpCode, 404);
    assert.equal((outsider.error as Error).message, "Role not found.");
  });

  test("status updates are limited to workspace members and the three decision values", async () => {
    assert.throws(
      () => isRecruiter(
        { user: { id: adaId, role: "job_seeker" } } as Request,
        {} as Response,
        (() => undefined) as NextFunction,
      ),
      (error: unknown) => (error as { httpCode: number }).httpCode === 403,
    );

    const denied = await asRecruiter(graceId, updateStatus, { id: perfectScreening }, { status: "shortlisted" });
    assert.equal((denied.error as { httpCode: number }).httpCode, 404);
    assert.equal((denied.error as Error).message, "Screening not found.");

    const hidden = await asRecruiter(adaId, updateStatus, { id: leakedScreening }, { status: "rejected" });
    assert.equal((hidden.error as { httpCode: number }).httpCode, 404);

    const invalid = await asRecruiter(adaId, updateStatus, { id: perfectScreening }, { status: "hired" });
    assert.equal((invalid.error as { httpCode: number }).httpCode, 400);

    for (const status of ["shortlisted", "rejected", "new"] as const) {
      const updated = await asRecruiter(linId, updateStatus, { id: perfectScreening }, { status });
      assert.equal(updated.error, undefined);
      assert.equal(updated.statusCode, 200);
      assert.deepEqual(updated.body, { id: perfectScreening, status });
    }
  });

  test("csv export follows the ranked list and stays inside the workspace", async () => {
    const exported = await asRecruiter(adaId, exportScreenings, { jobId });
    assert.equal(exported.error, undefined);
    assert.match(exported.headers["content-type"] ?? "", /text\/csv/);
    const csv = String(exported.body);
    assert.equal(csv.startsWith("\uFEFFName,Email,Match %"), true);
    const text = csv.replace(/^\uFEFF/, "");
    const perfectAt = text.indexOf("Perfect, Ada");
    const midAt = text.indexOf("Mid");
    const clampedAt = text.indexOf("Clamped");
    const fartherAt = text.indexOf("Farther");
    const waitingAt = text.indexOf("Waiting");
    assert.ok(perfectAt >= 0 && perfectAt < midAt && midAt < clampedAt && clampedAt < fartherAt && fartherAt < waitingAt);
    assert.match(text, /100,new,Closest fit\.,"APIs, billing","Said ""SQL"""/);
    assert.equal(text.includes("leak@example.com"), false);
    assert.equal(text.includes("Leaked"), false);

    const denied = await asRecruiter(graceId, exportScreenings, { jobId });
    assert.equal((denied.error as { httpCode: number }).httpCode, 404);
    assert.equal(shortlistCsv([]).includes("Name,Email,Match %"), true);
  });

  test("signed CV urls are minted only for a screening in the caller workspace", async () => {
    signedKeys.length = 0;
    const owned = await asRecruiter(adaId, viewCv, { id: perfectScreening });
    assert.equal(owned.error, undefined);
    assert.equal(owned.statusCode, 200);
    const body = owned.body as { url: string; expires_in: number; filename: string };
    assert.equal(body.expires_in, 300);
    assert.equal(body.filename, "perfect.pdf");
    assert.equal(body.url, "https://signed.example/cvs%2Fperfect.pdf?expires=300");
    assert.deepEqual(signedKeys, ["cvs/perfect.pdf"]);

    const outsider = await asRecruiter(graceId, viewCv, { id: perfectScreening });
    assert.equal((outsider.error as { httpCode: number }).httpCode, 404);
    const mismatched = await asRecruiter(adaId, viewCv, { id: leakedScreening });
    assert.equal((mismatched.error as { httpCode: number }).httpCode, 404);
    const graceOwn = await asRecruiter(graceId, viewCv, { id: leakedScreening });
    assert.equal((graceOwn.error as { httpCode: number }).httpCode, 404);
    assert.deepEqual(signedKeys, ["cvs/perfect.pdf"]);
  });

  test("a stored fit summary is not sent to OpenAI again", async () => {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      throw new Error("OpenAI should not be called");
    };
    try {
      await processScreeningCv({
        id: "99999999-9999-4999-8999-999999999999",
        data: { candidateId: skipCandidateId, screeningId: skipScreening, batchFileId: skipFileId },
        retryCount: 0,
      });
      assert.equal(calls, 0);
      const row = await query<{ status: string; reason_summary: string }>(
        `SELECT f.status, s.reason_summary
         FROM upload_batch_files f JOIN screenings s ON s.id = f.screening_id
         WHERE f.id = $1`,
        [skipFileId],
      );
      assert.equal(row[0]?.status, "completed");
      assert.equal(row[0]?.reason_summary, "Already noted.");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { Client } from "pg";

const databaseUrl = "postgres://shortlistly:shortlistly@127.0.0.1:5432/shortlistly_phase1";
const adminUrl = "postgres://shortlistly:shortlistly@127.0.0.1:5432/postgres";
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET ??= "test-secret";
process.env.AWS_REGION ??= "us-east-1";
process.env.JOB_SEEKER_FEATURES = "false";

const modelsDir = path.join(process.cwd(), "models");
const adaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const graceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const seekerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const adaJobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const graceJobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";

function sqlFile(name: string): string {
  return readFileSync(path.join(modelsDir, name), "utf8");
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

describe("recruiter workspaces", { concurrency: 1 }, () => {
  before(async () => {
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'shortlistly_phase1' AND pid <> pg_backend_pid()",
      );
      await admin.query("DROP DATABASE IF EXISTS shortlistly_phase1");
      await admin.query("CREATE DATABASE shortlistly_phase1");
    } finally {
      await admin.end();
    }

    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query(sqlFile("setup.sql"));
      const tables = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('workspaces', 'workspace_members', 'candidates', 'upload_batches', 'screenings')`,
      );
      assert.equal(tables.rowCount, 5);

      await client.query(`
        DROP TABLE IF EXISTS public.screenings, public.upload_batches, public.candidates, public.workspace_members, public.workspaces CASCADE;
        ALTER TABLE public.jobs DROP COLUMN IF EXISTS workspace_id;
      `);
      await client.query(
        `INSERT INTO users (id, email, full_name, role, password_hash, hasprofile, created_at)
         VALUES ($1, 'ada@example.com', 'Ada Lovelace', 'recruiter', 'x', true, NOW()),
                ($2, 'grace@example.com', 'Grace Hopper', 'recruiter', 'x', false, NOW()),
                ($3, 'alan@example.com', 'Alan Turing', 'job_seeker', 'x', true, NOW())`,
        [adaId, graceId, seekerId],
      );
      await client.query(
        `INSERT INTO recruiter (user_id, company_name, type_of_organization, location)
         VALUES ($1, 'Analytical Engines', 'agency', 'London')`,
        [adaId],
      );
      await client.query(
        `INSERT INTO job_seeker
           (user_id, job_title, location, remote_preference, resume_s3_key, resume_filename,
            parsed_resume, embedding, resume_processing_status, created_at)
         VALUES ($1, 'Engineer', 'London', 'remote', 'resumes/alan.pdf', 'alan.pdf',
                 '{"phone":"+44 20"}'::jsonb, array_fill(0, ARRAY[768])::vector, 'completed', NOW())`,
        [seekerId],
      );
      await client.query(
        `INSERT INTO jobs
           (id, recruiter_id, job_title, job_description, location, required_skills, job_status, work_type, created_at)
         VALUES ($1, $2, 'Mathematician', 'Compute tables', 'London', ARRAY['math'], 'active', 'remote', NOW()),
                ($3, $4, 'Compiler', 'Build a compiler', 'Remote', ARRAY['compilers'], 'active', 'remote', NOW())`,
        [adaJobId, adaId, graceJobId, graceId],
      );
      await client.query(
        `INSERT INTO applications (job_id, job_seeker_id, status, score, applied_at)
         VALUES ($1, $2, 'Hired', 0.91, NOW())`,
        [adaJobId, seekerId],
      );
      await client.query(sqlFile("20261122_recruiter_workspaces.sql"));
      await client.query(sqlFile("20261122_recruiter_workspaces.sql"));
    } finally {
      await client.end();
    }
  });

  after(async () => {
    const db = (await import("../db.js")).default as unknown as { end: () => Promise<void> };
    await db.end();
  });

  test("backfill creates one owner workspace per recruiter and keeps seeker tables", async () => {
    const workspaces = await query<{ full_name: string; name: string; member_role: string; workspaces: string }>(
      `SELECT u.full_name, w.name, wm.member_role, count(*) OVER (PARTITION BY u.id) AS workspaces
       FROM users u
       JOIN workspace_members wm ON wm.user_id = u.id
       JOIN workspaces w ON w.id = wm.workspace_id
       ORDER BY u.full_name`,
    );
    assert.deepEqual(workspaces, [
      { full_name: "Ada Lovelace", name: "Analytical Engines", member_role: "owner", workspaces: "1" },
      { full_name: "Grace Hopper", name: "Grace Hopper's workspace", member_role: "owner", workspaces: "1" },
    ]);

    const seekerMembership = await query("SELECT 1 FROM workspace_members WHERE user_id = $1", [seekerId]);
    assert.equal(seekerMembership.length, 0);

    const jobs = await query<{ id: string; workspace_name: string }>(
      `SELECT j.id, w.name AS workspace_name
       FROM jobs j
       JOIN workspaces w ON w.id = j.workspace_id
       ORDER BY j.job_title`,
    );
    assert.deepEqual(jobs, [
      { id: graceJobId, workspace_name: "Grace Hopper's workspace" },
      { id: adaJobId, workspace_name: "Analytical Engines" },
    ]);

    const applications = await query("SELECT status::text AS status FROM applications");
    assert.deepEqual(applications, [{ status: "Hired" }]);
    const seekers = await query("SELECT user_id FROM job_seeker");
    assert.equal(seekers.length, 1);

    const candidates = await query<{
      full_name: string;
      email: string;
      phone: string;
      processing_status: string;
      workspace_name: string;
      has_embedding: boolean;
    }>(
      `SELECT c.full_name, c.email, c.phone, c.processing_status, w.name AS workspace_name,
              c.embedding IS NOT NULL AS has_embedding
       FROM candidates c
       JOIN workspaces w ON w.id = c.workspace_id`,
    );
    assert.deepEqual(candidates, [{
      full_name: "Alan Turing",
      email: "alan@example.com",
      phone: "+44 20",
      processing_status: "completed",
      workspace_name: "Analytical Engines",
      has_embedding: true,
    }]);

    const screenings = await query<{ status: string; score: number; reason_status: string }>(
      `SELECT s.status, s.score, s.reason_status
       FROM screenings s
       WHERE s.job_id = $1`,
      [adaJobId],
    );
    assert.equal(screenings.length, 1);
    assert.equal(screenings[0]?.status, "hired");
    assert.equal(Number(screenings[0]?.score), 0.91);
    assert.equal(screenings[0]?.reason_status, "pending");

    const types = await query<{ rel: string; formatted: string }>(
      `SELECT c.relname AS rel, format_type(a.atttypid, a.atttypmod) AS formatted
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname IN ('jobs', 'candidates', 'job_seeker')
         AND a.attname = 'embedding'
         AND NOT a.attisdropped
       ORDER BY c.relname`,
    );
    assert.deepEqual(types.map((row) => row.formatted), ["vector(768)", "vector(768)", "vector(768)"]);

    const indexes = await query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE indexname IN ('candidates_embedding_hnsw_idx', 'candidates_workspace_file_sha256_idx')
       ORDER BY indexname`,
    );
    assert.match(indexes[0]?.indexdef ?? "", /USING hnsw/i);
    assert.match(indexes[0]?.indexdef ?? "", /vector_cosine_ops/);
    assert.match(indexes[1]?.indexdef ?? "", /WHERE \(file_sha256 IS NOT NULL\)/i);
  });

  test("an existing recruiter still sees their backfilled job", async () => {
    const { getJobsByRecruiter } = await import("../controllers/jobsController.js");
    const response = {
      statusCode: 0,
      body: undefined as { jobs: Array<{ id: string }> } | undefined,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: { jobs: Array<{ id: string }> }) {
        this.body = body;
        return this;
      },
    };
    let received: unknown;
    await getJobsByRecruiter(
      { user: { id: adaId, role: "recruiter" }, params: { recruiterId: adaId } } as unknown as Request,
      response as unknown as Response,
      ((error: unknown) => { received = error; }) as NextFunction,
    );
    assert.equal(received, undefined);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body?.jobs.map((job) => job.id), [adaJobId]);
  });

  test("signup creates a recruiter owner workspace and ignores a job seeker role", async () => {
    const previous = process.env.JOB_SEEKER_FEATURES;
    process.env.JOB_SEEKER_FEATURES = "false";
    const { register } = await import("../controllers/authController.js");
    try {
      const plain = await postRegister(register, {
        email: "katherine@example.com",
        full_name: "Katherine Johnson",
        password: "abcdef",
        role: "job_seeker",
      });
      assert.equal(plain.statusCode, 201);
      assert.equal((plain.body as { user: { role: string } }).user.role, "recruiter");

      const named = await postRegister(register, {
        email: "global@example.com",
        full_name: "Global Owner",
        password: "abcdef",
        company_name: "Global Hire",
      });
      assert.equal(named.statusCode, 201);

      const rows = await query<{ email: string; role: string; name: string; member_role: string }>(
        `SELECT u.email, u.role, w.name, wm.member_role
         FROM users u
         JOIN workspace_members wm ON wm.user_id = u.id
         JOIN workspaces w ON w.id = wm.workspace_id
         WHERE u.email IN ('katherine@example.com', 'global@example.com')
         ORDER BY u.email`,
      );
      assert.deepEqual(rows, [
        { email: "global@example.com", role: "recruiter", name: "Global Hire", member_role: "owner" },
        { email: "katherine@example.com", role: "recruiter", name: "Katherine Johnson's workspace", member_role: "owner" },
      ]);
      const seekerRows = await query(
        "SELECT 1 FROM job_seeker js JOIN users u ON u.id = js.user_id WHERE u.email = 'katherine@example.com'",
      );
      assert.equal(seekerRows.length, 0);
    } finally {
      if (previous === undefined) delete process.env.JOB_SEEKER_FEATURES;
      else process.env.JOB_SEEKER_FEATURES = previous;
    }
  });
});

async function postRegister(
  register: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
  body: Record<string, unknown>,
) {
  const response = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    cookie() {
      return this;
    },
  };
  let received: unknown;
  await register(
    { body } as unknown as Request,
    response as unknown as Response,
    ((error: unknown) => { received = error; }) as NextFunction,
  );
  assert.equal(received, undefined);
  return response;
}

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { matchPercent } from "../utils/matchPercent";

process.env.DATABASE_URL ??= "postgres://shortlistly:shortlistly@127.0.0.1:5432/shortlistly";
process.env.JOB_SEEKER_FEATURES = "true";

const recruiterId = "55555555-5555-4555-8555-555555555555";
const seekerId = "44444444-4444-4444-8444-444444444444";
const noResumeId = "66666666-6666-4666-8666-666666666666";
const processingId = "77777777-7777-4777-8777-777777777777";
const userIds = [recruiterId, seekerId, noResumeId, processingId];
const bestId = "10000000-0000-4000-8000-000000000001";
const partialId = "10000000-0000-4000-8000-000000000002";
const poorId = "10000000-0000-4000-8000-000000000003";
const appliedId = "10000000-0000-4000-8000-000000000004";
const closedId = "10000000-0000-4000-8000-000000000005";
const missingId = "10000000-0000-4000-8000-000000000006";
const jobIds = [bestId, partialId, poorId, appliedId, closedId, missingId];

function embedding(first: number, second = 0): string {
  const values = Array.from({ length: 768 }, (_, index) => {
    if (index === 0) return first;
    if (index === 1) return second;
    return 0;
  });
  return `[${values.join(",")}]`;
}

function jsonResponse() {
  return {
    statusCode: 0,
    body: undefined as {
      jobs: Array<{ id: string; job_title: string; similarity: number; matchPercent: number }>;
      status: string;
      reason?: string;
      limit?: number;
      offset?: number;
    } | undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: NonNullable<typeof this.body>) {
      this.body = body;
      return this;
    },
  };
}

describe("recommended jobs", { concurrency: 1 }, () => {
  let getRecommendedJobs: typeof import("../controllers/jobsController.js").getRecommendedJobs;
  let isJobSeeker: typeof import("../middlewares/authMiddleware.js").isJobSeeker;
  let pool: {
    query: (text: string, params?: readonly unknown[]) => Promise<{
      rowCount: number | null;
      rows: Array<Record<string, unknown>>;
    }>;
    end: () => Promise<void>;
  };

  before(async () => {
    ({ getRecommendedJobs } = await import("../controllers/jobsController.js"));
    ({ isJobSeeker } = await import("../middlewares/authMiddleware.js"));
    pool = (await import("../db.js")).default as unknown as typeof pool;
    await cleanup();

    const index = await pool.query(
      "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'jobs_embedding_hnsw_idx'",
    );
    const indexdef = String(index.rows[0]?.indexdef ?? "");
    assert.equal(index.rowCount, 1);
    assert.match(indexdef, /USING hnsw/i);
    assert.match(indexdef, /vector_cosine_ops/);

    await pool.query(
      `INSERT INTO users (id, email, full_name, role, hasprofile)
       VALUES ($1, 'recommended-recruiter@example.com', 'Recruiter', 'recruiter', true),
              ($2, 'recommended-seeker@example.com', 'Seeker', 'job_seeker', true),
              ($3, 'recommended-no-resume@example.com', 'No Resume', 'job_seeker', false),
              ($4, 'recommended-processing@example.com', 'Processing', 'job_seeker', true)`,
      userIds,
    );
    const resume = embedding(1);
    await pool.query(
      `INSERT INTO job_seeker
         (user_id, job_title, location, remote_preference, resume_s3_key, resume_filename,
          embedding, parsed_resume, resume_processing_status, created_at)
       VALUES ($1, 'Engineer', 'Lagos', 'remote', 'resumes/seeker.pdf', 'resume.pdf',
               $2::vector, '{}'::jsonb, 'completed', NOW())`,
      [seekerId, resume],
    );
    await pool.query(
      `INSERT INTO job_seeker
         (user_id, job_title, location, remote_preference, resume_s3_key, resume_filename,
          resume_processing_status, created_at)
       VALUES ($1, 'Engineer', 'Lagos', 'remote', 'resumes/processing.pdf', 'resume.pdf',
               'processing', NOW())`,
      [processingId],
    );
    const jobs = [
      [bestId, "Best fit", "active", "completed", resume],
      [partialId, "Partial fit", "active", "completed", embedding(0.6, 0.8)],
      [poorId, "Poor fit", "active", "completed", embedding(-1)],
      [appliedId, "Already applied", "active", "completed", resume],
      [closedId, "Closed role", "closed", "completed", resume],
      [missingId, "Missing embedding", "active", "pending", null],
    ] as const;
    for (const [id, title, status, embeddingStatus, vector] of jobs) {
      await pool.query(
        `INSERT INTO jobs
           (id, recruiter_id, job_title, job_description, location, required_skills,
            job_status, work_type, summary, embedding_status, embedding, created_at)
         VALUES ($1, $2, $3, $4, 'Remote', ARRAY['TypeScript'], $5, 'remote', $6, $7, $8::vector, NOW())`,
        [id, recruiterId, title, `${title} description`, status, `${title} summary`, embeddingStatus, vector],
      );
    }
    await pool.query(
      `INSERT INTO applications (job_id, job_seeker_id, status, score, applied_at)
       VALUES ($1, $2, 'Applied', 1, NOW())`,
      [appliedId, seekerId],
    );
  });

  after(async () => {
    if (pool) {
      await cleanup();
      await pool.end();
    }
  });

  test("matchPercent maps cosine similarity onto 0-100", () => {
    assert.equal(matchPercent(1), 100);
    assert.equal(matchPercent(0.6), 60);
    assert.equal(matchPercent(0), 0);
    assert.equal(matchPercent(1.4), 100);
    assert.equal(matchPercent(-0.2), 0);
    assert.equal(matchPercent(0.7071067811865475), 71);
  });

  test("isJobSeeker rejects other roles", () => {
    assert.throws(
      () => isJobSeeker(
        { user: { role: "recruiter" } } as Request,
        {} as Response,
        (() => undefined) as NextFunction,
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal((error as { httpCode?: number }).httpCode, 403);
        assert.match(error.message, /job seekers/i);
        return true;
      },
    );
    let continued = false;
    isJobSeeker(
      { user: { role: "job_seeker" } } as Request,
      {} as Response,
      (() => { continued = true; }) as NextFunction,
    );
    assert.equal(continued, true);
  });

  test("orders seeded jobs by cosine distance and reports matchPercent", async () => {
    const { res, received } = await recommend(seekerId, "job_seeker");
    assert.equal(received, undefined);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.status, "ready");
    const jobs = res.body?.jobs ?? [];
    assert.deepEqual(jobs.map((job) => job.job_title), ["Best fit", "Partial fit", "Poor fit"]);
    assert.deepEqual(jobs.map((job) => job.id), [bestId, partialId, poorId]);
    assert.ok(Math.abs(jobs[0]!.similarity - 1) < 1e-6);
    assert.ok(Math.abs(jobs[1]!.similarity - 0.6) < 1e-5);
    assert.equal(jobs[2]!.similarity, 0);
    assert.deepEqual(jobs.map((job) => job.matchPercent), [100, 60, 0]);
    assert.equal(jobs[1]!.matchPercent, matchPercent(jobs[1]!.similarity));

    const page = await recommend(seekerId, "job_seeker", { limit: "1", offset: "1" });
    assert.equal(page.received, undefined);
    assert.equal(page.res.body?.limit, 1);
    assert.equal(page.res.body?.offset, 1);
    assert.deepEqual(page.res.body?.jobs.map((job) => job.job_title), ["Partial fit"]);
  });

  test("tells a job seeker to upload a resume instead of returning a bare list", async () => {
    const { res, received } = await recommend(noResumeId, "job_seeker");
    assert.equal(received, undefined);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body?.jobs, []);
    assert.equal(res.body?.status, "no_resume");
    assert.match(res.body?.reason ?? "", /upload a resume/i);
  });

  test("reports when the resume embedding is still processing", async () => {
    const { res, received } = await recommend(processingId, "job_seeker");
    assert.equal(received, undefined);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body?.jobs, []);
    assert.equal(res.body?.status, "processing");
    assert.match(res.body?.reason ?? "", /still being processed/i);
  });

  test("getRecommendedJobs rejects recruiters", async () => {
    const { res, received } = await recommend(recruiterId, "recruiter");
    assert.equal(res.statusCode, 0);
    assert.ok(received instanceof Error);
    assert.equal((received as { httpCode?: number }).httpCode, 403);
    assert.match(received.message, /job seekers/i);
  });

  test("rejects a limit outside 1-50", async () => {
    const low = await recommend(seekerId, "job_seeker", { limit: "0" });
    assert.ok(low.received instanceof Error);
    assert.equal((low.received as { httpCode?: number }).httpCode, 400);

    const high = await recommend(seekerId, "job_seeker", { limit: "51" });
    assert.ok(high.received instanceof Error);
    assert.equal((high.received as { httpCode?: number }).httpCode, 400);

    const bogus = await recommend(seekerId, "job_seeker", { limit: "many" });
    assert.ok(bogus.received instanceof ZodError);
  });

  async function recommend(id: string, role: string, query: Record<string, string> = {}) {
    const res = jsonResponse();
    let received: unknown;
    await getRecommendedJobs(
      { user: { id, role }, query } as unknown as Request,
      res as unknown as Response,
      ((error: unknown) => { received = error; }) as NextFunction,
    );
    return { res, received };
  }

  async function cleanup() {
    await pool.query("DELETE FROM applications WHERE job_id = ANY($1::uuid[]) OR job_seeker_id = ANY($2::uuid[])", [jobIds, userIds]);
    await pool.query("DELETE FROM jobs WHERE id = ANY($1::uuid[])", [jobIds]);
    await pool.query("DELETE FROM job_seeker WHERE user_id = ANY($1::uuid[])", [userIds]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds]);
  }
});

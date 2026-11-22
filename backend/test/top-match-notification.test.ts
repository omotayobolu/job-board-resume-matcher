import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";

process.env.JOB_SEEKER_FEATURES = "true";

type MockablePool = {
  query: (...args: unknown[]) => Promise<unknown>;
};

const jobId = "11111111-1111-4111-8111-111111111111";
const seekerId = "22222222-2222-4222-8222-222222222222";
const recruiterId = "33333333-3333-4333-8333-333333333333";

test("top match copy uses a 0..1 score as a percentage and a 0.6 priority cutoff", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  const { buildTopMatchNotification } = await import("../controllers/applicationController.js");
  const high = buildTopMatchNotification("Ada Lovelace", "Engineer", 0.6);
  assert.equal(high.heading, "Top Match!");
  assert.equal(high.priority, "high");
  assert.equal(
    high.message,
    "Ada Lovelace matched above 60% in your active Engineer listing. Ada appears to be the most suitable candidate for this role based on their skills, tools, and experience.",
  );

  const medium = buildTopMatchNotification("Grace Hopper", "Engineer", 0.599);
  assert.equal(medium.priority, "medium");
  assert.match(medium.message, /matched above 60%/);

  const perfect = buildTopMatchNotification("Ada Lovelace", "Engineer", 1);
  assert.equal(perfect.priority, "high");
  assert.match(perfect.message, /matched above 100%/);
});

test("applying notifies the recruiter only after the real score is saved", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  const [{ applyToJob, buildTopMatchNotification }, dbModule] = await Promise.all([
    import("../controllers/applicationController.js"),
    import("../db.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  let storedScore = 0;
  const events: string[] = [];
  let statusCode = 0;
  pool.query = async (sql, params) => {
    const text = String(sql);
    const values = params as unknown[];
    if (text.includes("SELECT recruiter_id FROM jobs")) {
      return { rowCount: 1, rows: [{ recruiter_id: recruiterId }] };
    }
    if (text.includes("SELECT id, role FROM users")) {
      assert.deepEqual(values, [seekerId]);
      return { rowCount: 1, rows: [{ id: seekerId, role: "job_seeker" }] };
    }
    if (text.includes("SELECT id FROM applications")) {
      return { rowCount: 0, rows: [] };
    }
    if (text.includes("INSERT INTO applications")) {
      storedScore = 0;
      events.push("insert");
      return {
        rowCount: 1,
        rows: [{
          id: "app-1",
          job_id: jobId,
          job_seeker_id: seekerId,
          status: "Applied",
          score: 0,
          applied_at: new Date(),
        }],
      };
    }
    if (text.includes("UPDATE applications")) {
      storedScore = 0.75;
      events.push("score");
      return { rowCount: 1, rows: [{ score: storedScore }] };
    }
    if (text.includes("SELECT id, job_title FROM jobs")) {
      return { rowCount: 1, rows: [{ id: jobId, job_title: "Engineer" }] };
    }
    if (text.includes("ORDER BY a.score DESC")) {
      assert.equal(storedScore, 0.75);
      return {
        rowCount: 1,
        rows: [{ job_id: jobId, job_seeker_id: seekerId, score: storedScore }],
      };
    }
    if (text.includes("SELECT full_name FROM users")) {
      return { rowCount: 1, rows: [{ full_name: "Ada Lovelace" }] };
    }
    if (text.includes("FROM notifications")) {
      return { rowCount: 0, rows: [] };
    }
    if (text.includes("INSERT INTO notifications")) {
      events.push("notify");
      const expected = buildTopMatchNotification("Ada Lovelace", "Engineer", 0.75);
      assert.deepEqual(values, [
        recruiterId,
        expected.heading,
        expected.message,
        "high",
        false,
        seekerId,
        jobId,
      ]);
      return { rowCount: 1, rows: [] };
    }
    assert.fail(`Unexpected query: ${text}`);
  };
  const response = {
    status(code: number) {
      statusCode = code;
      events.push("response");
      return this;
    },
    json() {
      return this;
    },
  } as Response;
  try {
    await applyToJob(
      { user: { id: seekerId, role: "job_seeker" }, body: { jobId } } as unknown as Request,
      response,
      (() => assert.fail("Unexpected error")) as NextFunction,
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(statusCode, 201);
    assert.deepEqual(events, ["insert", "response", "score", "notify"]);
  } finally {
    pool.query = originalQuery;
  }
});

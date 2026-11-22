import assert from "node:assert/strict";
import { test } from "node:test";
import type { PoolClient } from "pg";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
process.env.AWS_REGION = "us-east-1";
process.env.OPENAI_API_KEY = "test-key";

type Pool = {
  query: (...args: unknown[]) => Promise<unknown>;
  transaction: <T>(work: (client: PoolClient) => Promise<T>) => Promise<T>;
};

test("startup reserves missing notes once, skips live owners, and reclaims dead reservations", async () => {
  const [{ enqueueMissingScreeningReasons, screeningQueue }, db] = await Promise.all([
    import("../utils/screeningQueue.js"), import("../db.js"),
  ]);
  const pool = db.default as unknown as Pool;
  const original = { query: pool.query, transaction: pool.transaction,
    enqueue: screeningQueue.enqueue, jobState: screeningQueue.jobState };
  const rows = new Map([
    ["completed-batch", { candidate_id: "c1", reason_token: null as string | null }],
    ["no-batch", { candidate_id: "c2", reason_token: null as string | null }],
  ]);
  const states = new Map<string, string>();
  const payloads: unknown[] = [];
  let failSave = false;
  pool.query = async (sql) => {
    assert.match(String(sql), /s.score IS NOT NULL/);
    assert.match(String(sql), /c.parsed_resume IS NOT NULL/);
    assert.doesNotMatch(String(sql), /upload_batch_files|processing_job_id/);
    return { rows: [...rows.keys()].map((id) => ({ id })) };
  };
  pool.transaction = async (work) => work({ query: async (sql: string, params: unknown[]) => {
    const row = rows.get(String(params[0]));
    assert.ok(row);
    if (sql.startsWith("SELECT")) {
      assert.match(sql, /FOR UPDATE OF s SKIP LOCKED/);
      return { rows: [{ ...row }] };
    }
    assert.match(sql, /UPDATE screenings SET reason_status = 'processing'/);
    if (failSave) throw new Error("reservation failed");
    row.reason_token = String(params[1]);
    return { rowCount: 1, rows: [] };
  } } as unknown as PoolClient);
  screeningQueue.enqueue = async (_client, payload) => {
    assert.equal(payload.reasonOnly, true);
    assert.equal(payload.batchFileId, undefined);
    payloads.push(payload);
    const id = `job-${payloads.length}`;
    states.set(id, "created");
    return id;
  };
  screeningQueue.jobState = async (id) => states.get(id);
  try {
    await enqueueMissingScreeningReasons();
    assert.equal(payloads.length, 2);
    await enqueueMissingScreeningReasons();
    assert.equal(payloads.length, 2);
    states.set(rows.get("completed-batch")!.reason_token!, "active");
    states.set(rows.get("no-batch")!.reason_token!, "retry");
    await enqueueMissingScreeningReasons();
    assert.equal(payloads.length, 2);
    states.set(rows.get("completed-batch")!.reason_token!, "failed");
    states.delete(rows.get("no-batch")!.reason_token!);
    await enqueueMissingScreeningReasons();
    assert.equal(payloads.length, 4);
    states.set(rows.get("no-batch")!.reason_token!, "completed");
    failSave = true;
    await assert.rejects(enqueueMissingScreeningReasons(), /reservation failed/);
  } finally {
    pool.query = original.query;
    pool.transaction = original.transaction;
    screeningQueue.enqueue = original.enqueue;
    screeningQueue.jobState = original.jobState;
  }
});

test("reason-only work handles completed/no-batch rows without parsing or bumping counters", async () => {
  const [{ processScreeningCv }, db] = await Promise.all([
    import("../utils/screeningQueue.js"), import("../db.js"),
  ]);
  const pool = db.default as unknown as Pool;
  const original = { query: pool.query, transaction: pool.transaction, fetch: global.fetch };
  let summary: string | null = null;
  let owner = "job";
  let calls = 0;
  let fail = false;
  let failedStatus = "";
  let failedToken: unknown;
  pool.transaction = async () => { assert.fail("Completed batches must not be counted again"); };
  pool.query = async (sql, params) => {
    const text = String(sql);
    const values = params as unknown[];
    assert.doesNotMatch(text, /UPDATE candidates|SELECT status FROM upload_batch_files/);
    if (text.includes("SET reason_status = 'processing'")) {
      assert.match(text, /reason_token IS NULL OR reason_token = \$2::uuid/);
      return { rows: summary || owner !== values[1] ? [] : [{ id: "screening" }] };
    }
    if (text.includes("SELECT reason_summary, score")) return { rows: [{ reason_summary: summary, score: 0.9 }] };
    if (text.includes("SELECT j.job_title")) return { rows: [{ job_title: "Engineer", job_description: "TypeScript", parsed_resume: {} }] };
    if (text.includes("SET reason_summary =")) { summary = String(values[2]); return { rowCount: 1, rows: [] }; }
    if (text.includes("SET reason_status = $3")) {
      failedStatus = String(values[2]); failedToken = values[3];
      return { rowCount: 1, rows: [] };
    }
    assert.match(text, /SELECT f.id/);
    return { rows: [] }; // Completed or legacy rows have no open batch files.
  };
  global.fetch = async (url) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    calls += 1;
    if (fail) throw new Error("notes failed");
    return new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{
      type: "output_text", text: JSON.stringify({ summary: "Good fit.", strengths: [], gaps: [], must_haves: [] }),
    }] }] }), { status: 200 });
  };
  const job = { id: "job", data: { candidateId: "candidate", screeningId: "screening", reasonOnly: true }, retryCount: 0 };
  try {
    await processScreeningCv(job);
    assert.equal(summary, "Good fit.");
    await processScreeningCv(job);
    assert.equal(calls, 1);
    summary = null;
    fail = true;
    await assert.rejects(processScreeningCv(job), /notes failed/);
    assert.equal(failedStatus, "processing");
    assert.equal(failedToken, job.id);
    await assert.rejects(processScreeningCv({ ...job, retryCount: 2 }), /notes failed/);
    assert.equal(failedStatus, "failed");
    assert.equal(failedToken, null);
    owner = "another-live-job";
    fail = false;
    const before = calls;
    await assert.rejects(processScreeningCv(job), /still processing/);
    assert.equal(calls, before);
  } finally {
    pool.query = original.query;
    pool.transaction = original.transaction;
    global.fetch = original.fetch;
  }
});

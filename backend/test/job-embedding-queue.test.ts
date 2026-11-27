import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response, NextFunction } from "express";
import type { PoolClient } from "pg";

type MockablePool = {
  query: (...args: unknown[]) => Promise<unknown>;
  transaction: <T>(work: (client: PoolClient) => Promise<T>) => Promise<T>;
};

const details = {
  job_title: "Engineer", job_description: "Build backend services",
  location: "Lagos", required_skills: ["TypeScript"], work_type: "remote",
};

test("job creation inserts and enqueues on the same transaction client before returning 201", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  const [{ createJob }, dbModule, { jobEmbeddingQueue }] = await Promise.all([
    import("../controllers/jobsController.js"), import("../db.js"), import("../utils/jobEmbeddingQueue.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  const originalTransaction = pool.transaction;
  const originalEnqueue = jobEmbeddingQueue.enqueue;
  const originalFetch = global.fetch;
  try {
    for (const fail of [false, true]) {
      const events: string[] = [];
      const failure = new Error("Queue insert failed");
      let received: unknown;
      pool.query = async () => { assert.fail("No queries outside the transaction"); };
      global.fetch = async () => { assert.fail("No AI calls in the request"); };
      const client = {
        query: async (sql: string, params: unknown[]) => {
          if (sql.startsWith("INSERT INTO jobs")) {
            assert.match(sql, /embedding_status/);
            assert.match(sql, /'pending'/);
            assert.deepEqual(params, ["recruiter-id", details.job_title, details.job_description,
              details.location, details.required_skills, "active", details.work_type]);
            events.push("insert");
            return { rows: [{ id: "job-id" }] };
          }
          assert.equal(sql, "UPDATE jobs SET embedding_job_id = $1 WHERE id = $2");
          assert.deepEqual(params, ["queue-id", "job-id"]);
          events.push("save-queue-id");
          return { rows: [] };
        },
      } as unknown as PoolClient;
      pool.transaction = async (work) => {
        events.push("begin");
        try {
          const result = await work(client);
          events.push("commit");
          return result;
        } catch (error) {
          events.push("rollback");
          throw error;
        }
      };
      jobEmbeddingQueue.enqueue = async (actualClient, id) => {
        assert.equal(actualClient, client);
        assert.equal(id, "job-id");
        events.push("enqueue");
        if (fail) throw failure;
        return "queue-id";
      };
      const response = {
        status(code: number) { assert.equal(code, 201); return this; },
        json(body: unknown) { assert.deepEqual(body, { message: "Job created successfully." }); events.push("response"); return this; },
      } as Response;
      await createJob(
        { user: { id: "recruiter-id" }, body: { job_details: details } } as unknown as Request,
        response, ((error: unknown) => { received = error; }) as NextFunction,
      );
      assert.equal(received, fail ? failure : undefined);
      assert.deepEqual(events, fail ? ["begin", "insert", "enqueue", "rollback"]
        : ["begin", "insert", "enqueue", "save-queue-id", "commit", "response"]);
    }
  } finally {
    pool.query = originalQuery;
    pool.transaction = originalTransaction;
    jobEmbeddingQueue.enqueue = originalEnqueue;
    global.fetch = originalFetch;
  }
});

test("job embedding reruns reuse the saved vector without AI and rescore applications", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  const [{ processJobEmbedding }, dbModule] = await Promise.all([
    import("../utils/jobEmbeddingQueue.js"), import("../db.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  const originalTransaction = pool.transaction;
  const originalFetch = global.fetch;
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  let hasEmbedding = false;
  let aiCalls = 0;
  let scores = 0;
  let completions = 0;
  const vector = Array.from({ length: 768 }, (_, index) => index === 0 ? 1 : 0);
  try {
    pool.query = async (sql, params) => {
      assert.equal(sql, "UPDATE jobs SET embedding_status = 'processing' WHERE id = $1");
      assert.deepEqual(params, ["job-id"]);
      return { rows: [] };
    };
    const client = {
      query: async (sql: string, params: unknown[]) => {
        if (sql.startsWith("SELECT")) {
          assert.match(sql, /FROM jobs WHERE id = \$1 FOR UPDATE/);
          assert.deepEqual(params, ["job-id"]);
          return { rows: [{ ...details, id: "job-id", job_status: "active", has_embedding: hasEmbedding }] };
        }
        if (sql.includes("SET embedding =")) {
          assert.match(sql, /summary = \$2/);
          assert.deepEqual(params, [`[${vector.join(",")}]`, "Build useful services", "job-id"]);
          hasEmbedding = true;
        } else if (sql.includes("UPDATE applications")) {
          assert.equal(hasEmbedding, true);
          assert.match(sql, /a.job_id = \$1/);
          assert.deepEqual(params, ["job-id"]);
          scores++;
        } else {
          assert.equal(sql, "UPDATE jobs SET embedding_status = 'completed' WHERE id = $1");
          assert.deepEqual(params, ["job-id"]);
          assert.equal(scores, completions + 1);
          completions++;
        }
        return { rows: [], rowCount: 1 };
      },
    } as unknown as PoolClient;
    pool.transaction = async (work) => work(client);
    global.fetch = async (url, options) => {
      aiCalls++;
      if (String(url) === "https://api.openai.com/v1/chat/completions") {
        assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer test-key");
        const body = JSON.parse(String(options?.body));
        assert.equal(body.model, "gpt-6");
        assert.match(body.messages[0].content, /Build backend services/);
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
          responsibilities: ["Build services"], summary: "Build useful services",
        }) } }] }), { status: 200 });
      }
      assert.equal(String(url), "https://api.openai.com/v1/embeddings");
      return new Response(JSON.stringify({ data: [{ embedding: vector }] }), { status: 200 });
    };
    await processJobEmbedding({ data: { jobId: "job-id" }, retryCount: 0 });
    assert.equal(aiCalls, 2);
    global.fetch = async () => { assert.fail("Reruns must not call AI"); };
    await processJobEmbedding({ data: { jobId: "job-id" }, retryCount: 1 });
    assert.equal(aiCalls, 2);
    assert.equal(scores, 2);
    assert.equal(completions, 2);
  } finally {
    pool.query = originalQuery;
    pool.transaction = originalTransaction;
    global.fetch = originalFetch;
    if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAIKey;
  }
});

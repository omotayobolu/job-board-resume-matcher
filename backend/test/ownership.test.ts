import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";

type MockablePool = {
  query: (...args: unknown[]) => Promise<unknown>;
};

const jobId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";

function jsonResponse() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res;
}

test("getAllApplications returns 404 unless the job belongs to the logged-in recruiter", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  const [{ getAllApplications }, dbModule] = await Promise.all([
    import("../controllers/applicationController.js"),
    import("../db.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  try {
    for (const [recruiterId, owned] of [[otherId, false], [ownerId, true]] as const) {
      let listed = false;
      pool.query = async (sql, params) => {
        const text = String(sql);
        if (text.includes("FROM jobs")) {
          assert.match(text, /recruiter_id = \$2/);
          assert.deepEqual(params, [jobId, recruiterId]);
          return { rowCount: owned ? 1 : 0, rows: owned ? [{ id: jobId }] : [] };
        }
        assert.match(text, /FROM\s+applications/i);
        listed = true;
        assert.deepEqual(params, [jobId]);
        return { rowCount: 1, rows: [{ id: "app-1", job_id: jobId, score: 0.8 }] };
      };
      const res = jsonResponse();
      await getAllApplications(
        { user: { id: recruiterId, role: "recruiter" }, params: { jobId } } as unknown as Request,
        res as unknown as Response,
        (() => assert.fail("Unexpected error")) as NextFunction,
      );
      if (owned) {
        assert.equal(listed, true);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { applications: [{ id: "app-1", job_id: jobId, score: 0.8 }] });
      } else {
        assert.equal(listed, false);
        assert.equal(res.statusCode, 404);
        assert.deepEqual(res.body, { error: "Job not found" });
      }
    }
  } finally {
    pool.query = originalQuery;
  }
});

test("getJobsByRecruiter rejects another recruiter's id before querying", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  const [{ getJobsByRecruiter }, dbModule] = await Promise.all([
    import("../controllers/jobsController.js"),
    import("../db.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  let queries = 0;
  pool.query = async () => {
    queries += 1;
    return { rowCount: 1, rows: [] };
  };
  let received: unknown;
  try {
    await getJobsByRecruiter(
      { user: { id: ownerId, role: "recruiter" }, params: { recruiterId: otherId } } as unknown as Request,
      jsonResponse() as unknown as Response,
      ((error: unknown) => { received = error; }) as NextFunction,
    );
    assert.equal(queries, 0);
    assert.ok(received instanceof Error);
    assert.equal(received.message, "You can only view your own jobs.");
    assert.equal((received as unknown as { httpCode: number }).httpCode, 403);
  } finally {
    pool.query = originalQuery;
  }
});

test("getJobsByRecruiter lists jobs only for the logged-in recruiter", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  const [{ getJobsByRecruiter }, dbModule] = await Promise.all([
    import("../controllers/jobsController.js"),
    import("../db.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  const jobs = [{ id: jobId, job_title: "Engineer" }];
  pool.query = async (sql, params) => {
    const text = String(sql);
    if (text.includes("FROM users")) {
      assert.deepEqual(params, [ownerId]);
      return { rowCount: 1, rows: [{ id: ownerId, role: "recruiter" }] };
    }
    assert.match(text, /WHERE recruiter_id = \$1/);
    assert.deepEqual(params, [ownerId]);
    return { rowCount: 1, rows: jobs };
  };
  const res = jsonResponse();
  try {
    await getJobsByRecruiter(
      { user: { id: ownerId, role: "recruiter" }, params: { recruiterId: ownerId } } as unknown as Request,
      res as unknown as Response,
      (() => assert.fail("Unexpected error")) as NextFunction,
    );
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { jobs });
  } finally {
    pool.query = originalQuery;
  }
});

test("queryApplications looks up the job by the logged-in recruiter and hides other jobs", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  const [{ queryApplications }, dbModule] = await Promise.all([
    import("../controllers/recruiterController.js"),
    import("../db.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  const originalFetch = global.fetch;
  let received: unknown;
  pool.query = async (sql, params) => {
    const text = String(sql);
    if (text.includes("FROM users")) {
      assert.deepEqual(params, [ownerId]);
      return { rowCount: 1, rows: [{ id: ownerId, role: "recruiter" }] };
    }
    assert.match(text, /FROM jobs WHERE id = \$1 AND recruiter_id = \$2/);
    assert.deepEqual(params, [jobId, ownerId]);
    return { rowCount: 0, rows: [] };
  };
  global.fetch = async () => {
    assert.fail("Another recruiter's job must not be queried with AI");
  };
  try {
    await queryApplications(
      {
        user: { id: ownerId, role: "recruiter" },
        params: { jobId },
        body: { question: "Who knows TypeScript?" },
      } as unknown as Request,
      jsonResponse() as unknown as Response,
      ((error: unknown) => { received = error; }) as NextFunction,
    );
    assert.ok(received instanceof Error);
    assert.equal(received.message, "No job found with the provided jobId");
    assert.equal((received as unknown as { httpCode: number }).httpCode, 404);
  } finally {
    pool.query = originalQuery;
    global.fetch = originalFetch;
  }
});

test("queryApplications answers through OpenAI gpt-6 and forwards provider errors", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  const [{ queryApplications }, dbModule] = await Promise.all([
    import("../controllers/recruiterController.js"), import("../db.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    pool.query = async (sql) => {
      const text = String(sql);
      if (text.includes("FROM users")) {
        return { rowCount: 1, rows: [{ id: ownerId, role: "recruiter" }] };
      }
      if (text.includes("FROM jobs")) return { rowCount: 1, rows: [{ id: jobId }] };
      assert.match(text, /FROM applications/);
      return { rowCount: 1, rows: [{ name: "Ada", work_experience: [{ title: "TypeScript engineer" }] }] };
    };
    for (const status of [200, 429]) {
      let completionCalls = 0;
      global.fetch = async (url, options) => {
        assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer test-key");
        if (String(url) === "https://api.openai.com/v1/embeddings") {
          return new Response(JSON.stringify({ data: [{ embedding: Array(768).fill(1) }] }));
        }
        assert.equal(String(url), "https://api.openai.com/v1/chat/completions");
        const body = JSON.parse(String(options?.body));
        assert.equal(body.model, "gpt-6");
        assert.match(body.messages[0].content, /Who knows TypeScript\?/);
        assert.match(body.messages[0].content, /Ada/);
        completionCalls++;
        return new Response(JSON.stringify({ choices: [{ message: { content: "Ada knows TypeScript." } }] }), { status });
      };
      const res = jsonResponse();
      let received: unknown;
      await queryApplications(
        { user: { id: ownerId, role: "recruiter" }, params: { jobId },
          body: { question: "Who knows TypeScript?" } } as unknown as Request,
        res as unknown as Response,
        ((error: unknown) => { received = error; }) as NextFunction,
      );
      assert.equal(completionCalls, 1);
      if (status === 200) {
        assert.equal(received, undefined);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { answer: "Ada knows TypeScript." });
      } else {
        assert.ok(received instanceof Error);
        assert.equal(received.message, "OpenAI request failed (429)");
        assert.equal(res.statusCode, 0);
      }
    }
  } finally {
    pool.query = originalQuery;
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

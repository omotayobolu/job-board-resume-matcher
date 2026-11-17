import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import type { PoolClient } from "pg";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

type MockablePool = {
  query: (...args: unknown[]) => Promise<unknown>;
  transaction: <T>(work: (client: PoolClient) => Promise<T>) => Promise<T>;
};

test("profile creation validates the file before database or AI work", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AWS_REGION ??= "us-east-1";
  const [{ createProfile }, dbModule] = await Promise.all([
    import("../controllers/jobSeekerController.js"),
    import("../db.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  pool.query = (async () => {
    throw new Error("Database should not be queried");
  }) as typeof pool.query;
  let received: unknown;
  try {
    await createProfile(
      {
        user: { id: "00000000-0000-0000-0000-000000000001" },
        body: {
          job_title: "Engineer",
          location: "Lagos",
          remote_preference: "remote",
        },
      } as unknown as Request,
      {} as Response,
      ((error: unknown) => {
        received = error;
      }) as NextFunction,
    );
    assert.ok(received instanceof Error);
    assert.equal(
      received.message,
      "Job title, location, remote preference, and resume are required.",
    );
  } finally {
    pool.query = originalQuery;
  }
});

test("profile creation stores a pending profile and returns 202 without calling AI", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AWS_REGION ??= "us-east-1";
  const originalBucket = process.env.S3_BUCKET_NAME;
  process.env.S3_BUCKET_NAME = "test-bucket";
  const [{ createProfile }, dbModule, { s3 }, { resumeQueue }] =
    await Promise.all([
      import("../controllers/jobSeekerController.js"),
      import("../db.js"),
      import("../config/s3.js"),
      import("../utils/resumeQueue.js"),
    ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  const originalTransaction = pool.transaction;
  const originalEnqueue = resumeQueue.enqueue;
  const originalSend = s3.send;
  const originalFetch = global.fetch;
  let queryCount = 0;
  let uploadCount = 0;
  let statusCode = 0;
  let body: unknown;
  pool.query = (async () => {
    queryCount += 1;
    if (queryCount === 1)
      return { rowCount: 1, rows: [{ id: "user-id", role: "job_seeker" }] };
    if (queryCount === 2) return { rowCount: 0, rows: [] };
    assert.fail("Unexpected query outside the transaction");
  }) as typeof pool.query;
  pool.transaction = (async (work) => {
    const client = {
      query: async () => {
        queryCount += 1;
        if (queryCount === 3)
          return {
            rowCount: 1,
            rows: [{ id: "profile-id", resume_processing_status: "pending" }],
          };
        return { rowCount: 1, rows: [] };
      },
    } as unknown as PoolClient;
    return work(client);
  }) as typeof pool.transaction;
  resumeQueue.enqueue = (async () => "job-id") as typeof resumeQueue.enqueue;
  s3.send = (async () => {
    uploadCount += 1;
    return {};
  }) as typeof s3.send;
  global.fetch = async () => {
    throw new Error("AI should not run in the request");
  };
  const response = {
    status(value: number) {
      statusCode = value;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  } as Response;
  try {
    await createProfile(
      {
        user: { id: "user-id" },
        body: {
          job_title: "Engineer",
          location: "Lagos",
          remote_preference: "remote",
        },
        file: {
          buffer: Buffer.from("%PDF"),
          mimetype: "application/pdf",
          originalname: "resume.pdf",
        },
      } as unknown as Request,
      response,
      (() => {
        assert.fail("Unexpected error");
      }) as NextFunction,
    );
    assert.equal(statusCode, 202);
    assert.equal(
      (body as { jobSeeker: { resume_processing_status: string } }).jobSeeker
        .resume_processing_status,
      "pending",
    );
    assert.equal(queryCount, 5);
    assert.equal(uploadCount, 1);
  } finally {
    pool.query = originalQuery;
    pool.transaction = originalTransaction;
    resumeQueue.enqueue = originalEnqueue;
    s3.send = originalSend;
    global.fetch = originalFetch;
    if (originalBucket === undefined) delete process.env.S3_BUCKET_NAME;
    else process.env.S3_BUCKET_NAME = originalBucket;
  }
});

test("failed profile transaction removes its S3 upload and reports a duplicate", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AWS_REGION ??= "us-east-1";
  const originalBucket = process.env.S3_BUCKET_NAME;
  process.env.S3_BUCKET_NAME = "test-bucket";
  const [{ createProfile }, dbModule, { s3 }] = await Promise.all([
    import("../controllers/jobSeekerController.js"),
    import("../db.js"),
    import("../config/s3.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  const originalTransaction = pool.transaction;
  const originalSend = s3.send;
  let queryCount = 0;
  let uploadCount = 0;
  let deleteCount = 0;
  let received: unknown;
  pool.query = (async () => {
    queryCount += 1;
    if (queryCount === 1)
      return { rowCount: 1, rows: [{ role: "job_seeker" }] };
    return { rowCount: 0, rows: [] };
  }) as typeof pool.query;
  pool.transaction = (async () => {
    throw Object.assign(new Error("duplicate profile"), { code: "23505" });
  }) as typeof pool.transaction;
  s3.send = (async (command) => {
    if (command instanceof DeleteObjectCommand) deleteCount += 1;
    else uploadCount += 1;
    return {};
  }) as typeof s3.send;
  try {
    await createProfile(
      {
        user: { id: "user-id" },
        body: {
          job_title: "Engineer",
          location: "Lagos",
          remote_preference: "remote",
        },
        file: {
          buffer: Buffer.from("%PDF"),
          mimetype: "application/pdf",
          originalname: "resume.pdf",
        },
      } as unknown as Request,
      {} as Response,
      ((error: unknown) => {
        received = error;
      }) as NextFunction,
    );
    assert.equal(
      (received as { httpCode: number; isOperational: boolean }).httpCode,
      409,
    );
    assert.equal((received as { isOperational: boolean }).isOperational, true);
    assert.equal(uploadCount, 1);
    assert.equal(deleteCount, 1);
  } finally {
    pool.query = originalQuery;
    pool.transaction = originalTransaction;
    s3.send = originalSend;
    if (originalBucket === undefined) delete process.env.S3_BUCKET_NAME;
    else process.env.S3_BUCKET_NAME = originalBucket;
  }
});

test("getProfile returns only page fields for the authenticated job seeker", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AWS_REGION ??= "us-east-1";
  const [{ getProfile }, dbModule] = await Promise.all([
    import("../controllers/jobSeekerController.js"),
    import("../db.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  let statusCode = 0;
  let body: unknown;
  pool.query = (async (sql: unknown, params: unknown) => {
    assert.match(sql as string, /WHERE js\.user_id = \$1/);
    assert.deepEqual(params, ["current-user"]);
    assert.doesNotMatch(sql as string, /js\.embedding|js\.resume_s3_key/);
    return {
      rows: [
        {
          id: "profile-id",
          full_name: "Ada Example",
          email: "ada@example.com",
          job_title: "Engineer",
          location: "Lagos",
          remote_preference: "remote",
          resume_filename: "ada.pdf",
          resume_processing_status: "completed",
          resume_job_id: null,
          created_at: new Date("2026-11-03T10:00:00Z"),
          professional_summary: "Builds useful products",
          skills: "TypeScript, PostgreSQL",
          years_of_experience: "5",
          education: "BSc Computer Science",
          certifications: "AWS Certified",
          has_parsed_resume: true,
          embedding: "private-vector",
          resume_s3_key: "private-key",
        },
      ],
    };
  }) as typeof pool.query;
  const response = {
    status(value: number) {
      statusCode = value;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  } as Response;
  try {
    await getProfile(
      { user: { id: "current-user" } } as unknown as Request,
      response,
      (() => {
        assert.fail("Unexpected error");
      }) as NextFunction,
    );
    assert.equal(statusCode, 200);
    assert.deepEqual(body, {
      profile: {
        id: "profile-id",
        full_name: "Ada Example",
        email: "ada@example.com",
        job_title: "Engineer",
        location: "Lagos",
        remote_preference: "remote",
        resume_filename: "ada.pdf",
        resume_processing_status: "completed",
        created_at: new Date("2026-11-03T10:00:00Z"),
        parsed_resume: {
          professional_summary: "Builds useful products",
          skills: "TypeScript, PostgreSQL",
          years_of_experience: "5",
          education: "BSc Computer Science",
          certifications: "AWS Certified",
        },
      },
    });
  } finally {
    pool.query = originalQuery;
  }
});

test("getProfile returns a visible 404 when the user has no profile", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AWS_REGION ??= "us-east-1";
  const [{ getProfile }, dbModule] = await Promise.all([
    import("../controllers/jobSeekerController.js"),
    import("../db.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  let received: unknown;
  pool.query = (async () => ({ rows: [], rowCount: 0 })) as typeof pool.query;
  try {
    await getProfile(
      { user: { id: "current-user" } } as unknown as Request,
      {} as Response,
      ((error: unknown) => {
        received = error;
      }) as NextFunction,
    );
    assert.equal((received as { httpCode: number }).httpCode, 404);
    assert.equal(
      (received as { message: string }).message,
      "Profile not found",
    );
    assert.equal((received as { isOperational: boolean }).isOperational, true);
  } finally {
    pool.query = originalQuery;
  }
});

test("resume replacement rejects missing and unsupported files before database work", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AWS_REGION ??= "us-east-1";
  const [{ replaceResume }, dbModule] = await Promise.all([
    import("../controllers/jobSeekerController.js"), import("../db.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  const originalTransaction = pool.transaction;
  let databaseCalls = 0;
  pool.query = async () => { databaseCalls++; throw new Error("Unexpected database query"); };
  pool.transaction = async () => { databaseCalls++; throw new Error("Unexpected transaction"); };
  try {
    for (const [file, message] of [
      [undefined, "Resume is required."],
      [{ mimetype: "text/plain" }, "Resume must be a PDF or DOCX file."],
    ] as const) {
      let received: unknown;
      await replaceResume(
        { user: { id: "user-id" }, file } as unknown as Request,
        {} as Response,
        ((error: unknown) => { received = error; }) as NextFunction,
      );
      assert.ok(received instanceof Error);
      assert.equal(received.message, message);
      assert.equal((received as unknown as { httpCode: number }).httpCode, 400);
    }
    assert.equal(databaseCalls, 0);
  } finally {
    pool.query = originalQuery;
    pool.transaction = originalTransaction;
  }
});

test("resume replacement commits its reset and queue job before deleting the old file, or cleans up on rollback", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AWS_REGION ??= "us-east-1";
  const originalBucket = process.env.S3_BUCKET_NAME;
  process.env.S3_BUCKET_NAME = "test-bucket";
  const [{ replaceResume }, dbModule, { s3 }, { resumeQueue }] = await Promise.all([
    import("../controllers/jobSeekerController.js"), import("../db.js"),
    import("../config/s3.js"), import("../utils/resumeQueue.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  const originalTransaction = pool.transaction;
  const originalSend = s3.send;
  const originalEnqueue = resumeQueue.enqueue;
  try {
    for (const fail of [false, true]) {
      const events: string[] = [];
      let newKey: string | undefined;
      let received: unknown;
      const failure = new Error("Queue unavailable");
      pool.query = async (sql, params) => {
        assert.deepEqual(params, ["user-id"]);
        if ((sql as string).includes("FROM users")) return { rows: [{ id: "user-id", role: "job_seeker" }] };
        assert.equal(sql, "SELECT id FROM job_seeker WHERE user_id = $1 LIMIT 1");
        return { rows: [{ id: "profile-id" }] };
      };
      const client = {
        query: async (sql: string, params: unknown[]) => {
          if (sql.startsWith("SELECT")) {
            assert.match(sql, /WHERE user_id = \$1 FOR UPDATE/);
            assert.deepEqual(params, ["user-id"]);
            return { rows: [{ id: "profile-id", resume_s3_key: "old-key", resume_processing_status: "completed" }] };
          }
          if (sql.includes("resume_s3_key =")) {
            assert.match(sql, /resume_processing_status = 'pending'/);
            assert.match(sql, /resume_processing_token = NULL/);
            assert.match(sql, /parsed_resume = NULL, embedding = NULL/);
            assert.deepEqual(params, [newKey, "new.pdf", "profile-id"]);
            events.push("reset");
          } else {
            assert.match(sql, /SET resume_job_id = \$1 WHERE id = \$2/);
            assert.deepEqual(params, ["new-job", "profile-id"]);
            events.push("save-job");
          }
          return { rows: [], rowCount: 1 };
        },
      } as unknown as PoolClient;
      pool.transaction = async (work) => {
        const result = await work(client);
        events.push("commit");
        return result;
      };
      resumeQueue.enqueue = async (actualClient, id) => {
        assert.equal(actualClient, client);
        assert.equal(id, "profile-id");
        events.push("enqueue");
        if (fail) throw failure;
        return "new-job";
      };
      s3.send = (async (command: { input: { Key?: string } }) => {
        if (command instanceof DeleteObjectCommand) {
          events.push(command.input.Key === "old-key" ? "delete-old" : "delete-new");
          assert.equal(command.input.Key, fail ? newKey : "old-key");
        } else {
          newKey = command.input.Key;
          assert.match(newKey!, /^resumes\/user-id\/[0-9a-f-]+\.pdf$/);
          events.push("upload");
        }
        return {};
      }) as typeof s3.send;
      const response = {
        status(code: number) { assert.equal(code, 202); return this; },
        json(body: unknown) { assert.deepEqual(body, { resume_processing_status: "pending" }); events.push("response"); return this; },
      } as Response;
      await replaceResume(
        { user: { id: "user-id" }, file: { mimetype: "application/pdf", originalname: "new.pdf", buffer: Buffer.from("%PDF") } } as unknown as Request,
        response,
        ((error: unknown) => { received = error; }) as NextFunction,
      );
      assert.equal(received, fail ? failure : undefined);
      assert.deepEqual(events, fail
        ? ["upload", "reset", "enqueue", "delete-new"]
        : ["upload", "reset", "enqueue", "save-job", "commit", "delete-old", "response"]);
    }
  } finally {
    pool.query = originalQuery;
    pool.transaction = originalTransaction;
    s3.send = originalSend;
    resumeQueue.enqueue = originalEnqueue;
    if (originalBucket === undefined) delete process.env.S3_BUCKET_NAME;
    else process.env.S3_BUCKET_NAME = originalBucket;
  }
});

test("resume preview rejects other roles and missing files without exposing a URL", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AWS_REGION ??= "us-east-1";
  const [{ getResumePreview }, dbModule] = await Promise.all([
    import("../controllers/jobSeekerController.js"), import("../db.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  try {
    for (const role of ["recruiter", "job_seeker"]) {
      let calls = 0;
      let received: unknown;
      pool.query = async (sql, params) => {
        calls++;
        assert.equal(sql, "SELECT resume_s3_key, resume_filename FROM job_seeker WHERE user_id = $1");
        assert.deepEqual(params, ["current-user"]);
        return { rows: [{ resume_s3_key: null }] };
      };
      await getResumePreview(
        { user: { id: "current-user", role }, query: { key: "another-users-file" } } as unknown as Request,
        { setHeader(name: string, value: string) { assert.equal(name, "Cache-Control"); assert.equal(value, "no-store"); } } as unknown as Response,
        ((error: unknown) => { received = error; }) as NextFunction,
      );
      assert.equal((received as { httpCode: number }).httpCode, role === "recruiter" ? 403 : 404);
      assert.equal(calls, role === "recruiter" ? 0 : 1);
    }
  } finally {
    pool.query = originalQuery;
  }
});

test("resume preview signs only the owned object with short expiry and safe PDF or DOCX headers", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AWS_REGION ??= "us-east-1";
  const names = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_BUCKET_NAME"] as const;
  const originals = names.map((name) => process.env[name]);
  process.env.AWS_ACCESS_KEY_ID = "test-access-key";
  process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_BUCKET_NAME = "test-bucket";
  const [{ getResumePreview }, dbModule] = await Promise.all([
    import("../controllers/jobSeekerController.js"), import("../db.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  try {
    for (const extension of ["pdf", "docx"]) {
      const filename = `Ada's resume\r\n.${extension}`;
      pool.query = async (_sql, params) => {
        assert.deepEqual(params, ["current-user"]);
        return { rows: [{ resume_s3_key: `resumes/current-user/owned.${extension}`, resume_filename: filename }] };
      };
      let received: unknown;
      const response = {
        setHeader(name: string, value: string) { assert.equal(name, "Cache-Control"); assert.equal(value, "no-store"); },
        status(code: number) { assert.equal(code, 200); return this; },
        json(body: { url: string; filename: string; content_type: string }) {
          assert.equal(body.filename, filename);
          assert.equal(body.content_type, extension === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
          const url = new URL(body.url);
          assert.equal(url.pathname, `/resumes/current-user/owned.${extension}`);
          assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
          assert.ok(url.searchParams.has("X-Amz-Signature"));
          assert.equal(url.searchParams.get("response-cache-control"), "no-store");
          assert.equal(url.searchParams.get("response-content-type"), body.content_type);
          const disposition = url.searchParams.get("response-content-disposition")!;
          assert.ok(disposition.startsWith(extension === "pdf" ? "inline;" : "attachment;"));
          assert.ok(disposition.includes("Ada%27s%20resume%0D%0A"));
          assert.doesNotMatch(disposition, /[\r\n]/);
          return this;
        },
      } as unknown as Response;
      await getResumePreview(
        { user: { id: "current-user", role: "job_seeker" }, query: { key: "unowned" } } as unknown as Request,
        response,
        ((error: unknown) => { received = error; }) as NextFunction,
      );
      assert.equal(received, undefined);
    }
  } finally {
    pool.query = originalQuery;
    names.forEach((name, index) => {
      if (originals[index] === undefined) delete process.env[name];
      else process.env[name] = originals[index];
    });
  }
});

test("resume content loads only the authenticated job seeker's stored S3 object", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AWS_REGION ??= "us-east-1";
  const originalBucket = process.env.S3_BUCKET_NAME;
  process.env.S3_BUCKET_NAME = "test-bucket";
  const [{ getResumeContent }, dbModule, { s3 }] = await Promise.all([
    import("../controllers/jobSeekerController.js"), import("../db.js"), import("../config/s3.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  const originalSend = s3.send;
  try {
    let reads = 0;
    pool.query = async (sql, params) => {
      assert.equal(sql, "SELECT resume_s3_key FROM job_seeker WHERE user_id = $1");
      assert.deepEqual(params, ["current-user"]);
      return { rows: [{ resume_s3_key: "resumes/current-user/owned.pdf" }] };
    };
    s3.send = (async (command: { input: { Key: string; Bucket: string } }) => {
      reads++;
      assert.equal(command.input.Key, "resumes/current-user/owned.pdf");
      assert.equal(command.input.Bucket, "test-bucket");
      return { Body: { transformToByteArray: async () => Buffer.from("%PDF-test") } };
    }) as typeof s3.send;
    const headers: Record<string, string> = {};
    let body: Buffer | undefined;
    const response = {
      setHeader(name: string, value: string) { headers[name] = value; },
      status(code: number) { assert.equal(code, 200); return this; },
      send(value: Buffer) { body = value; return this; },
    } as unknown as Response;
    await getResumeContent(
      { user: { id: "current-user", role: "job_seeker" }, query: { key: "unowned" } } as unknown as Request,
      response,
      ((error: unknown) => { assert.fail(String(error)); }) as NextFunction,
    );
    assert.equal(body?.toString(), "%PDF-test");
    assert.equal(headers["Cache-Control"], "no-store");
    assert.equal(headers["Content-Type"], "application/pdf");
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    pool.query = async () => { assert.fail("Recruiters must be rejected before querying"); };
    let received: unknown;
    await getResumeContent(
      { user: { id: "other-user", role: "recruiter" } } as unknown as Request,
      response, ((error: unknown) => { received = error; }) as NextFunction,
    );
    assert.equal((received as { httpCode: number }).httpCode, 403);
    assert.equal(reads, 1);
    pool.query = async () => ({ rows: [] });
    await getResumeContent(
      { user: { id: "current-user", role: "job_seeker" } } as unknown as Request,
      response, ((error: unknown) => { received = error; }) as NextFunction,
    );
    assert.equal((received as { httpCode: number }).httpCode, 404);
    assert.equal(reads, 1);
  } finally {
    pool.query = originalQuery;
    s3.send = originalSend;
    if (originalBucket === undefined) delete process.env.S3_BUCKET_NAME;
    else process.env.S3_BUCKET_NAME = originalBucket;
  }
});

test("resume replacement returns 404 before upload when the profile is missing", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AWS_REGION ??= "us-east-1";
  const [{ replaceResume }, dbModule, { s3 }] = await Promise.all([
    import("../controllers/jobSeekerController.js"), import("../db.js"), import("../config/s3.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  const originalTransaction = pool.transaction;
  const originalSend = s3.send;
  let uploads = 0;
  let transactions = 0;
  let queries = 0;
  try {
    pool.query = async (sql, params) => {
      queries++;
      assert.deepEqual(params, ["user-id"]);
      if ((sql as string).includes("FROM users")) return { rows: [{ id: "user-id", role: "job_seeker" }] };
      assert.equal(sql, "SELECT id FROM job_seeker WHERE user_id = $1 LIMIT 1");
      return { rows: [] };
    };
    pool.transaction = async () => { transactions++; throw new Error("Unexpected transaction"); };
    s3.send = (async () => { uploads++; throw new Error("Unexpected S3 call"); }) as typeof s3.send;
    let received: unknown;
    await replaceResume(
      { user: { id: "user-id" }, file: { mimetype: "application/pdf", originalname: "new.pdf", buffer: Buffer.from("%PDF") } } as unknown as Request,
      {} as Response,
      ((error: unknown) => { received = error; }) as NextFunction,
    );
    assert.equal((received as { httpCode: number }).httpCode, 404);
    assert.equal((received as Error).message, "Profile not found");
    assert.equal(queries, 2);
    assert.equal(uploads, 0);
    assert.equal(transactions, 0);
  } finally {
    pool.query = originalQuery;
    pool.transaction = originalTransaction;
    s3.send = originalSend;
  }
});

test("resume replacement rejects busy or vanished profiles under lock and deletes only the new upload", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AWS_REGION ??= "us-east-1";
  const originalBucket = process.env.S3_BUCKET_NAME;
  process.env.S3_BUCKET_NAME = "test-bucket";
  const [{ replaceResume }, dbModule, { s3 }, { resumeQueue }] = await Promise.all([
    import("../controllers/jobSeekerController.js"), import("../db.js"),
    import("../config/s3.js"), import("../utils/resumeQueue.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  const originalTransaction = pool.transaction;
  const originalSend = s3.send;
  const originalEnqueue = resumeQueue.enqueue;
  try {
    for (const status of ["pending", "processing", null]) {
      const events: string[] = [];
      let newKey: string | undefined;
      let received: unknown;
      pool.query = async (sql, params) => {
        assert.deepEqual(params, ["user-id"]);
        if ((sql as string).includes("FROM users")) return { rows: [{ role: "job_seeker" }] };
        events.push("lookup");
        return { rows: [{ id: "profile-id" }] };
      };
      pool.transaction = async (work) => {
        try {
          return await work({ query: async (sql: string, params: unknown[]) => {
            assert.equal(sql, "SELECT id, resume_s3_key, resume_processing_status FROM job_seeker WHERE user_id = $1 FOR UPDATE");
            assert.deepEqual(params, ["user-id"]);
            events.push("lock");
            return { rows: status === null ? [] : [{ id: "profile-id", resume_s3_key: "old-key", resume_processing_status: status }] };
          } } as unknown as PoolClient);
        } catch (error) {
          events.push("rollback");
          throw error;
        }
      };
      resumeQueue.enqueue = async () => { events.push("enqueue"); throw new Error("Unexpected enqueue"); };
      s3.send = (async (command: { input: { Key?: string } }) => {
        if (command instanceof DeleteObjectCommand) {
          assert.equal(command.input.Key, newKey);
          events.push("delete-new");
        } else {
          newKey = command.input.Key;
          assert.ok(newKey);
          assert.notEqual(newKey, "old-key");
          events.push("upload");
        }
        return {};
      }) as typeof s3.send;
      await replaceResume(
        { user: { id: "user-id" }, file: { mimetype: "application/pdf", originalname: "new.pdf", buffer: Buffer.from("%PDF") } } as unknown as Request,
        {} as Response,
        ((error: unknown) => { received = error; }) as NextFunction,
      );
      assert.equal((received as { httpCode: number }).httpCode, status === null ? 404 : 409);
      assert.deepEqual(events, ["lookup", "upload", "lock", "rollback", "delete-new"]);
    }
  } finally {
    pool.query = originalQuery;
    pool.transaction = originalTransaction;
    s3.send = originalSend;
    resumeQueue.enqueue = originalEnqueue;
    if (originalBucket === undefined) delete process.env.S3_BUCKET_NAME;
    else process.env.S3_BUCKET_NAME = originalBucket;
  }
});

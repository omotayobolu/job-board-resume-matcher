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
  pool.query = (async () => { throw new Error("Database should not be queried"); }) as typeof pool.query;
  let received: unknown;
  try {
    await createProfile({
      user: { id: "00000000-0000-0000-0000-000000000001" },
      body: { job_title: "Engineer", location: "Lagos", remote_preference: "remote" },
    } as Request, {} as Response, ((error: unknown) => { received = error; }) as NextFunction);
    assert.ok(received instanceof Error);
    assert.equal(received.message, "Job title, location, remote preference, and resume are required.");
  } finally {
    pool.query = originalQuery;
  }
});

test("profile creation stores a pending profile and returns 202 without calling AI", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AWS_REGION ??= "us-east-1";
  const originalBucket = process.env.S3_BUCKET_NAME;
  process.env.S3_BUCKET_NAME = "test-bucket";
  const [{ createProfile }, dbModule, { s3 }, { resumeQueue }] = await Promise.all([
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
    if (queryCount === 1) return { rowCount: 1, rows: [{ id: "user-id", role: "job_seeker" }] };
    if (queryCount === 2) return { rowCount: 0, rows: [] };
    assert.fail("Unexpected query outside the transaction");
  }) as typeof pool.query;
  pool.transaction = (async (work) => {
    const client = {
      query: async () => {
        queryCount += 1;
        if (queryCount === 3) return { rowCount: 1, rows: [{ id: "profile-id", resume_processing_status: "pending" }] };
        return { rowCount: 1, rows: [] };
      },
    } as unknown as PoolClient;
    return work(client);
  }) as typeof pool.transaction;
  resumeQueue.enqueue = (async () => "job-id") as typeof resumeQueue.enqueue;
  s3.send = (async () => { uploadCount += 1; return {}; }) as typeof s3.send;
  global.fetch = async () => { throw new Error("AI should not run in the request"); };
  const response = {
    status(value: number) { statusCode = value; return this; },
    json(value: unknown) { body = value; return this; },
  } as Response;
  try {
    await createProfile({
      user: { id: "user-id" },
      body: { job_title: "Engineer", location: "Lagos", remote_preference: "remote" },
      file: { buffer: Buffer.from("%PDF"), mimetype: "application/pdf", originalname: "resume.pdf" },
    } as Request, response, (() => { assert.fail("Unexpected error"); }) as NextFunction);
    assert.equal(statusCode, 202);
    assert.equal((body as { jobSeeker: { resume_processing_status: string } }).jobSeeker.resume_processing_status, "pending");
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
    if (queryCount === 1) return { rowCount: 1, rows: [{ role: "job_seeker" }] };
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
    await createProfile({
      user: { id: "user-id" },
      body: { job_title: "Engineer", location: "Lagos", remote_preference: "remote" },
      file: { buffer: Buffer.from("%PDF"), mimetype: "application/pdf", originalname: "resume.pdf" },
    } as Request, {} as Response, ((error: unknown) => { received = error; }) as NextFunction);
    assert.equal((received as { httpCode: number; isOperational: boolean }).httpCode, 409);
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

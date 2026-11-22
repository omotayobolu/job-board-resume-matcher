import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { AddressInfo } from "node:net";
import express, { type ErrorRequestHandler, type Router } from "express";

process.env.DATABASE_URL ??= "postgres://shortlistly:shortlistly@127.0.0.1:5432/shortlistly";
process.env.AWS_REGION ??= "us-east-1";
process.env.JWT_SECRET ??= "test-secret";

const paths = [
  "/api/v1/jobs/get-jobs",
  "/api/v1/jobs/recommended",
  "/api/v1/job-seeker/profile",
];

test("job seeker routes 404 when the flag is off and stay mounted when it is on", async () => {
  const previous = process.env.JOB_SEEKER_FEATURES;
  process.env.JOB_SEEKER_FEATURES = "false";
  const router = (await import("../routes/routes.js")).default as unknown as Router;
  const errorMiddleware = (await import("../middlewares/errorHandlerMiddleware.js")).default as unknown as ErrorRequestHandler;
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use(errorMiddleware);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
  const port = (server.address() as AddressInfo).port;
  try {
    for (const path of paths) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 404, path);
      assert.deepEqual(await response.json(), { error: "Not found." });
    }
    const applyOff = await fetch(`http://127.0.0.1:${port}/api/v1/applications/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1" }),
    });
    assert.equal(applyOff.status, 404);
    const createOff = await fetch(`http://127.0.0.1:${port}/api/v1/jobs/create-job`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(createOff.status, 401);

    process.env.JOB_SEEKER_FEATURES = "true";
    for (const path of paths) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 401, path);
    }
    const applyOn = await fetch(`http://127.0.0.1:${port}/api/v1/applications/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1" }),
    });
    assert.equal(applyOn.status, 401);
  } finally {
    if (previous === undefined) delete process.env.JOB_SEEKER_FEATURES;
    else process.env.JOB_SEEKER_FEATURES = previous;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

after(async () => {
  const db = (await import("../db.js")).default as unknown as { end: () => Promise<void> };
  await db.end();
});

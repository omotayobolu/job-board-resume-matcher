import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { CustomError, HttpStatusCode, errorHandler } from "../utils/error-handler";
import errorMiddleware from "../middlewares/errorHandlerMiddleware";
import { parseResumeText } from "../utils/parseResume";
import { MulterError } from "multer";
import { registerSchema } from "../schemas";

type MockResponse = Response & { statusCode: number; body?: unknown };
const request = {} as Request;

function response(headersSent = false): MockResponse {
  return {
    headersSent,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  } as MockResponse;
}

test("expected request errors keep their HTTP status and message", () => {
  const original = errorHandler.handleError;
  errorHandler.handleError = () => {};
  try {
    const res = response();
    errorMiddleware(
      new CustomError("BAD_REQUEST", HttpStatusCode.BAD_REQUEST, "Missing details"),
      request,
      res,
      () => assert.fail("Unexpected next call")
    );
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: "Missing details" });
  } finally {
    errorHandler.handleError = original;
  }
});

test("unexpected errors hide internal details", () => {
  const original = errorHandler.handleError;
  errorHandler.handleError = () => {};
  try {
    const res = response();
    errorMiddleware(new Error("database secret"), request, res, () => {});
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: "Internal server error" });
  } finally {
    errorHandler.handleError = original;
  }
});

test("malformed JSON and upload errors return client errors", () => {
  const original = errorHandler.handleError;
  errorHandler.handleError = () => {};
  try {
    const jsonResponse = response();
    errorMiddleware(
      Object.assign(new SyntaxError("bad input"), { type: "entity.parse.failed" }),
      request,
      jsonResponse,
      () => {}
    );
    assert.equal(jsonResponse.statusCode, 400);
    assert.deepEqual(jsonResponse.body, { error: "Invalid JSON body." });

    const uploadResponse = response();
    errorMiddleware(
      new MulterError("LIMIT_UNEXPECTED_FILE"),
      request,
      uploadResponse,
      () => {}
    );
    assert.equal(uploadResponse.statusCode, 400);
    assert.deepEqual(uploadResponse.body, { error: "Invalid file upload." });
  } finally {
    errorHandler.handleError = original;
  }
});

test("invalid registration roles return field errors", () => {
  const original = errorHandler.handleError;
  errorHandler.handleError = () => {};
  try {
    const result = registerSchema.safeParse({
      email: "person@example.com",
      full_name: "Person Example",
      password: "a long sample passphrase",
      role: "admin",
    });
    assert.equal(result.success, false);
    if (result.success) return;
    const res = response();
    errorMiddleware(result.error, request, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      error: "Invalid request data.",
      details: [{ path: "role", message: "Choose Job Seeker or Recruiter." }],
    });
  } finally {
    errorHandler.handleError = original;
  }
});

test("errors after headers are sent pass to Express", () => {
  const original = errorHandler.handleError;
  errorHandler.handleError = () => {};
  try {
    const error = new Error("stream failed");
    const res = response(true);
    let forwarded;
    errorMiddleware(error, request, res, (received) => { forwarded = received; });
    assert.equal(forwarded, error);
    assert.equal(res.body, undefined);
  } finally {
    errorHandler.handleError = original;
  }
});

test("resume parsing propagates upstream failures with their cause", async () => {
  const original = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  const upstream = new Error("network unavailable");
  global.fetch = async () => { throw upstream; };
  try {
    await assert.rejects(parseResumeText("resume text"), (error) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Resume parsing failed");
      assert.equal(error.cause, upstream);
      return true;
    });
  } finally {
    global.fetch = original;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

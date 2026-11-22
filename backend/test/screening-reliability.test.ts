import assert from "node:assert/strict";
import { test } from "node:test";
import { crc32 } from "node:zlib";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { PoolClient } from "pg";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
process.env.AWS_REGION = "us-east-1";
process.env.S3_BUCKET_NAME = "test-bucket";

type MockPool = {
  query: (...args: unknown[]) => Promise<unknown>;
  transaction: <T>(work: (client: PoolClient) => Promise<T>) => Promise<T>;
};

test("terminal file status and batch counters roll back together and retry only once", async () => {
  const [{ finishBatchFile }, db] = await Promise.all([
    import("../utils/screeningQueue.js"), import("../db.js"),
  ]);
  const pool = db.default as unknown as MockPool;
  const original = pool.transaction;
  const originalQuery = pool.query;
  pool.query = async () => { assert.fail("Terminal updates must use the transaction client"); };
  let state = { status: "processing", processed: 0, failed: 0 };
  let failCounter = true;
  pool.transaction = async (work) => {
    const snapshot = { ...state };
    try {
      return await work({ query: async (sql: string, params: unknown[]) => {
        if (sql.includes("UPDATE upload_batch_files")) {
          if (state.status === "completed" || state.status === "failed") return { rows: [] };
          state.status = String(params[1]);
          return { rows: [{ batch_id: "batch" }] };
        }
        assert.match(sql, /UPDATE upload_batches/);
        if (failCounter) throw new Error("counter write failed");
        if (sql.includes("SET processed_files")) state.processed += 1;
        else state.failed += 1;
        return { rows: [] };
      } } as unknown as PoolClient);
    } catch (error) {
      state = snapshot;
      throw error;
    }
  };
  try {
    for (const status of ["completed", "failed"] as const) {
      state = { status: "processing", processed: 0, failed: 0 };
      failCounter = true;
      await assert.rejects(finishBatchFile("file", status), /counter write failed/);
      assert.deepEqual(state, { status: "processing", processed: 0, failed: 0 });
      failCounter = false;
      await finishBatchFile("file", status);
      await finishBatchFile("file", status);
      assert.deepEqual(state, {
        status, processed: status === "completed" ? 1 : 0, failed: status === "failed" ? 1 : 0,
      });
    }
  } finally {
    pool.transaction = original;
    pool.query = originalQuery;
  }
});

function file(name: string, content: Buffer | string): Express.Multer.File {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return { originalname: name, buffer, size: buffer.length,
    mimetype: name.endsWith(".zip") ? "application/zip" : "application/pdf" } as Express.Multer.File;
}

// Stored entries keep the fixtures tiny; method 99 proves a budget rejection
// happens before opening an over-budget entry's decompression stream.
function zip(entries: { name: string; data: string; method?: number }[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.data);
    const local = Buffer.alloc(30 + name.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.method ?? 0, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    data.copy(local, 30 + name.length);
    const header = Buffer.alloc(46 + name.length);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(entry.method ?? 0, 10);
    header.writeUInt32LE(crc32(data), 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    name.copy(header, 46);
    locals.push(local);
    central.push(header);
    offset += local.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test("zip extraction shares count and byte budgets with other archives and loose files", async () => {
  const { collectCvs } = await import("../utils/screeningUpload.js");
  const first = file("first.zip", zip([{ name: "a.pdf", data: "aaa" }]));
  const second = file("second.zip", zip([{ name: "b.pdf", data: "bb", method: 99 }]));
  await assert.rejects(collectCvs([first, second], { remainingFiles: 1, remainingBytes: 100 }), /at most 100 CVs/);
  await assert.rejects(collectCvs([first, second], { remainingFiles: 2, remainingBytes: 4 }), /too large when uncompressed/);
  await assert.rejects(collectCvs([file("a.pdf", "aaa"), second], { remainingFiles: 2, remainingBytes: 4 }), /too large when uncompressed/);
  const skipped = file("notes.zip", zip([{ name: "notes.txt", data: "x" }]));
  await assert.rejects(collectCvs([skipped, second], { remainingFiles: 1, remainingBytes: 100 }), /at most 100 CVs/);
  const good = await collectCvs([first, file("b.pdf", "b")], { remainingFiles: 2, remainingBytes: 4 });
  assert.deepEqual(good.cvs.map((cv) => cv.filename), ["a.pdf", "b.pdf"]);
});

test("failed screening transactions remove only newly uploaded S3 objects", async () => {
  const [upload, db, { s3 }, { screeningQueue }, { jobEmbeddingQueue }] = await Promise.all([
    import("../utils/screeningUpload.js"), import("../db.js"), import("../config/s3.js"),
    import("../utils/screeningQueue.js"), import("../utils/jobEmbeddingQueue.js"),
  ]);
  const pool = db.default as unknown as MockPool;
  const originals = { transaction: pool.transaction, send: s3.send, enqueue: screeningQueue.enqueue,
    jobEnqueue: jobEmbeddingQueue.enqueue };
  const uploaded: string[] = [];
  const removed: string[] = [];
  let failure = "";
  let uploadCount = 0;
  let cleanupFails = false;
  s3.send = (async (command: unknown) => {
    if (command instanceof PutObjectCommand) {
      uploadCount += 1;
      uploaded.push(command.input.Key!);
      // Model a stored object whose PutObject response is lost in transit.
      if (failure === "upload" && uploadCount === 2) throw new Error("upload failed");
      return {};
    }
    assert.ok(command instanceof DeleteObjectCommand);
    removed.push(command.input.Key!);
    if (cleanupFails) throw new Error("cleanup failed");
    return {};
  }) as typeof s3.send;
  screeningQueue.enqueue = async () => {
    if (failure === "enqueue") throw new Error("enqueue failed");
    return "queue";
  };
  jobEmbeddingQueue.enqueue = async () => "job-queue";
  let candidate = 0;
  pool.transaction = async (work) => {
    const result = await work({ query: async (sql: string, params: unknown[]) => {
      if (sql.includes("SELECT workspace_id FROM workspace_members")) return { rows: [{ workspace_id: "workspace" }] };
      if (sql.includes("SELECT j.id, j.workspace_id")) return { rows: [{ id: "job", workspace_id: "workspace" }] };
      if (sql.includes("SELECT c.id, c.file_sha256")) return { rows: [{
        id: "existing-candidate", file_sha256: upload.fileSha256(Buffer.from("existing")),
        processing_status: "completed", screening_id: "existing-screening", resume_s3_key: "existing-key",
      }] };
      if (sql.includes("count(*)::int AS total")) return { rows: [{ total: 1 }] };
      if (sql.includes("INSERT INTO jobs")) return { rows: [{ id: "job" }] };
      if (sql.includes("INSERT INTO upload_batches")) return { rows: [{ id: "batch" }] };
      if (sql.includes("INSERT INTO candidates")) return { rows: [{ id: `new-${++candidate}` }] };
      if (sql.includes("INSERT INTO screenings")) return { rows: [{ id: `screen-${candidate}` }] };
      if (sql.includes("SELECT 1 FROM screenings")) return { rowCount: 0, rows: [] };
      if (sql.includes("INSERT INTO upload_batch_files")) return { rows: [{ id: `file-${candidate}` }] };
      return { rowCount: 1, rows: [] };
    } } as unknown as PoolClient);
    if (failure === "commit") throw new Error("commit failed");
    return result;
  };
  try {
    for (const entrypoint of ["create", "add"]) {
      for (failure of ["upload", "enqueue", "commit", ""]) {
        uploaded.length = 0;
        removed.length = 0;
        uploadCount = 0;
        const files = [file("existing.pdf", "existing"), file("a.pdf", "new-a"), file("b.pdf", "new-b")];
        const operation = entrypoint === "create"
          ? upload.createRoleWithCvs("user", "Engineer", files)
          : upload.addCvsToRole("user", "job", files);
        if (failure) {
          await assert.rejects(operation, new RegExp(`${failure} failed`));
          assert.ok(uploaded.length > 0);
          assert.deepEqual(removed, uploaded);
          assert.ok(!removed.includes("existing-key"));
        } else {
          await operation;
          assert.equal(uploaded.length, 2);
          assert.deepEqual(removed, []);
        }
      }
    }
    failure = "enqueue";
    cleanupFails = true;
    await assert.rejects(upload.addCvsToRole("user", "job", [file("cleanup.pdf", "cleanup")]), /enqueue failed/);
  } finally {
    pool.transaction = originals.transaction;
    s3.send = originals.send;
    screeningQueue.enqueue = originals.enqueue;
    jobEmbeddingQueue.enqueue = originals.jobEnqueue;
  }
});

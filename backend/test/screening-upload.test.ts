import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { after, before, describe, test } from "node:test";
import path from "node:path";
import { crc32 } from "node:zlib";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { NextFunction, Request, Response } from "express";
import { Client } from "pg";
import { uploadLimits } from "../config/uploadLimits";
import type { ScreeningCvJob } from "../utils/screeningQueue";

const databaseUrl = "postgres://shortlistly:shortlistly@127.0.0.1:5432/shortlistly_phase2";
const adminUrl = "postgres://shortlistly:shortlistly@127.0.0.1:5432/postgres";
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET ??= "test-secret";
process.env.AWS_REGION ??= "us-east-1";
process.env.S3_BUCKET_NAME ??= "test-bucket";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.OPENROUTER_API_KEY ??= "test-key";

const modelsDir = path.join(process.cwd(), "models");
const adaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const graceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const sample = {
  name: "Ada Example",
  email: "ada@example.com",
  phone: "+1 555",
  location: "Lagos",
  professional_summary: "Backend engineer",
  years_of_experience: "6",
  work_experience: [],
  skills: "Node.js",
  certifications: "",
  education: "",
  projects: [],
  languages: [],
  links: [],
  additional_sections: [],
};

const vector = Array.from({ length: 768 }, (_, index) => (index === 0 ? 1 : 0));
const vectorLiteral = `[${vector.join(",")}]`;

type StoredObject = { body: Buffer; contentType: string };
type Queued = { id: string; payload: ScreeningCvJob };
type Scheduled = { id: string; payload: ScreeningCvJob; delaySeconds: number };

const objects = new Map<string, StoredObject>();
const queued: Queued[] = [];
const scheduled: Scheduled[] = [];
let parseCalls = 0;
let embedCalls = 0;
let failParse = false;

function sqlFile(name: string): string {
  return readFileSync(path.join(modelsDir, name), "utf8");
}

async function query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<T>(text, params as unknown[]);
    return result.rows;
  } finally {
    await client.end();
  }
}

function uploadFile(name: string, contents: Buffer | string, mimetype?: string): Express.Multer.File {
  const buffer = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  const type = mimetype
    ?? (name.toLowerCase().endsWith(".zip") ? "application/zip"
      : name.toLowerCase().endsWith(".docx") ? DOCX
      : name.toLowerCase().endsWith(".pdf") ? PDF
      : "text/plain");
  return {
    fieldname: "files",
    originalname: name,
    encoding: "7bit",
    mimetype: type,
    size: buffer.length,
    buffer,
    destination: "",
    filename: name,
    path: "",
    stream: Readable.from(buffer),
  } as Express.Multer.File;
}

type ZipEntryInput = {
  name: string;
  data: Buffer;
  flags?: number;
  method?: number;
  uncompressedSize?: number;
};

function buildZip(entries: ZipEntryInput[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const bitFlag = (entry.flags ?? 0) | 0x800;
    const method = entry.method ?? 0;
    const data = entry.data;
    const uncompressed = entry.uncompressedSize ?? data.length;
    const local = Buffer.alloc(30 + name.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(bitFlag, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(method === 0 ? crc32(data) : 0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(uncompressed, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    data.copy(local, 30 + name.length);
    locals.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(bitFlag, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(method === 0 ? crc32(data) : 0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(uncompressed, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

function minimalDocx(text: string): Buffer {
  const document = Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
</w:document>`);
  const types = Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  const rels = Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  return buildZip([
    { name: "[Content_Types].xml", data: types },
    { name: "_rels/.rels", data: rels },
    { name: "word/document.xml", data: document },
  ]);
}

async function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
) {
  let statusCode = 0;
  let body: unknown;
  let error: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  };
  await handler(req as Request, res as unknown as Response, ((err: unknown) => {
    error = err;
  }) as NextFunction);
  return { statusCode, body, error };
}

function sha(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

describe("screening uploads", { concurrency: 1 }, () => {
  let createScreening: typeof import("../controllers/screeningController.js").createScreening;
  let addUploads: typeof import("../controllers/screeningController.js").addUploads;
  let getBatch: typeof import("../controllers/screeningController.js").getBatch;
  let retryBatch: typeof import("../controllers/screeningController.js").retryBatch;
  let processScreeningCv: typeof import("../utils/screeningQueue.js").processScreeningCv;
  let scoreDelaySeconds = 0;
  let scoreWaitMs = 0;
  let adaWorkspace = "";
  let graceWorkspace = "";

  before(async () => {
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'shortlistly_phase2' AND pid <> pg_backend_pid()",
      );
      await admin.query("DROP DATABASE IF EXISTS shortlistly_phase2");
      await admin.query("CREATE DATABASE shortlistly_phase2");
    } finally {
      await admin.end();
    }

    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query(sqlFile("setup.sql"));
      await client.query(sqlFile("20261123_upload_batch_files.sql"));
      await client.query(sqlFile("20261124_upload_batch_file_reason.sql"));
      await client.query(sqlFile("20261125_screening_fit.sql"));
      await client.query(
        `INSERT INTO users (id, email, full_name, role, password_hash, hasprofile, created_at)
         VALUES ($1, 'ada@example.com', 'Ada Lovelace', 'recruiter', 'x', true, NOW()),
                ($2, 'grace@example.com', 'Grace Hopper', 'recruiter', 'x', true, NOW())`,
        [adaId, graceId],
      );
      const workspaces = await client.query<{ id: string; name: string }>(
        `INSERT INTO workspaces (name) VALUES ('Analytical Engines'), ('Grace Hopper''s workspace') RETURNING id, name`,
      );
      adaWorkspace = workspaces.rows.find((row) => row.name === "Analytical Engines")?.id ?? "";
      graceWorkspace = workspaces.rows.find((row) => row.name.startsWith("Grace"))?.id ?? "";
      assert.ok(adaWorkspace && graceWorkspace);
      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, member_role)
         VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
        [adaWorkspace, adaId, graceWorkspace, graceId],
      );
    } finally {
      await client.end();
    }

    const controller = await import("../controllers/screeningController.js");
    const screeningQueueModule = await import("../utils/screeningQueue.js");
    const jobQueueModule = await import("../utils/jobEmbeddingQueue.js");
    const s3Module = await import("../config/s3.js");
    createScreening = controller.createScreening;
    addUploads = controller.addUploads;
    getBatch = controller.getBatch;
    retryBatch = controller.retryBatch;
    processScreeningCv = screeningQueueModule.processScreeningCv;
    scoreDelaySeconds = screeningQueueModule.scoreWait.delaySeconds;
    scoreWaitMs = screeningQueueModule.scoreWait.maxMs;

    s3Module.s3.send = (async (command: unknown) => {
      if (command instanceof PutObjectCommand) {
        const key = command.input.Key;
        if (!key || !command.input.Body) throw new Error("Missing S3 upload");
        objects.set(key, {
          body: Buffer.from(command.input.Body as Buffer),
          contentType: command.input.ContentType ?? PDF,
        });
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const stored = objects.get(command.input.Key ?? "");
        if (!stored) throw new Error(`Missing object ${command.input.Key}`);
        return {
          Body: { transformToByteArray: async () => stored.body },
          ContentType: stored.contentType,
        };
      }
      throw new Error("Unexpected S3 command");
    }) as typeof s3Module.s3.send;

    screeningQueueModule.screeningQueue.enqueue = async (_client, payload) => {
      const id = randomUUID();
      queued.push({ id, payload });
      return id;
    };
    screeningQueueModule.screeningQueue.scheduleScore = async (payload, delaySeconds) => {
      const id = randomUUID();
      scheduled.push({ id, payload, delaySeconds });
      return id;
    };
    jobQueueModule.jobEmbeddingQueue.enqueue = async () => randomUUID();

    global.fetch = async (url, init) => {
      const target = String(url);
      if (target.includes("/v1/responses")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { text?: { format?: { name?: string } } };
        if (body.text?.format?.name === "screening_fit") {
          return new Response(JSON.stringify({
            status: "completed",
            output: [{
              type: "message",
              content: [{
                type: "output_text",
                text: JSON.stringify({
                  summary: "The CV shows backend work that lines up with this role.",
                  strengths: ["Lists Node.js in skills."],
                  gaps: [],
                  must_haves: [],
                }),
              }],
            }],
          }), { status: 200 });
        }
        parseCalls += 1;
        if (failParse) return new Response("no", { status: 500 });
        return new Response(JSON.stringify({
          status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(sample) }] }],
        }), { status: 200 });
      }
      if (target.includes("/v1/embeddings")) {
        embedCalls += 1;
        return new Response(JSON.stringify({ data: [{ embedding: vector }] }), { status: 200 });
      }
      throw new Error(`Unexpected fetch ${target}`);
    };
  });

  after(async () => {
    const boss = await import("../utils/queueBoss.js");
    await boss.stopQueueBoss();
    const db = (await import("../db.js")).default as unknown as { end: () => Promise<void> };
    await db.end();
  });

  async function asUser(userId: string, handler: typeof createScreening, body: Record<string, unknown>, files: Express.Multer.File[], params: Record<string, string> = {}) {
    return invoke(handler, { user: { id: userId, role: "recruiter" }, body, files, params } as Partial<Request>);
  }

  async function setJobEmbedding(jobId: string) {
    await query(
      `UPDATE jobs SET embedding = $1::vector, embedding_status = 'completed' WHERE id = $2`,
      [vectorLiteral, jobId],
    );
  }

  async function runQueued(items: Queued[], retryCount = 0) {
    for (const item of items) {
      await processScreeningCv({ id: item.id, data: item.payload, retryCount });
    }
  }

  test("mixed PDFs and a zip create one screening per valid CV and skip junk", async () => {
    const adaPdf = Buffer.from("%PDF-ada");
    const graceDoc = minimalDocx("Grace Hopper");
    const zip = buildZip([
      { name: "team/nia.pdf", data: Buffer.from("%PDF-nia") },
      { name: "team/lin.docx", data: minimalDocx("Lin") },
      { name: "team/notes.txt", data: Buffer.from("hello") },
      { name: "__MACOSX/._nia.pdf", data: Buffer.from("junk") },
      { name: ".DS_Store", data: Buffer.from("store") },
      { name: "team/", data: Buffer.alloc(0) },
    ]);
    const before = queued.length;
    const created = await asUser(adaId, createScreening, { role: "Senior Node developer, 5+ years" }, [
      uploadFile("ada.pdf", adaPdf),
      uploadFile("grace.docx", graceDoc),
      uploadFile("cvs.zip", zip),
    ]);
    assert.equal(created.error, undefined);
    assert.equal(created.statusCode, 201);
    const body = created.body as { job_id: string; batch_id: string; total_files: number; skipped_files: number };
    assert.equal(body.total_files, 5);
    assert.equal(body.skipped_files, 1);

    const jobs = await query<{ job_title: string; job_description: string; workspace_id: string }>(
      `SELECT job_title, job_description, workspace_id FROM jobs WHERE id = $1`,
      [body.job_id],
    );
    assert.equal(jobs[0]?.job_title, "Senior Node developer, 5+ years");
    assert.equal(jobs[0]?.job_description, "Senior Node developer, 5+ years");
    assert.equal(jobs[0]?.workspace_id, adaWorkspace);

    const fresh = queued.slice(before);
    assert.equal(fresh.length, 4);
    await setJobEmbedding(body.job_id);
    const parsesBefore = parseCalls;
    await runQueued([fresh[0]!]);
    await runQueued([fresh[0]!]);
    await runQueued(fresh.slice(1));
    assert.equal(parseCalls - parsesBefore, 4);
    assert.equal(embedCalls, 4);

    const screenings = await query<{ score: number; full_name: string; email: string; phone: string; sha: string; key: string; filename: string }>(
      `SELECT s.score, c.full_name, c.email, c.phone, c.file_sha256 AS sha, c.resume_s3_key AS key, c.resume_filename AS filename
       FROM screenings s JOIN candidates c ON c.id = s.candidate_id
       WHERE s.job_id = $1 ORDER BY c.resume_filename`,
      [body.job_id],
    );
    assert.equal(screenings.length, 4);
    assert.deepEqual(screenings.map((row) => row.filename), ["ada.pdf", "grace.docx", "lin.docx", "nia.pdf"]);
    for (const row of screenings) {
      assert.equal(Number(row.score), 1);
      assert.equal(row.full_name, "Ada Example");
      assert.equal(row.email, "ada@example.com");
      assert.equal(row.phone, "+1 555");
      assert.match(row.key, new RegExp(`^cvs/${adaWorkspace}/[0-9a-f-]{36}/[0-9a-f-]{36}\\.(pdf|docx)$`));
      assert.equal(objects.has(row.key), true);
    }
    assert.equal(screenings.find((row) => row.filename === "ada.pdf")?.sha, sha(adaPdf));

    const batch = await asUser(adaId, getBatch, {}, [], { jobId: body.job_id, batchId: body.batch_id });
    const view = batch.body as {
      status: string;
      processed_files: number;
      failed_files: number;
      skipped_files: number;
      files: { filename: string; status: string; reason: string | null }[];
    };
    assert.equal(view.status, "completed");
    assert.equal(view.processed_files, 4);
    assert.equal(view.failed_files, 0);
    assert.equal(view.skipped_files, 1);
    assert.equal(view.files.some((file) => file.filename.includes("__MACOSX") || file.filename === ".DS_Store"), false);
    const notes = view.files.find((file) => file.filename === "notes.txt");
    assert.equal(notes?.status, "skipped");
    assert.equal(notes?.reason, "Not a PDF or DOCX file.");
  });

  test("oversized and unsupported files are rejected", async () => {
    const batchesBefore = await query("SELECT id FROM upload_batches");
    const oversized = await asUser(adaId, createScreening, { role: "Too big" }, [
      uploadFile("big.pdf", Buffer.alloc(uploadLimits.maxResumeBytes + 1, 1)),
    ]);
    assert.equal((oversized.error as Error).message, '"big.pdf" is larger than 10 MB.');

    const notes = await asUser(adaId, createScreening, { role: "Notes" }, [
      uploadFile("notes.txt", "hello"),
    ]);
    assert.match((notes.error as Error).message, /PDF or DOCX/);

    const zip = buildZip([{ name: "notes.txt", data: Buffer.from("hello") }]);
    const unsupportedZip = await asUser(adaId, createScreening, { role: "Zip notes" }, [
      uploadFile("notes.zip", zip),
    ]);
    assert.equal(unsupportedZip.error, undefined);
    const notesBody = unsupportedZip.body as { job_id: string; batch_id: string; total_files: number; skipped_files: number };
    assert.equal(notesBody.total_files, 1);
    assert.equal(notesBody.skipped_files, 1);
    const notesBatch = await asUser(adaId, getBatch, {}, [], { jobId: notesBody.job_id, batchId: notesBody.batch_id });
    const notesView = notesBatch.body as { status: string; files: { filename: string; status: string; reason: string | null; candidate_id: string | null }[] };
    assert.equal(notesView.status, "completed");
    assert.equal(notesView.files[0]?.filename, "notes.txt");
    assert.equal(notesView.files[0]?.status, "skipped");
    assert.equal(notesView.files[0]?.reason, "Not a PDF or DOCX file.");
    assert.equal(notesView.files[0]?.candidate_id, null);

    const hugeZip = await asUser(adaId, createScreening, { role: "Huge zip" }, [
      uploadFile("huge.zip", Buffer.alloc(uploadLimits.maxZipBytes + 1, 1)),
    ]);
    assert.match((hugeZip.error as Error).message, /50 MB/);

    const batchesAfter = await query("SELECT id FROM upload_batches");
    assert.equal(batchesAfter.length, batchesBefore.length + 1);
    const rejectedJobs = await query(
      `SELECT id FROM jobs WHERE job_title IN ('Too big', 'Notes', 'Huge zip')`,
    );
    assert.equal(rejectedJobs.length, 0);
  });

  test("unsafe and encrypted zips are rejected", async () => {
    const batchesBefore = await query("SELECT id FROM upload_batches");
    const slip = await asUser(adaId, createScreening, { role: "Slip" }, [
      uploadFile("slip.zip", buildZip([{ name: "../evil.pdf", data: Buffer.from("%PDF") }])),
    ]);
    assert.equal((slip.error as Error).message, "This zip contains an unsafe path.");

    const encrypted = buildZip([{
      name: "secret.pdf",
      data: Buffer.concat([Buffer.alloc(12), Buffer.from("%PDF")]),
      flags: 1,
      uncompressedSize: 4,
    }]);
    const locked = await asUser(adaId, createScreening, { role: "Locked" }, [
      uploadFile("locked.zip", encrypted),
    ]);
    assert.match((locked.error as Error).message, /encrypted/i);

    const bomb = buildZip([{
      name: "bomb.pdf",
      data: Buffer.from("tiny"),
      method: 8,
      uncompressedSize: uploadLimits.maxUncompressedBytes + 1,
    }]);
    const exploded = await asUser(adaId, createScreening, { role: "Bomb" }, [
      uploadFile("bomb.zip", bomb),
    ]);
    assert.match((exploded.error as Error).message, /too large when uncompressed/i);

    const batchesAfter = await query("SELECT id FROM upload_batches");
    assert.equal(batchesAfter.length, batchesBefore.length);
  });

  test("a duplicate on the same role is skipped and a second role reuses the embedding", async () => {
    const adaPdf = Buffer.from("%PDF-ada");
    const jobs = await query<{ id: string }>(
      `SELECT id FROM jobs WHERE recruiter_id = $1 ORDER BY created_at LIMIT 1`,
      [adaId],
    );
    const jobId = jobs[0]?.id;
    assert.ok(jobId);
    const beforeCandidates = await query("SELECT id FROM candidates");
    const beforeScreenings = await query("SELECT id FROM screenings WHERE job_id = $1", [jobId]);
    const queuedBefore = queued.length;

    const again = await asUser(adaId, addUploads, {}, [uploadFile("ada-again.pdf", adaPdf)], { jobId });
    assert.equal(again.error, undefined);
    const skipped = again.body as { skipped_files: number; total_files: number; batch_id: string };
    assert.equal(skipped.total_files, 1);
    assert.equal(skipped.skipped_files, 1);
    assert.equal(queued.length, queuedBefore);
    const view = await asUser(adaId, getBatch, {}, [], { jobId, batchId: skipped.batch_id });
    const batch = view.body as { status: string; files: { status: string; reason: string | null }[] };
    assert.equal(batch.status, "completed");
    assert.equal(batch.files[0]?.status, "skipped");
    assert.equal(batch.files[0]?.reason, "Already on this role.");
    const afterCandidates = await query("SELECT id FROM candidates");
    const afterScreenings = await query("SELECT id FROM screenings WHERE job_id = $1", [jobId]);
    assert.equal(afterCandidates.length, beforeCandidates.length);
    assert.equal(afterScreenings.length, beforeScreenings.length);

    const parsesBefore = parseCalls;
    const embedsBefore = embedCalls;
    const queuedAt = queued.length;
    const second = await asUser(adaId, createScreening, { role: "Backend engineer, Lagos" }, [
      uploadFile("ada.pdf", adaPdf),
    ]);
    assert.equal(second.error, undefined);
    const created = second.body as { job_id: string; skipped_files: number };
    assert.equal(created.skipped_files, 0);
    await setJobEmbedding(created.job_id);
    await runQueued(queued.slice(queuedAt));
    assert.equal(parseCalls, parsesBefore);
    assert.equal(embedCalls, embedsBefore);

    const rows = await query<{ candidate_id: string; score: number; jobs: string }>(
      `SELECT s.candidate_id, s.score, count(*) OVER (PARTITION BY s.candidate_id) AS jobs
       FROM screenings s
       JOIN candidates c ON c.id = s.candidate_id
       WHERE c.file_sha256 = $1
       ORDER BY s.created_at`,
      [sha(adaPdf)],
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.candidate_id, rows[1]?.candidate_id);
    assert.equal(Number(rows[1]?.score), 1);
  });

  test("a missing role embedding is rescheduled without using the parse retry budget", async () => {
    const parsesBefore = parseCalls;
    const queuedAt = queued.length;
    const scheduledAt = scheduled.length;
    const created = await asUser(adaId, createScreening, { role: "Waiting on the role embedding" }, [
      uploadFile("wait.pdf", Buffer.from("%PDF-wait")),
    ]);
    const body = created.body as { job_id: string };
    const job = queued[queuedAt];
    assert.ok(job);
    // retryCount is already at the parse limit. Waiting must not fail the file.
    await processScreeningCv({ id: job.id, data: job.payload, retryCount: 2 });
    assert.equal(parseCalls, parsesBefore + 1);
    const followUp = scheduled[scheduledAt];
    assert.ok(followUp);
    assert.equal(followUp.delaySeconds, scoreDelaySeconds);
    assert.equal(followUp.payload.scoreOnly, true);
    assert.equal(followUp.payload.batchFileId, job.payload.batchFileId);
    const deadline = Date.parse(followUp.payload.scoreDeadline ?? "");
    assert.ok(deadline > Date.now() + scoreWaitMs - 5_000);
    const mid = await query<{ score: number | null; status: string; has_embedding: boolean }>(
      `SELECT s.score, f.status, c.embedding IS NOT NULL AS has_embedding
       FROM upload_batch_files f
       JOIN screenings s ON s.id = f.screening_id
       JOIN candidates c ON c.id = f.candidate_id
       WHERE f.id = $1`,
      [job.payload.batchFileId],
    );
    assert.equal(mid[0]?.score, null);
    assert.equal(mid[0]?.status, "pending");
    assert.equal(mid[0]?.has_embedding, true);

    await processScreeningCv({ id: followUp.id, data: followUp.payload, retryCount: 0 });
    assert.equal(parseCalls, parsesBefore + 1);
    assert.equal(scheduled.length, scheduledAt + 2);
    assert.equal(scheduled[scheduledAt + 1]?.payload.scoreDeadline, followUp.payload.scoreDeadline);

    await setJobEmbedding(body.job_id);
    await processScreeningCv({ id: followUp.id, data: followUp.payload, retryCount: 0 });
    assert.equal(parseCalls, parsesBefore + 1);
    const done = await query<{ score: number; status: string; reason_status: string; reason_summary: string }>(
      `SELECT s.score, f.status, s.reason_status, s.reason_summary
       FROM upload_batch_files f JOIN screenings s ON s.id = f.screening_id WHERE f.id = $1`,
      [job.payload.batchFileId],
    );
    assert.equal(Number(done[0]?.score), 1);
    assert.equal(done[0]?.status, "completed");
    assert.equal(done[0]?.reason_status, "completed");
    assert.match(done[0]?.reason_summary ?? "", /backend work/);
  });

  test("scoring gives up after the wait window without parsing again", async () => {
    const parsesBefore = parseCalls;
    const queuedAt = queued.length;
    const created = await asUser(adaId, createScreening, { role: "Embedding window elapsed" }, [
      uploadFile("expire.pdf", Buffer.from("%PDF-expire")),
    ]);
    assert.equal(created.error, undefined);
    const body = created.body as { batch_id: string };
    const job = queued[queuedAt];
    assert.ok(job);
    await processScreeningCv({ id: job.id, data: job.payload, retryCount: 0 });
    assert.equal(parseCalls, parsesBefore + 1);
    await processScreeningCv({
      id: job.id,
      data: { ...job.payload, scoreOnly: true, scoreDeadline: new Date(Date.now() - 1000).toISOString() },
      retryCount: 0,
    });
    assert.equal(parseCalls, parsesBefore + 1);
    const failed = await query<{ status: string; reason: string; failed_files: number; batch_status: string }>(
      `SELECT f.status, f.reason, b.failed_files, b.status AS batch_status
       FROM upload_batch_files f JOIN upload_batches b ON b.id = f.batch_id
       WHERE f.id = $1`,
      [job.payload.batchFileId],
    );
    assert.equal(failed[0]?.status, "failed");
    assert.match(failed[0]?.reason ?? "", /10 minutes/);
    assert.equal(failed[0]?.failed_files, 1);
    assert.equal(failed[0]?.batch_status, "completed");
    assert.equal(body.batch_id.length > 0, true);
  });

  test("a failed parse retries, then fails, and the retry endpoint runs it again", async () => {
    failParse = true;
    const queuedAt = queued.length;
    const created = await asUser(adaId, createScreening, { role: "Parse will fail" }, [
      uploadFile("bad.pdf", Buffer.from("%PDF-bad")),
    ]);
    assert.equal(created.error, undefined);
    const body = created.body as { job_id: string; batch_id: string };
    const job = queued[queuedAt];
    assert.ok(job);
    await assert.rejects(processScreeningCv({ id: job.id, data: job.payload, retryCount: 0 }), /Resume parsing failed/);
    const pending = await query<{ processing_status: string; parsed_resume: unknown; file_status: string; failed_files: number }>(
      `SELECT c.processing_status, c.parsed_resume, f.status AS file_status, b.failed_files
       FROM candidates c
       JOIN upload_batch_files f ON f.candidate_id = c.id
       JOIN upload_batches b ON b.id = f.batch_id
       WHERE f.id = $1`,
      [job.payload.batchFileId],
    );
    assert.equal(pending[0]?.processing_status, "pending");
    assert.equal(pending[0]?.parsed_resume, null);
    assert.equal(pending[0]?.file_status, "pending");
    assert.equal(pending[0]?.failed_files, 0);

    await assert.rejects(processScreeningCv({ id: job.id, data: job.payload, retryCount: 2 }), /Resume parsing failed/);
    const failed = await query<{ processing_status: string; file_status: string; failed_files: number; batch_status: string }>(
      `SELECT c.processing_status, f.status AS file_status, b.failed_files, b.status AS batch_status
       FROM candidates c
       JOIN upload_batch_files f ON f.candidate_id = c.id
       JOIN upload_batches b ON b.id = f.batch_id
       WHERE f.id = $1`,
      [job.payload.batchFileId],
    );
    assert.equal(failed[0]?.processing_status, "failed");
    assert.equal(failed[0]?.file_status, "failed");
    assert.equal(failed[0]?.failed_files, 1);
    assert.equal(failed[0]?.batch_status, "completed");

    failParse = false;
    await setJobEmbedding(body.job_id);
    const queuedBeforeRetry = queued.length;
    const retried = await asUser(adaId, retryBatch, {}, [], { jobId: body.job_id, batchId: body.batch_id });
    assert.equal(retried.error, undefined);
    const retryBody = retried.body as { retried: number; failed_files: number; status: string };
    assert.equal(retryBody.retried, 1);
    assert.equal(retryBody.failed_files, 0);
    assert.equal(retryBody.status, "processing");
    const next = queued[queuedBeforeRetry];
    assert.ok(next);
    await processScreeningCv({ id: next.id, data: next.payload, retryCount: 0 });
    const done = await query<{ processing_status: string; file_status: string; score: number; batch_status: string; processed_files: number }>(
      `SELECT c.processing_status, f.status AS file_status, s.score, b.status AS batch_status, b.processed_files
       FROM candidates c
       JOIN upload_batch_files f ON f.candidate_id = c.id
       JOIN screenings s ON s.id = f.screening_id
       JOIN upload_batches b ON b.id = f.batch_id
       WHERE f.id = $1`,
      [next.payload.batchFileId],
    );
    assert.equal(done[0]?.processing_status, "completed");
    assert.equal(done[0]?.file_status, "completed");
    assert.equal(Number(done[0]?.score), 1);
    assert.equal(done[0]?.batch_status, "completed");
    assert.equal(done[0]?.processed_files, 1);
  });

  test("another recruiter cannot upload to or read a role they do not own", async () => {
    const graceJob = await asUser(graceId, createScreening, { role: "Compiler engineer" }, [
      uploadFile("grace.pdf", Buffer.from("%PDF-grace-role")),
    ]);
    const created = graceJob.body as { job_id: string; batch_id: string };
    const candidatesBefore = await query("SELECT id FROM candidates");
    const denied = await asUser(adaId, addUploads, {}, [uploadFile("sneak.pdf", Buffer.from("%PDF-sneak"))], { jobId: created.job_id });
    assert.equal((denied.error as { httpCode: number }).httpCode, 404);
    assert.equal((denied.error as Error).message, "Role not found.");
    const hidden = await asUser(adaId, getBatch, {}, [], { jobId: created.job_id, batchId: created.batch_id });
    assert.equal((hidden.error as { httpCode: number }).httpCode, 404);
    const candidatesAfter = await query("SELECT id FROM candidates");
    assert.equal(candidatesAfter.length, candidatesBefore.length);
  });

  test("the monthly free-tier cap counts new CVs and ignores duplicates", async () => {
    const existing = await query<{ total: number }>(
      `SELECT count(*)::int AS total FROM candidates WHERE workspace_id = $1`,
      [graceWorkspace],
    );
    const fillers = 199 - (existing[0]?.total ?? 0);
    assert.ok(fillers >= 0);
    if (fillers > 0) {
      await query(
        `INSERT INTO candidates (workspace_id, processing_status, created_at)
         SELECT $1, 'completed', now() FROM generate_series(1, $2)`,
        [graceWorkspace, fillers],
      );
    }
    const first = await asUser(graceId, createScreening, { role: "Cap role" }, [
      uploadFile("cap.pdf", Buffer.from("%PDF-cap")),
    ]);
    assert.equal(first.error, undefined);
    const duplicate = await asUser(graceId, addUploads, {}, [uploadFile("cap-again.pdf", Buffer.from("%PDF-cap"))], {
      jobId: (first.body as { job_id: string }).job_id,
    });
    assert.equal(duplicate.error, undefined);
    assert.equal((duplicate.body as { skipped_files: number }).skipped_files, 1);

    const over = await asUser(graceId, createScreening, { role: "Over the cap" }, [
      uploadFile("one-more.pdf", Buffer.from("%PDF-one-more")),
    ]);
    assert.match((over.error as Error).message, /200 CVs/);
    assert.match((over.error as Error).message, /already has 200/);
    const jobs = await query("SELECT id FROM jobs WHERE job_title = 'Over the cap'");
    assert.equal(jobs.length, 0);
  });

  test("resume, job embedding, and screening workers share one pg-boss", async () => {
    const resumeQueue = await import("../utils/resumeQueue.js");
    const jobQueue = await import("../utils/jobEmbeddingQueue.js");
    const screeningQueue = await import("../utils/screeningQueue.js");
    const boss = await import("../utils/queueBoss.js");
    await resumeQueue.resumeQueue.start();
    const first = boss.getQueueBoss();
    await jobQueue.jobEmbeddingQueue.start();
    await screeningQueue.screeningQueue.start();
    assert.equal(boss.getQueueBoss(), first);
    const queues = await query<{ name: string }>(
      `SELECT name FROM pgboss.queue WHERE name IN ('resume-processing', 'job-embedding', 'screening-cv') ORDER BY name`,
    );
    assert.deepEqual(queues.map((row) => row.name), ["job-embedding", "resume-processing", "screening-cv"]);
    await boss.stopQueueBoss();
  });
});

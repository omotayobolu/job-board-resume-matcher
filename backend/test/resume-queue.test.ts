import assert from "node:assert/strict";
import { test } from "node:test";

type MockablePool = {
  query: (...args: unknown[]) => Promise<unknown>;
};

test("completed resume processing rescores only that seeker's applications", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.AWS_REGION ??= "us-east-1";
  const [{ processResumeJob }, dbModule] = await Promise.all([
    import("../utils/resumeQueue.js"),
    import("../db.js"),
  ]);
  const pool = dbModule.default as unknown as MockablePool;
  const originalQuery = pool.query;
  const applications = [
    { job_seeker_id: "seeker-a", score: 0.1 },
    { job_seeker_id: "seeker-b", score: 0.2 },
  ];
  const events: string[] = [];
  try {
    pool.query = async (sql, params) => {
      const text = String(sql);
      const values = params as unknown[];
      if (text.includes("resume_processing_status = 'processing'")) {
        assert.equal(values[0], "profile-1");
        assert.equal(values[1], "resume-job-1");
        return {
          rowCount: 1,
          rows: [{
            id: "profile-1",
            user_id: "seeker-a",
            resume_s3_key: "resumes/seeker-a/file.pdf",
            parsed_resume: { name: "Ada" },
            has_embedding: true,
          }],
        };
      }
      if (text.includes("UPDATE applications")) {
        assert.match(text, /a\.job_seeker_id = \$1/);
        assert.deepEqual(values, ["seeker-a"]);
        for (const application of applications) {
          if (application.job_seeker_id === values[0]) application.score = 0.91;
        }
        events.push("rescore");
        return { rowCount: 1, rows: [] };
      }
      if (text.includes("resume_processing_status = 'completed'")) {
        assert.equal(values[0], "profile-1");
        assert.equal(values[1], "resume-job-1");
        events.push("complete");
        return { rowCount: 1, rows: [] };
      }
      assert.fail(`Unexpected query: ${text}`);
    };

    await processResumeJob({
      id: "resume-job-1",
      data: { profileId: "profile-1" },
      retryCount: 0,
    });

    assert.deepEqual(events, ["rescore", "complete"]);
    assert.equal(applications[0]?.score, 0.91);
    assert.equal(applications[1]?.score, 0.2);
  } finally {
    pool.query = originalQuery;
  }
});

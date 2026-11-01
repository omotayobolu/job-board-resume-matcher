import assert from "node:assert/strict";
import { test } from "node:test";
import { embedJob, embedQuestion, embedResume } from "../utils/embed";
import type { ResumeProfile } from "../types/domain";

const resume: ResumeProfile = {
  name: "Ada Example",
  email: "ada@example.com",
  phone: "+1-555-0100",
  location: "Lagos",
  professional_summary: "Backend engineer",
  years_of_experience: "4 years",
  work_experience: [],
  skills: "TypeScript",
  certifications: "",
  education: "BSc Computer Science",
  projects: [],
  languages: [],
  links: [],
  additional_sections: [],
};

test("jobs, resumes, and questions use the same 768-dimensional OpenAI embedding model", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  const requests: Array<{ model: string; dimensions: number; input: string }> = [];
  const embedding = Array.from({ length: 768 }, (_, index) => index === 0 ? 1 : 0);
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/embeddings");
    requests.push(JSON.parse(String(options?.body)));
    return new Response(JSON.stringify({ data: [{ embedding }] }), { status: 200 });
  };
  try {
    await embedResume(resume);
    await embedJob({
      job_title: "Engineer",
      job_description: "Build backend services",
      location: "Lagos",
      required_skills: ["TypeScript"],
      work_type: "remote",
    });
    await embedQuestion("Which applicant knows TypeScript?");
    assert.equal(requests.length, 3);
    for (const request of requests) {
      assert.equal(request.model, "text-embedding-3-small");
      assert.equal(request.dimensions, 768);
    }
    assert.equal(requests[0]!.input.includes("Ada Example"), false);
    assert.equal(requests[0]!.input.includes("ada@example.com"), false);
    assert.equal(requests[0]!.input.includes("+1-555-0100"), false);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test("invalid OpenAI embeddings are rejected before a database write", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  global.fetch = async () => new Response(JSON.stringify({ data: [{ embedding: [1, 2] }] }), { status: 200 });
  try {
    await assert.rejects(embedQuestion("TypeScript experience"), /768-dimension/);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseResumeFile, resumeJsonSchema } from "../utils/parseResume";

const sample = {
  name: "Ada Example",
  email: "ada@example.com",
  phone: "",
  location: "",
  professional_summary: "",
  years_of_experience: "",
  work_experience: [],
  skills: "TypeScript",
  certifications: "",
  education: "",
  projects: [],
  languages: [],
  links: [],
  additional_sections: [],
};

test("PDF and DOCX resumes are sent to OpenAI as files with a strict JSON schema", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  const bodies: Array<Record<string, any>> = [];
  global.fetch = async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(sample) }] }],
    }), { status: 200 });
  };
  try {
    const buffer = Buffer.from("sample file");
    assert.deepEqual(await parseResumeFile(buffer, "application/pdf"), sample);
    assert.deepEqual(await parseResumeFile(buffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), sample);
    assert.equal(bodies.length, 2);
    for (const [index, extension] of ["pdf", "docx"].entries()) {
      const body = bodies[index]!;
      assert.equal(body.model, "gpt-5.6-terra");
      assert.equal("max_output_tokens" in body, false);
      assert.equal(body.text.format.strict, true);
      assert.deepEqual(body.text.format.schema, resumeJsonSchema);
      assert.equal(body.store, false);
      assert.equal(body.input[0].content[1].filename, `resume.${extension}`);
      assert.match(body.input[0].content[1].file_data, /;base64,c2FtcGxlIGZpbGU=$/);
    }
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test("incomplete OpenAI resume responses fail before storing a profile", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  global.fetch = async () => new Response(JSON.stringify({ status: "incomplete", output: [] }), { status: 200 });
  try {
    await assert.rejects(parseResumeFile(Buffer.from("sample"), "application/pdf"), /Resume parsing failed/);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

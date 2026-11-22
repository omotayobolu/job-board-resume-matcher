import assert from "node:assert/strict";
import { test } from "node:test";
import { crc32 } from "node:zlib";
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

function minimalDocx(text: string): Buffer {
  const entries = [
    {
      name: "[Content_Types].xml",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`),
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`),
    },
    {
      name: "word/document.xml",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
</w:document>`),
    },
  ];
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const local = Buffer.alloc(30 + name.length + entry.data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt32LE(crc32(entry.data), 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    entry.data.copy(local, 30 + name.length);
    locals.push(local);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt32LE(crc32(entry.data), 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
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

test("PDF resumes are sent to OpenAI as files and DOCX resumes are sent as extracted text", async () => {
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
    const pdf = Buffer.from("sample file");
    const docx = minimalDocx("Ada Example, TypeScript, ada@example.com");
    assert.deepEqual(await parseResumeFile(pdf, "application/pdf"), sample);
    assert.deepEqual(await parseResumeFile(docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), sample);
    assert.equal(bodies.length, 2);
    const pdfBody = bodies[0]!;
    assert.equal(pdfBody.model, "gpt-5.6-terra");
    assert.equal("max_output_tokens" in pdfBody, false);
    assert.equal(pdfBody.text.format.strict, true);
    assert.deepEqual(pdfBody.text.format.schema, resumeJsonSchema);
    assert.equal(pdfBody.store, false);
    assert.equal(pdfBody.input[0].content[1].filename, "resume.pdf");
    assert.match(pdfBody.input[0].content[1].file_data, /;base64,c2FtcGxlIGZpbGU=$/);
    const docxBody = bodies[1]!;
    assert.equal(docxBody.text.format.strict, true);
    assert.equal(docxBody.input[0].content.length, 1);
    assert.equal(docxBody.input[0].content[0].type, "input_text");
    assert.match(docxBody.input[0].content[0].text, /Ada Example, TypeScript, ada@example.com/);
    assert.equal(JSON.stringify(docxBody).includes("input_file"), false);
    assert.equal(JSON.stringify(docxBody).includes("base64"), false);
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

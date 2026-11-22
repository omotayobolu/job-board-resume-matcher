import assert from "node:assert/strict";
import test from "node:test";
import {
  SCREEN_FIT_INSTRUCTIONS,
  buildScreenFitRequest,
  parseScreenFit,
  screenFitFromResponse,
  screenFitJsonSchema,
} from "../utils/screenFit";
import { shortlistCsv } from "../utils/shortlistCsv";

const resume = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+1 555 0100",
  location: "Lagos",
  professional_summary: "Backend engineer who ships Node APIs.",
  years_of_experience: "6",
  work_experience: [],
  skills: "Node.js",
  certifications: "",
  education: "",
  projects: [],
  languages: [],
  links: [],
  additional_sections: [
    { heading: "Photo", content: "headshot.jpg" },
    { heading: "Publications", content: "Notes on the analytical engine" },
  ],
};

const fit = {
  summary: "The CV shows backend API work that matches the role.",
  strengths: ["Ships Node APIs."],
  gaps: ["No mention of Postgres."],
  must_haves: [{ requirement: "Node.js", met: "yes", evidence: "Skills list Node.js." }],
};

test("structured screening fit accepts a bounded payload and rejects invalid ones", () => {
  assert.deepEqual(parseScreenFit(fit), fit);
  assert.equal(screenFitJsonSchema.additionalProperties, false);
  assert.deepEqual(screenFitJsonSchema.required, ["summary", "strengths", "gaps", "must_haves"]);
  assert.throws(() => parseScreenFit({ ...fit, summary: "  " }), /Invalid screening fit JSON/);
  assert.throws(() => parseScreenFit({ ...fit, strengths: ["a", "b", "c", "d"] }), /Invalid screening fit JSON/);
  assert.throws(() => parseScreenFit({ ...fit, gaps: ["a", "b", "c", "d"] }), /Invalid screening fit JSON/);
  assert.throws(() => parseScreenFit({
    ...fit,
    must_haves: [{ requirement: "Node.js", met: "maybe", evidence: "" }],
  }), /Invalid screening fit JSON/);
  assert.throws(() => parseScreenFit({ summary: "Ok.", strengths: [], gaps: [] }), /Invalid screening fit JSON/);
  assert.deepEqual(screenFitFromResponse({
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(fit) }] }],
  }), fit);
  assert.throws(() => screenFitFromResponse({ status: "incomplete", output: [] }), /incomplete/);
});

test("the fit request omits protected attributes and tells the model to ignore them", () => {
  const request = buildScreenFitRequest("Backend engineer, Node.js required", resume);
  const encoded = JSON.stringify(request);
  assert.equal(request.store, false);
  assert.equal(request.text.format.strict, true);
  assert.equal(request.text.format.name, "screening_fit");
  assert.equal(encoded.includes("Ada Lovelace"), false);
  assert.equal(encoded.includes("ada@example.com"), false);
  assert.equal(encoded.includes("+1 555 0100"), false);
  assert.equal(encoded.includes("headshot.jpg"), false);
  assert.equal(encoded.includes("Notes on the analytical engine"), true);
  assert.match(SCREEN_FIT_INSTRUCTIONS, /age, date of birth, gender, sex, nationality/);
  assert.match(SCREEN_FIT_INSTRUCTIONS, /photos/);
  assert.match(SCREEN_FIT_INSTRUCTIONS, /A human makes the hiring decision/);
  assert.match(encoded, /Backend engineer, Node.js required/);
});

test("csv export quotes commas and quotes and neutralizes formula cells", () => {
  const csv = shortlistCsv([{
    name: "=Perfect, Ada",
    email: "ada@example.com",
    matchPercent: 100,
    status: "shortlisted",
    summary: "Fits the role.\nSecond line",
    strengths: ['APIs, billing', 'Said "SQL"'],
    gaps: [],
  }, {
    name: "Waiting",
    email: null,
    matchPercent: null,
    status: "new",
    summary: null,
    strengths: [],
    gaps: [],
  }]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const lines = csv.replace(/^\uFEFF/, "").trim().split("\r\n");
  assert.equal(lines[0], "Name,Email,Match %,Status,Summary,Strengths,Gaps");
  assert.equal(lines[1], `"'=Perfect, Ada",ada@example.com,100,shortlisted,"Fits the role.\nSecond line","APIs, billing | Said ""SQL""",`);
  assert.equal(lines[2], "Waiting,,,new,,,");
});

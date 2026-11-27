import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createJobSchema,
  registerSchema,
  resumeOutputSchema,
} from "../schemas";

test("registration validates and normalizes untrusted input", () => {
  const previous = process.env.JOB_SEEKER_FEATURES;
  process.env.JOB_SEEKER_FEATURES = "true";
  try {
    const account = registerSchema.parse({
      email: "  PERSON@Example.com ",
      full_name: " Person Example ",
      password: "abcdef",
      role: "job_seeker",
    });
    assert.equal(account.email, "person@example.com");
    assert.equal(account.full_name, "Person Example");
    assert.equal(account.role, "job_seeker");
    assert.equal(account.password, "abcdef");
    assert.equal(registerSchema.safeParse({
      email: "person@example.com",
      full_name: "Person Example",
      password: "abcde",
      role: "job_seeker",
    }).success, false);
    assert.equal(registerSchema.safeParse({
      email: 123,
      full_name: "Person Example",
      password: "a long sample passphrase",
      role: "job_seeker",
    }).success, false);
    assert.equal(registerSchema.safeParse({
      email: "person@example.com",
      full_name: "Person Example",
      password: "a long sample passphrase",
      role: "admin",
    }).success, false);

    process.env.JOB_SEEKER_FEATURES = "false";
    const recruiter = registerSchema.parse({
      email: "person@example.com",
      full_name: "Person Example",
      password: "abcdef",
      role: "job_seeker",
      company_name: "  ",
    });
    assert.equal(recruiter.role, "recruiter");
    assert.equal(recruiter.company_name, undefined);
    const named = registerSchema.parse({
      email: "person@example.com",
      full_name: "Person Example",
      password: "abcdef",
      company_name: "  Northwind  ",
    });
    assert.equal(named.role, "recruiter");
    assert.equal(named.company_name, "Northwind");
  } finally {
    if (previous === undefined) delete process.env.JOB_SEEKER_FEATURES;
    else process.env.JOB_SEEKER_FEATURES = previous;
  }
});

test("job and completion payloads reject wrong field types", () => {
  assert.equal(createJobSchema.safeParse({
    job_details: {
      job_title: "Engineer",
      job_description: "Build the product",
      location: "Remote",
      required_skills: "TypeScript",
      work_type: "Remote",
    },
  }).success, false);
  assert.equal(resumeOutputSchema.safeParse({
    name: "Applicant",
    work_experience: [{ title: "Developer", responsibilities: "coding" }],
  }).success, false);
});

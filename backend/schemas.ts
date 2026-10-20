import { z } from "zod";

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(6).max(128);

export const registerSchema = z.object({
  email,
  full_name: z.string().trim().min(2).max(120),
  password,
  role: z.enum(["job_seeker", "recruiter"], {
    error: "Choose Job Seeker or Recruiter.",
  }),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export const roleSchema = z.object({
  role: z.enum(["job_seeker", "recruiter"]),
});

export const jobDetailsSchema = z.object({
  job_title: z.string().trim().min(1),
  job_description: z.string().trim().min(1),
  location: z.string().trim().min(1),
  required_skills: z.array(z.string().trim().min(1)),
  work_type: z.string().trim().min(1).max(10),
});

export const createJobSchema = z.object({ job_details: jobDetailsSchema });
export const jobStatusSchema = z.object({
  job_status: z.enum(["active", "closed"]),
});
export const applySchema = z.object({ jobId: z.string().uuid() });
export const recruiterProfileSchema = z.object({
  company_name: z.string().trim().min(1),
  type_of_organization: z.string().trim().min(1),
  location: z.string().trim().min(1),
});
export const jobSeekerProfileSchema = z.object({
  job_title: z.string().trim().min(1),
  location: z.string().trim().min(1),
  remote_preference: z.string().trim().min(1),
});
export const recruiterQuestionSchema = z.object({
  question: z.string().trim().min(1),
});
export const idParamSchema = z.object({ id: z.string().uuid() });
export const jobIdParamSchema = z.object({ jobId: z.string().uuid() });
export const recruiterIdParamSchema = z.object({
  recruiterId: z.string().uuid(),
});

export const resumeOutputSchema = z.object({
  name: z.string().default(""),
  years_of_experience: z.string().default(""),
  work_experience: z.array(z.object({
    title: z.string().default(""),
    company: z.string().default(""),
    responsibilities: z.array(z.string()).default([]),
  })).default([]),
  skills: z.string().default(""),
  certifications: z.string().default(""),
  education: z.string().default(""),
});

export const jobOutputSchema = z.object({
  responsibilities: z.array(z.string()),
  summary: z.string(),
});

export const completionSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string() }),
  })).min(1),
});

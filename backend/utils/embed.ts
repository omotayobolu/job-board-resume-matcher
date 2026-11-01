import { z } from "zod";
import { requiredEnv } from "../env";
import type { JobDetails, ResumeProfile } from "../types/domain";
import { vectorLiteral } from "./vector";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 768;

const embeddingResponseSchema = z.object({
  data: z.array(z.object({
    embedding: z.array(z.number()),
  })).length(1),
});

async function embedText(input: string): Promise<number[]> {
  if (!input.trim()) throw new Error("Cannot embed empty text");

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input,
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: "float",
    }),
  });
  if (!response.ok) throw new Error(`OpenAI embedding request failed (${response.status})`);

  const data: unknown = await response.json();
  const embedding = embeddingResponseSchema.parse(data).data[0]!.embedding;
  vectorLiteral(embedding);
  return embedding;
}

function resumeToString(resume: ResumeProfile): string {
  const workDescriptions = resume.work_experience
    ?.map((job) => {
      const responsibilities = Array.isArray(job.responsibilities)
        ? job.responsibilities.join("; ")
        : "";
      return `${job.title || "Unknown Title"} at ${job.company || "Unknown Company"}
        ${job.location} ${job.start_date}–${job.end_date}: ${responsibilities};
        Achievements: ${job.achievements.join("; ")}`;
    })
    .join("\n");

  return [
    `Professional Summary: ${resume.professional_summary}`,
    `Location: ${resume.location}`,
    `Years of Experience: ${resume.years_of_experience || "Unknown"}`,
    `Work Experience:\n${workDescriptions}`,
    `Skills: ${resume.skills || "None"}`,
    `Certifications: ${resume.certifications || "None"}`,
    `Education: ${resume.education || "None"}`,
    `Projects: ${resume.projects.join("; ")}`,
    `Languages: ${resume.languages.join("; ")}`,
    `Additional Sections: ${resume.additional_sections.map((section) => `${section.heading}: ${section.content}`).join("; ")}`,
  ].join("\n");
}

const embedResume = (parsedResume: ResumeProfile) => embedText(resumeToString(parsedResume));

function jobToString(job: JobDetails): string {
  const responsibilities = Array.isArray(job.responsibilities)
    ? job.responsibilities.join("\n- ")
    : "";

  const skills = Array.isArray(job.required_skills)
    ? job.required_skills.join(", ")
    : job.required_skills;

  return `
    Job Title: ${job.job_title}
    Job Description: ${job.job_description}
    Location: ${job.location}
    Work Type: ${job.work_type}
    Job Status: ${job.job_status}
    Required Skills: ${skills}
    Responsibilities: ${responsibilities}
  `;
}

const embedJob = (job_details: JobDetails) => embedText(jobToString(job_details));

const embedQuestion = (question: string) => embedText(question);

export { embedResume, embedJob, embedQuestion };

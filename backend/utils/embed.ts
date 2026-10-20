import type { JobDetails, ResumeProfile } from "../types/domain";

function resumeToString(resume: ResumeProfile): string {
  const workDescriptions = resume.work_experience
    ?.map((job) => {
      const responsibilities = Array.isArray(job.responsibilities)
        ? job.responsibilities.join("; ")
        : "";
      return `${job.title || "Unknown Title"} at ${
        job.company || "Unknown Company"
      }: ${responsibilities}`;
    })
    .join("\n");

  return [
    `Name: ${resume.name || "Unknown"}`,
    `Years of Experience: ${resume.years_of_experience || "Unknown"}`,
    `Work Experience:\n${workDescriptions}`,
    `Skills: ${resume.skills || "None"}`,
    `Certifications: ${resume.certifications || "None"}`,
    `Education: ${resume.education || "None"}`,
  ].join("\n");
}

const embedResume = async (parsedResume: ResumeProfile) => {
  const { pipeline } = await import("@xenova/transformers");
  const embedder = await pipeline(
    "feature-extraction",
    "Xenova/all-mpnet-base-v2"
  );

  const resumeString = resumeToString(parsedResume);
  const embeddingResult = await embedder(resumeString, {
    pooling: "mean",
    normalize: true,
  });

  return embeddingResult.data;
};

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

const embedJob = async (job_details: JobDetails) => {
  const { pipeline } = await import("@xenova/transformers");
  const embedder = await pipeline(
    "feature-extraction",
    "Xenova/all-mpnet-base-v2"
  );

  const jobString = jobToString(job_details);
  const embeddingResult = await embedder(jobString, {
    pooling: "mean",
    normalize: true,
  });

  return embeddingResult.data;
};

const embedQuestion = async (question: string) => {
  const { pipeline } = await import("@xenova/transformers");
  const embedder = await pipeline(
    "feature-extraction",
    "Xenova/all-mpnet-base-v2"
  );
  const questionEmbedding = await embedder(question, {
    pooling: "mean",
    normalize: true,
  });

  return questionEmbedding.data;
};

export { embedResume,embedJob,embedQuestion };

function resumeToString(resume) {
  const workDescriptions = resume.work_experience
    ?.map((job) => `${job.title} at ${job.company}: ${job.responsibilities}`)
    .join("\n");

  return `
    Name: ${resume.name}
    Years of Experience: ${resume.years_of_experience}
    Work Experience: ${workDescriptions}
    Skills: ${resume.skills}
    Certifications: ${resume.certifications || "None"}
    Education: ${resume.education}
`;
}

const embedResume = async (parsedResume) => {
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

function jobToString(job) {
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

const embedJob = async (job_details) => {
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

module.exports = { embedResume, embedJob };

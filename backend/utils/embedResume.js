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

module.exports = embedResume;

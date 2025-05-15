const cleanAndParseJSON = (responseText) => {
  try {
    const cleaned = responseText.replace(/```json|```/g, "").trim();

    const parsed = JSON.parse(cleaned);

    const safeParsed = {
      name: parsed.name || "",
      years_of_experience: parsed.years_of_experience || "",
      work_experience: Array.isArray(parsed.work_experience)
        ? parsed.work_experience
        : [],
      skills: parsed.skills || "",
      certifications: parsed.certifications || "",
      education: parsed.education || "",
    };

    return safeParsed;
  } catch (err) {
    console.error("Failed to clean/parse JSON:", err);
    return null;
  }
};

module.exports = cleanAndParseJSON;

const cleanAndParseJSON = require("./cleanParseJson");

const parseResumeText = async (resumeText) => {
  const prompt = `Extract the following details from the resume text below:
- Name
- Work Experience (include title, company and responsibilities) 
- Total Years of Experience (calculate and return it in the format like "4+ years")
- Skills
- Certifications
- Education

Respond in this exact JSON format:
{
  "name": "",
  "years_of_experience": "",
  "work_experience": [
    {
      "title": "",
      "company": "",
      "responsibilities": []
    }
  ],
  "skills": "",
  "certifications": "",
  "education": ""
}

Resume:
"""
${resumeText}
"""`;

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4-turbo",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Open router request failed");
    }
    const parsed = cleanAndParseJSON(data.choices[0].message.content);
    return parsed;
  } catch (err) {
    console.error("Failed to parse resume:", err);
    return null;
  }
};

const parseJobDescription = async (job_description) => {
  const prompt = `Extract the following from this job description:
  1. Responsibilities (as an array)
  2. Summary (a brief 5 sentence summary of the job)
  
  Respond in this JSON format:
  {
    "responsibilities": [],
    "summary": ""
  }

    Job Description:
"""
${job_description}
"""
  `;

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4-turbo",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Open router request failed");
    }
    const parsed = JSON.parse(
      data.choices[0].message.content.replace(/```json|```/g, "").trim()
    );
    return parsed;
  } catch (err) {
    console.error("Failed to parse resume:", err);
    return null;
  }
};

module.exports = { parseResumeText, parseJobDescription };

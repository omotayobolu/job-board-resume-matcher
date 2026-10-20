import cleanAndParseJSON from "./cleanParseJson";
import { completionSchema, jobOutputSchema } from "../schemas";
import { requiredEnv } from "../env";

const parseResumeText = async (resumeText: string) => {
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
          Authorization: `Bearer ${requiredEnv("OPENROUTER_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4-turbo",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        }),
      }
    );

    const data: unknown = await response.json();

    if (!response.ok) {
      throw new Error("OpenRouter request failed");
    }
    const completion = completionSchema.parse(data);
    const parsed = cleanAndParseJSON(completion.choices[0]!.message.content);
    return parsed;
  } catch (err) {
    throw new Error("Resume parsing failed", { cause: err });
  }
};

const parseJobDescription = async (job_description: string): Promise<{ responsibilities: string[]; summary: string }> => {
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
          Authorization: `Bearer ${requiredEnv("OPENROUTER_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4-turbo",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        }),
      }
    );

    const data: unknown = await response.json();

    if (!response.ok) {
      throw new Error("OpenRouter request failed");
    }
    const completion = completionSchema.parse(data);
    const raw: unknown = JSON.parse(
      completion.choices[0]!.message.content.replace(/```json|```/g, "").trim()
    );
    const parsed = jobOutputSchema.parse(raw);
    return parsed;
  } catch (err) {
    throw new Error("Job description parsing failed", { cause: err });
  }
};

export { parseResumeText,parseJobDescription };

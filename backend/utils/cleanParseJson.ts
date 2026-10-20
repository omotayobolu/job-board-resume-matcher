import type { ResumeProfile } from "../types/domain";
import { resumeOutputSchema } from "../schemas";

const cleanAndParseJSON = (responseText: string): ResumeProfile => {
  try {
    const cleaned = responseText.replace(/```json|```/g, "").trim();

    const parsed: unknown = JSON.parse(cleaned);
    return resumeOutputSchema.parse(parsed);
  } catch (err) {
    throw new Error("Invalid JSON returned for resume", { cause: err });
  }
};

export default cleanAndParseJSON;

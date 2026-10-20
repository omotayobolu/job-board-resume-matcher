import mammoth from "mammoth";
import pdfParse from "pdf-parse";

const extractText = async (fileBuffer: Buffer, mimeType: string): Promise<string> => {
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  } else if (mimeType === "application/pdf") {
    const result = await pdfParse(fileBuffer);
    return result.text;
  } else {
    throw new Error("Unsupported file type");
  }
};

export default extractText;

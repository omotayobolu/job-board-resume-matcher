const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");

const extractText = async (fileBuffer, mimeType) => {
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

module.exports = extractText;

// Free-tier CV upload limits. Change them here, not at each call site.
export const uploadLimits = {
  maxResumeBytes: 10 * 1024 * 1024,
  maxZipBytes: 50 * 1024 * 1024,
  maxFilesPerBatch: 100,
  // 100 CVs at the per-file cap. Actual bytes read are counted as well.
  maxUncompressedBytes: 100 * 10 * 1024 * 1024,
  // Stop a zip that hides a bomb behind thousands of entries.
  maxZipEntries: 1000,
  monthlyCvCap: 200,
  maxRoleChars: 20_000,
  maxTitleChars: 120,
} as const;

export const PDF_MIME = "application/pdf";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const ZIP_MIMES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/x-zip",
]);

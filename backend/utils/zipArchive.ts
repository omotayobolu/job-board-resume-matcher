import yauzl from "yauzl";
import { DOCX_MIME, PDF_MIME, uploadLimits } from "../config/uploadLimits";
import { CustomError, HttpStatusCode } from "./error-handler";

export type ExtractedCv = {
  filename: string;
  buffer: Buffer;
  mimetype: typeof PDF_MIME | typeof DOCX_MIME;
};

export type SkippedZipEntry = {
  filename: string;
  reason: string;
};

export const unsupportedCvReason = "Not a PDF or DOCX file.";

function badRequest(message: string): CustomError {
  return new CustomError("BAD REQUEST", HttpStatusCode.BAD_REQUEST, message, true);
}

// Junk Apple/Windows metadata. These are not CVs and are not a zip-slip.
export function isJunkZipEntry(fileName: string): boolean {
  const parts = fileName.split("/");
  if (parts.includes("__MACOSX")) return true;
  const base = parts[parts.length - 1] ?? "";
  if (!base) return true;
  if (base === ".DS_Store" || base === "Thumbs.db" || base === "desktop.ini") return true;
  if (base.startsWith("._") || base.startsWith(".")) return true;
  return false;
}

function extensionOf(fileName: string): "pdf" | "docx" | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  return null;
}

function baseName(fileName: string): string {
  const parts = fileName.split("/");
  return parts[parts.length - 1] || fileName;
}

async function readCapped(
  stream: AsyncIterable<Uint8Array> & { destroy(): void },
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      total += buf.length;
      // Count real bytes. A header that under-reports the size must not expand forever.
      if (total > maxBytes) {
        stream.destroy();
        throw badRequest("This zip is too large when uncompressed.");
      }
      chunks.push(buf);
    }
  } catch (error) {
    stream.destroy();
    throw error;
  }
  return Buffer.concat(chunks);
}

function zipFailure(error: unknown): Error {
  if (error instanceof CustomError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/invalid relative path|absolute path|invalid characters in fileName/i.test(message)) {
    return badRequest("This zip contains an unsafe path.");
  }
  if (/encrypted/i.test(message)) {
    return badRequest("This zip is encrypted. Remove the password and upload it again.");
  }
  if (/end of central directory|not a zip file/i.test(message)) {
    return badRequest("That file is not a valid zip archive.");
  }
  if (/too large when uncompressed|size mismatch/i.test(message)) {
    return badRequest("This zip is too large when uncompressed.");
  }
  return error instanceof Error ? error : new Error(message);
}

// Read CV files out of a zip. Rejects encrypted archives, unsafe paths, and
// uncompressed output over the configured cap. Skips __MACOSX and other junk.
// A notes.txt (or any other non-CV) is reported as skipped and does not reject the zip.
export async function extractCvZip(zipBuffer: Buffer): Promise<{ files: ExtractedCv[]; skipped: SkippedZipEntry[] }> {
  if (zipBuffer.length > uploadLimits.maxZipBytes) {
    throw badRequest("Zip archives must be 50 MB or smaller.");
  }

  let zipfile: yauzl.ZipFile;
  try {
    // strictFileNames stays off so Windows zips that use "\" still open.
    // validateFileName then rejects absolute paths and ".." segments.
    zipfile = await yauzl.fromBufferPromise(zipBuffer, {
      decodeStrings: true,
      validateEntrySizes: true,
    });
  } catch (error) {
    throw zipFailure(error);
  }

  const files: ExtractedCv[] = [];
  const skipped: SkippedZipEntry[] = [];
  let uncompressedTotal = 0;
  let entries = 0;
  try {
    for await (const entry of zipfile.eachEntry()) {
      entries += 1;
      if (entries > uploadLimits.maxZipEntries) {
        throw badRequest("This zip has too many entries.");
      }
      if (entry.isEncrypted()) {
        throw badRequest("This zip is encrypted. Remove the password and upload it again.");
      }
      const unsafe = yauzl.validateFileName(entry.fileName);
      if (unsafe) throw badRequest("This zip contains an unsafe path.");
      if (entry.fileName.endsWith("/")) continue;
      if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0) {
        throw badRequest("This zip is too large when uncompressed.");
      }
      if (uncompressedTotal + entry.uncompressedSize > uploadLimits.maxUncompressedBytes) {
        throw badRequest("This zip is too large when uncompressed.");
      }
      uncompressedTotal += entry.uncompressedSize;

      if (isJunkZipEntry(entry.fileName)) continue;

      const extension = extensionOf(entry.fileName);
      const filename = baseName(entry.fileName);
      if (!extension) {
        skipped.push({ filename, reason: unsupportedCvReason });
        continue;
      }
      if (entry.uncompressedSize > uploadLimits.maxResumeBytes) {
        throw badRequest(`"${filename}" is larger than 10 MB.`);
      }
      if (entry.uncompressedSize === 0) {
        throw badRequest(`"${filename}" is empty.`);
      }

      const stream = await zipfile.openReadStreamPromise(entry);
      const buffer = await readCapped(stream, uploadLimits.maxResumeBytes);
      if (buffer.length === 0) throw badRequest(`"${filename}" is empty.`);
      if (buffer.length > uploadLimits.maxResumeBytes) {
        throw badRequest(`"${filename}" is larger than 10 MB.`);
      }
      files.push({
        filename,
        buffer,
        mimetype: extension === "pdf" ? PDF_MIME : DOCX_MIME,
      });
    }
  } catch (error) {
    throw zipFailure(error);
  } finally {
    zipfile.close();
  }

  return { files, skipped };
}

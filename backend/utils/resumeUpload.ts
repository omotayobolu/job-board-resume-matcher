import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { s3 } from "../config/s3";
import { requiredEnv } from "../env";
import { CustomError, HttpStatusCode } from "./error-handler";

// Validate before database work; upload only after authorization and profile checks.
export function validateResumeFile(
  file: Express.Multer.File | undefined,
  missingMessage = "Resume is required.",
): Express.Multer.File {
  if (!file) {
    throw new CustomError(
      "BAD REQUEST",
      HttpStatusCode.BAD_REQUEST,
      missingMessage,
      true,
    );
  }
  if (
    ![
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ].includes(file.mimetype)
  ) {
    throw new CustomError(
      "BAD REQUEST",
      HttpStatusCode.BAD_REQUEST,
      "Resume must be a PDF or DOCX file.",
      true,
    );
  }
  return file;
}

export async function uploadResume(
  file: Express.Multer.File,
  userId: string,
): Promise<string> {
  const extension = file.mimetype === "application/pdf" ? "pdf" : "docx";
  const key = `resumes/${userId}/${randomUUID()}.${extension}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: requiredEnv("S3_BUCKET_NAME"),
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }),
  );
  return key;
}

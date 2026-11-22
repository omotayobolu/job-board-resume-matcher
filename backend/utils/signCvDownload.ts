import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/s3";
import { requiredEnv } from "../env";

export const CV_URL_TTL_SECONDS = 300;

function contentDisposition(filename: string, inline: boolean): string {
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encoded}`;
}

export const cvSigner = {
  async sign(input: { key: string; filename: string; contentType: string }): Promise<string> {
    const inline = input.contentType === "application/pdf";
    return getSignedUrl(s3, new GetObjectCommand({
      Bucket: requiredEnv("S3_BUCKET_NAME"),
      Key: input.key,
      ResponseContentType: input.contentType,
      ResponseContentDisposition: contentDisposition(input.filename, inline),
      ResponseCacheControl: "no-store",
    }), { expiresIn: CV_URL_TTL_SECONDS });
  },
};

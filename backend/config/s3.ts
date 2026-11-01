import { S3Client } from "@aws-sdk/client-s3";
import { requiredEnv } from "../env";

const s3 = new S3Client({ region: requiredEnv("AWS_REGION") });

export { s3 };

-- Replace the old resume URL with an S3 object key and original filename.
BEGIN;

ALTER TABLE public.job_seeker
  ADD COLUMN resume_s3_key text,
  ADD COLUMN resume_filename text;

-- Convert any S3 locations saved before this migration to object keys.
UPDATE public.job_seeker
SET resume_s3_key = regexp_replace(resume_url, '^s3://[^/]+/', '')
WHERE resume_url LIKE 's3://%';

ALTER TABLE public.job_seeker
  DROP COLUMN resume_url;

COMMIT;

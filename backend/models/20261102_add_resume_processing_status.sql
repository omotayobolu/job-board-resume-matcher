-- Run after the S3 and pgvector migrations and after resetting old embeddings.
BEGIN;

ALTER TABLE public.job_seeker
  ADD COLUMN resume_processing_status text NOT NULL DEFAULT 'pending'
    CHECK (resume_processing_status IN ('pending', 'processing', 'completed', 'failed')),
  ADD COLUMN resume_processing_started_at timestamptz,
  ADD COLUMN resume_processing_token uuid,
  ADD COLUMN resume_processing_attempts integer NOT NULL DEFAULT 0;

UPDATE public.job_seeker
SET resume_processing_status = 'completed'
WHERE parsed_resume IS NOT NULL AND embedding IS NOT NULL;

UPDATE public.job_seeker
SET resume_processing_status = 'failed'
WHERE resume_s3_key IS NULL AND parsed_resume IS NULL
  AND resume_processing_status = 'pending';

COMMIT;

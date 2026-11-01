-- Run after 20261102_add_resume_processing_status.sql.
-- pg-boss creates its own queue schema when the backend starts.
BEGIN;

ALTER TABLE public.job_seeker
  ADD COLUMN resume_job_id uuid,
  DROP COLUMN resume_processing_started_at,
  DROP COLUMN resume_processing_attempts;

-- Existing parsed JSON is sufficient to rebuild an embedding, even if its
-- original S3 file is unavailable.
UPDATE public.job_seeker
SET resume_processing_status = 'pending'
WHERE resume_processing_status = 'failed'
  AND parsed_resume IS NOT NULL AND embedding IS NULL;

COMMIT;

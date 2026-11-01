-- Run after the resume S3 column migration on an existing database.
BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.jobs
  ADD COLUMN embedding vector(768);

ALTER TABLE public.job_seeker
  ADD COLUMN embedding vector(768),
  ADD COLUMN parsed_resume jsonb;

CREATE INDEX IF NOT EXISTS applications_job_id_idx
  ON public.applications (job_id);

COMMIT;

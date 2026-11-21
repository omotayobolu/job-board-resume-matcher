-- Run after the pgvector embedding migrations and before starting the backend.
-- pg-boss creates its queue schema at startup.
BEGIN;

ALTER TABLE public.jobs
  ADD COLUMN embedding_status text NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed')),
  ADD COLUMN embedding_job_id uuid;

-- Startup queues existing jobs without vectors; existing vectors need no AI work.
UPDATE public.jobs SET embedding_status = 'completed' WHERE embedding IS NOT NULL;

COMMIT;

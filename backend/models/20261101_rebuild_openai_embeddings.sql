-- Run once after 20261101_add_pgvector_embeddings.sql and before deploying
-- OpenAI embeddings. Xenova and OpenAI vectors must not be compared together.
BEGIN;

UPDATE public.jobs SET embedding = NULL WHERE embedding IS NOT NULL;
UPDATE public.job_seeker SET embedding = NULL WHERE embedding IS NOT NULL;
UPDATE public.applications SET score = NULL WHERE score IS NOT NULL;

COMMIT;

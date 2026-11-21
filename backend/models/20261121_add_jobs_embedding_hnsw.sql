-- Speed up cosine search of job embeddings for resume recommendations.
-- Run after the pgvector embedding migrations.
BEGIN;

CREATE INDEX IF NOT EXISTS jobs_embedding_hnsw_idx
  ON public.jobs
  USING hnsw (embedding vector_cosine_ops);

COMMIT;

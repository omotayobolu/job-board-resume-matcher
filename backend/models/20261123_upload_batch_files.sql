-- Per-file status for a CV upload batch. Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS public.upload_batch_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.upload_batches(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  screening_id uuid REFERENCES public.screenings(id) ON DELETE SET NULL,
  filename text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  created_at timestamp without time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS upload_batch_files_batch_id_idx
  ON public.upload_batch_files (batch_id);

COMMIT;

-- Why a batch file was skipped or failed. Safe to re-run.
BEGIN;

ALTER TABLE public.upload_batch_files
  ADD COLUMN IF NOT EXISTS reason text;

COMMIT;

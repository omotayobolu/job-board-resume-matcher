-- Phase 3 fit notes on screenings.
-- reason_summary, reason_strengths, reason_gaps, and reason_status already
-- exist (20261122_recruiter_workspaces.sql). This adds the must-have checklist
-- and the worker claim token. Safe to re-run.
BEGIN;

ALTER TABLE public.screenings
  ADD COLUMN IF NOT EXISTS must_have_checks jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.screenings
  ADD COLUMN IF NOT EXISTS reason_token uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'screenings_must_have_checks_array'
      AND conrelid = 'public.screenings'::regclass
  ) THEN
    ALTER TABLE public.screenings
      ADD CONSTRAINT screenings_must_have_checks_array
      CHECK (jsonb_typeof(must_have_checks) = 'array');
  END IF;
END
$$;

COMMIT;

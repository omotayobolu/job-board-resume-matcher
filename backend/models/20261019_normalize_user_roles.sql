-- Convert existing role values and constrain future values.
BEGIN;

UPDATE public.users
SET role = 'job_seeker'
WHERE role = 'job seeker';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_role_check'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('job_seeker', 'recruiter'));
  END IF;
END
$$;

COMMIT;

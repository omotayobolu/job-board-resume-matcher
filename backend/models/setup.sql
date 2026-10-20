-- Initialize an empty PostgreSQL database for the job board.
-- Run with psql -v ON_ERROR_STOP=1 -f backend/models/setup.sql

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'application_status'
  ) THEN
    CREATE TYPE public.application_status AS ENUM
      ('Applied', 'Interviewing', 'Hired', 'Rejected');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar UNIQUE,
  full_name varchar,
  password_hash text,
  role varchar CHECK (role IN ('job_seeker', 'recruiter')),
  created_at timestamp without time zone,
  hasprofile boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.recruiter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  type_of_organization varchar,
  location varchar,
  created_at timestamp without time zone DEFAULT now(),
  company_name text
);

CREATE TABLE IF NOT EXISTS public.job_seeker (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  job_title varchar,
  location varchar,
  remote_preference text,
  resume_url text,
  created_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  job_title text,
  job_description text,
  location text,
  required_skills text[],
  job_status varchar,
  created_at timestamp without time zone,
  work_type varchar(10),
  summary text
);

CREATE TABLE IF NOT EXISTS public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  job_seeker_id uuid REFERENCES public.job_seeker(user_id) ON DELETE CASCADE,
  status public.application_status NOT NULL DEFAULT 'Applied',
  score double precision,
  applied_at timestamp without time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS applications_job_seeker_id_job_id_idx
  ON public.applications (job_seeker_id, job_id);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  heading varchar(255),
  message text NOT NULL,
  priority varchar(10) DEFAULT 'low'
    CHECK (priority IN ('low', 'medium', 'high')),
  is_read boolean DEFAULT false,
  applicant_id uuid,
  job_id uuid
);

COMMIT;

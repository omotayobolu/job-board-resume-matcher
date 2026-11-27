-- Initialize an empty PostgreSQL database for Shortlistly.
-- Run with psql -v ON_ERROR_STOP=1 -f backend/models/setup.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

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

CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_members (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  member_role text NOT NULL CHECK (member_role IN ('owner', 'admin', 'recruiter')),
  created_at timestamp without time zone DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS workspace_members_user_id_idx
  ON public.workspace_members (user_id);

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
  resume_s3_key text,
  resume_filename text,
  embedding vector(768),
  parsed_resume jsonb,
  resume_processing_status text NOT NULL DEFAULT 'pending'
    CHECK (resume_processing_status IN ('pending', 'processing', 'completed', 'failed')),
  resume_processing_token uuid,
  resume_job_id uuid,
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
  summary text,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  embedding_status text NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed')),
  embedding_job_id uuid,
  embedding vector(768)
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

CREATE INDEX IF NOT EXISTS applications_job_id_idx
  ON public.applications (job_id);

CREATE INDEX IF NOT EXISTS jobs_workspace_id_idx
  ON public.jobs (workspace_id);

CREATE INDEX IF NOT EXISTS jobs_embedding_hnsw_idx
  ON public.jobs USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  full_name text,
  email text,
  phone text,
  resume_s3_key text,
  resume_filename text,
  file_sha256 text,
  parsed_resume jsonb,
  embedding vector(768),
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_token uuid,
  processing_job_id uuid,
  created_at timestamp without time zone DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS candidates_workspace_file_sha256_idx
  ON public.candidates (workspace_id, file_sha256)
  WHERE file_sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS candidates_embedding_hnsw_idx
  ON public.candidates USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS public.upload_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  total_files integer NOT NULL DEFAULT 0,
  processed_files integer NOT NULL DEFAULT 0,
  failed_files integer NOT NULL DEFAULT 0,
  skipped_files integer NOT NULL DEFAULT 0,
  created_at timestamp without time zone DEFAULT now(),
  completed_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.upload_batches(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'shortlisted', 'rejected', 'hired')),
  score double precision,
  reason_summary text,
  reason_strengths text[],
  reason_gaps text[],
  reason_status text NOT NULL DEFAULT 'pending'
    CHECK (reason_status IN ('pending', 'processing', 'completed', 'failed')),
  must_have_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason_token uuid,
  created_at timestamp without time zone DEFAULT now(),
  UNIQUE (job_id, candidate_id),
  CONSTRAINT screenings_must_have_checks_array CHECK (jsonb_typeof(must_have_checks) = 'array')
);

CREATE TABLE IF NOT EXISTS public.upload_batch_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.upload_batches(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  screening_id uuid REFERENCES public.screenings(id) ON DELETE SET NULL,
  filename text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  reason text,
  created_at timestamp without time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS upload_batch_files_batch_id_idx
  ON public.upload_batch_files (batch_id);

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

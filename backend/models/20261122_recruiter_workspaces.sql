-- Recruiter workspaces, uploaded candidates, and screenings.
-- embedding vector(768) matches public.jobs.embedding and public.job_seeker.embedding.
-- Safe to re-run: existing applications and job_seeker rows are left in place.
BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
DECLARE
  job_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO job_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'jobs'
    AND a.attname = 'embedding'
    AND NOT a.attisdropped;
  IF job_type IS DISTINCT FROM 'vector(768)' THEN
    RAISE EXCEPTION 'candidates.embedding is vector(768) to match jobs.embedding (%).', job_type;
  END IF;
END
$$;

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

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_workspace_id_fkey'
      AND conrelid = 'public.jobs'::regclass
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS jobs_workspace_id_idx
  ON public.jobs (workspace_id);

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
  created_at timestamp without time zone DEFAULT now(),
  UNIQUE (job_id, candidate_id)
);

-- One workspace per existing recruiter. Company name when the profile has one.
WITH recruiters AS (
  SELECT
    u.id AS user_id,
    gen_random_uuid() AS workspace_id,
    COALESCE(
      NULLIF(btrim(profile.company_name), ''),
      NULLIF(btrim(u.full_name), '') || '''s workspace',
      'Workspace'
    ) AS name
  FROM public.users u
  LEFT JOIN LATERAL (
    SELECT r.company_name
    FROM public.recruiter r
    WHERE r.user_id = u.id
    ORDER BY r.created_at DESC NULLS LAST
    LIMIT 1
  ) profile ON true
  WHERE u.role = 'recruiter'
    AND NOT EXISTS (
      SELECT 1 FROM public.workspace_members wm WHERE wm.user_id = u.id
    )
),
inserted_workspaces AS (
  INSERT INTO public.workspaces (id, name)
  SELECT workspace_id, name FROM recruiters
  RETURNING id
),
inserted_members AS (
  INSERT INTO public.workspace_members (workspace_id, user_id, member_role)
  SELECT workspace_id, user_id, 'owner' FROM recruiters
  RETURNING workspace_id
)
SELECT
  (SELECT count(*) FROM inserted_workspaces) AS workspaces,
  (SELECT count(*) FROM inserted_members) AS members;

UPDATE public.jobs j
SET workspace_id = (
  SELECT wm.workspace_id
  FROM public.workspace_members wm
  WHERE wm.user_id = j.recruiter_id
    AND wm.member_role = 'owner'
  ORDER BY wm.created_at
  LIMIT 1
)
WHERE j.workspace_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.user_id = j.recruiter_id
      AND wm.member_role = 'owner'
  );

-- One-way copy. applications and job_seeker stay as they are.
INSERT INTO public.candidates (
  workspace_id, full_name, email, phone,
  resume_s3_key, resume_filename, parsed_resume, embedding, processing_status
)
SELECT DISTINCT ON (j.workspace_id, js.user_id)
  j.workspace_id,
  NULLIF(btrim(u.full_name), ''),
  NULLIF(btrim(u.email), ''),
  NULLIF(btrim(js.parsed_resume->>'phone'), ''),
  js.resume_s3_key,
  js.resume_filename,
  js.parsed_resume,
  js.embedding,
  COALESCE(js.resume_processing_status, 'pending')
FROM public.applications a
JOIN public.jobs j ON j.id = a.job_id
JOIN public.job_seeker js ON js.user_id = a.job_seeker_id
JOIN public.users u ON u.id = js.user_id
WHERE j.workspace_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.candidates c
    WHERE c.workspace_id = j.workspace_id
      AND c.resume_s3_key IS NOT DISTINCT FROM js.resume_s3_key
      AND c.email IS NOT DISTINCT FROM NULLIF(btrim(u.email), '')
  )
ORDER BY j.workspace_id, js.user_id, a.applied_at DESC NULLS LAST;

INSERT INTO public.screenings (job_id, candidate_id, status, score, reason_status)
SELECT
  a.job_id,
  c.id,
  CASE a.status::text
    WHEN 'Hired' THEN 'hired'
    WHEN 'Rejected' THEN 'rejected'
    WHEN 'Interviewing' THEN 'shortlisted'
    ELSE 'new'
  END,
  a.score,
  'pending'
FROM public.applications a
JOIN public.jobs j ON j.id = a.job_id
JOIN public.job_seeker js ON js.user_id = a.job_seeker_id
JOIN public.users u ON u.id = js.user_id
JOIN public.candidates c
  ON c.workspace_id = j.workspace_id
 AND c.resume_s3_key IS NOT DISTINCT FROM js.resume_s3_key
 AND c.email IS NOT DISTINCT FROM NULLIF(btrim(u.email), '')
WHERE j.workspace_id IS NOT NULL
ON CONFLICT (job_id, candidate_id) DO NOTHING;

COMMIT;

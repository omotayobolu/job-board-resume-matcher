-- Table: public.applications

-- DROP TABLE IF EXISTS public.applications;

CREATE TABLE IF NOT EXISTS public.applications
(
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    job_id uuid,
    job_seeker_id uuid,
    status application_status NOT NULL DEFAULT 'Applied'::application_status,
    score double precision,
    applied_at timestamp without time zone,
    CONSTRAINT applications_pkey PRIMARY KEY (id),
    CONSTRAINT applications_job_id_fkey FOREIGN KEY (job_id)
        REFERENCES public.jobs (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT applications_job_seeker_id_fkey FOREIGN KEY (job_seeker_id)
        REFERENCES public.job_seeker (user_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.applications
    OWNER to postgres;

COMMENT ON COLUMN public.applications.status
    IS 'Applied | Interviewing | Hired | Rejected';

COMMENT ON COLUMN public.applications.score
    IS 'AI match score';
-- Index: applications_job_seeker_id_job_id_idx

-- DROP INDEX IF EXISTS public.applications_job_seeker_id_job_id_idx;

CREATE UNIQUE INDEX IF NOT EXISTS applications_job_seeker_id_job_id_idx
    ON public.applications USING btree
    (job_seeker_id ASC NULLS LAST, job_id ASC NULLS LAST)
    TABLESPACE pg_default;






-- Table: public.job_seeker

-- DROP TABLE IF EXISTS public.job_seeker;

CREATE TABLE IF NOT EXISTS public.job_seeker
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid,
    job_title character varying COLLATE pg_catalog."default",
    location character varying COLLATE pg_catalog."default",
    remote_preference text COLLATE pg_catalog."default",
    resume_url text COLLATE pg_catalog."default",
    created_at timestamp without time zone,
    CONSTRAINT job_seeker_pkey PRIMARY KEY (id),
    CONSTRAINT job_seeker_user_id_unique UNIQUE (user_id),
    CONSTRAINT job_seeker_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.job_seeker
    OWNER to postgres;






-- Table: public.jobs

-- DROP TABLE IF EXISTS public.jobs;

CREATE TABLE IF NOT EXISTS public.jobs
(
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    recruiter_id uuid,
    job_title text COLLATE pg_catalog."default",
    job_description text COLLATE pg_catalog."default",
    location text COLLATE pg_catalog."default",
    required_skills text[] COLLATE pg_catalog."default",
    job_status character varying COLLATE pg_catalog."default",
    created_at timestamp without time zone,
    work_type character varying(10) COLLATE pg_catalog."default",
    summary text COLLATE pg_catalog."default",
    CONSTRAINT jobs_pkey PRIMARY KEY (id),
    CONSTRAINT jobs_recruiter_id_fkey FOREIGN KEY (recruiter_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.jobs
    OWNER to postgres;

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS embedding vector(768);

CREATE INDEX IF NOT EXISTS jobs_embedding_hnsw_idx
    ON public.jobs USING hnsw (embedding vector_cosine_ops);





-- Table: public.notifications

-- DROP TABLE IF EXISTS public.notifications;

CREATE TABLE IF NOT EXISTS public.notifications
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    heading character varying(255) COLLATE pg_catalog."default",
    message text COLLATE pg_catalog."default" NOT NULL,
    priority character varying(10) COLLATE pg_catalog."default" DEFAULT 'low'::character varying,
    is_read boolean DEFAULT false,
    applicant_id uuid,
    job_id uuid,
    CONSTRAINT notifications_pkey PRIMARY KEY (id),
    CONSTRAINT notifications_priority_check CHECK (priority::text = ANY (ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying]::text[]))
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.notifications
    OWNER to postgres;





-- Table: public.recruiter

-- DROP TABLE IF EXISTS public.recruiter;

CREATE TABLE IF NOT EXISTS public.recruiter
(
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid,
    type_of_organization character varying COLLATE pg_catalog."default",
    location character varying COLLATE pg_catalog."default",
    created_at timestamp without time zone DEFAULT now(),
    company_name text COLLATE pg_catalog."default",
    CONSTRAINT recruiter_pkey PRIMARY KEY (id),
    CONSTRAINT recruiter_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.recruiter
    OWNER to postgres;






-- Table: public.users

-- DROP TABLE IF EXISTS public.users;

CREATE TABLE IF NOT EXISTS public.users
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    email character varying COLLATE pg_catalog."default",
    full_name character varying COLLATE pg_catalog."default",
    role character varying COLLATE pg_catalog."default",
    created_at timestamp without time zone,
    hasprofile boolean DEFAULT false,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.users
    OWNER to postgres;

-- Workspaces, candidates, and screenings. embedding vector(768) matches jobs.embedding.
-- See backend/models/20261122_recruiter_workspaces.sql.

CREATE TABLE IF NOT EXISTS public.workspaces
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT workspaces_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.workspace_members
(
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    member_role text COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT workspace_members_pkey PRIMARY KEY (workspace_id, user_id),
    CONSTRAINT workspace_members_member_role_check CHECK (member_role = ANY (ARRAY['owner'::text, 'admin'::text, 'recruiter'::text])),
    CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id)
        REFERENCES public.workspaces (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS workspace_members_user_id_idx
    ON public.workspace_members USING btree
    (user_id);

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS workspace_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jobs_workspace_id_fkey'
      AND conrelid = 'public.jobs'::regclass
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES public.workspaces (id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS jobs_workspace_id_idx
    ON public.jobs USING btree
    (workspace_id);

CREATE TABLE IF NOT EXISTS public.candidates
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    full_name text COLLATE pg_catalog."default",
    email text COLLATE pg_catalog."default",
    phone text COLLATE pg_catalog."default",
    resume_s3_key text COLLATE pg_catalog."default",
    resume_filename text COLLATE pg_catalog."default",
    file_sha256 text COLLATE pg_catalog."default",
    parsed_resume jsonb,
    embedding vector(768),
    processing_status text COLLATE pg_catalog."default" NOT NULL DEFAULT 'pending'::text,
    processing_token uuid,
    processing_job_id uuid,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT candidates_pkey PRIMARY KEY (id),
    CONSTRAINT candidates_processing_status_check CHECK (processing_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])),
    CONSTRAINT candidates_workspace_id_fkey FOREIGN KEY (workspace_id)
        REFERENCES public.workspaces (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS candidates_workspace_file_sha256_idx
    ON public.candidates USING btree
    (workspace_id, file_sha256)
    WHERE file_sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS candidates_embedding_hnsw_idx
    ON public.candidates USING hnsw
    (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS public.upload_batches
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    job_id uuid NOT NULL,
    uploaded_by uuid,
    status text COLLATE pg_catalog."default" NOT NULL DEFAULT 'pending'::text,
    total_files integer NOT NULL DEFAULT 0,
    processed_files integer NOT NULL DEFAULT 0,
    failed_files integer NOT NULL DEFAULT 0,
    skipped_files integer NOT NULL DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone,
    CONSTRAINT upload_batches_pkey PRIMARY KEY (id),
    CONSTRAINT upload_batches_status_check CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])),
    CONSTRAINT upload_batches_workspace_id_fkey FOREIGN KEY (workspace_id)
        REFERENCES public.workspaces (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT upload_batches_job_id_fkey FOREIGN KEY (job_id)
        REFERENCES public.jobs (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT upload_batches_uploaded_by_fkey FOREIGN KEY (uploaded_by)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.screenings
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    job_id uuid NOT NULL,
    candidate_id uuid NOT NULL,
    batch_id uuid,
    status text COLLATE pg_catalog."default" NOT NULL DEFAULT 'new'::text,
    score double precision,
    reason_summary text COLLATE pg_catalog."default",
    reason_strengths text[] COLLATE pg_catalog."default",
    reason_gaps text[] COLLATE pg_catalog."default",
    reason_status text COLLATE pg_catalog."default" NOT NULL DEFAULT 'pending'::text,
    must_have_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
    reason_token uuid,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT screenings_pkey PRIMARY KEY (id),
    CONSTRAINT screenings_job_id_candidate_id_key UNIQUE (job_id, candidate_id),
    CONSTRAINT screenings_status_check CHECK (status = ANY (ARRAY['new'::text, 'shortlisted'::text, 'rejected'::text, 'hired'::text])),
    CONSTRAINT screenings_reason_status_check CHECK (reason_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])),
    CONSTRAINT screenings_must_have_checks_array CHECK (jsonb_typeof(must_have_checks) = 'array'),
    CONSTRAINT screenings_job_id_fkey FOREIGN KEY (job_id)
        REFERENCES public.jobs (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT screenings_candidate_id_fkey FOREIGN KEY (candidate_id)
        REFERENCES public.candidates (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT screenings_batch_id_fkey FOREIGN KEY (batch_id)
        REFERENCES public.upload_batches (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL
);
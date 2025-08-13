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
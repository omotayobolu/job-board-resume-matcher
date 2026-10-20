-- Apply once to databases created before email/password authentication.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text;

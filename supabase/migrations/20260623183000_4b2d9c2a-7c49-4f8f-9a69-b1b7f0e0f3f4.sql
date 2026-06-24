CREATE TABLE public.password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);

CREATE INDEX password_reset_requests_email_idx ON public.password_reset_requests (email);
CREATE INDEX password_reset_requests_expires_idx ON public.password_reset_requests (expires_at);

GRANT ALL ON public.password_reset_requests TO service_role;
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

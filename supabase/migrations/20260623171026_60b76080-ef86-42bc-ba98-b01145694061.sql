CREATE TABLE public.pending_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  password text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);

CREATE INDEX pending_registrations_phone_idx ON public.pending_registrations (phone);
CREATE INDEX pending_registrations_expires_idx ON public.pending_registrations (expires_at);

GRANT ALL ON public.pending_registrations TO service_role;

ALTER TABLE public.pending_registrations ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: only service_role (which bypasses RLS) may access.
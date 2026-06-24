# Supabase Setup for Pocket Money Manager

This project uses Supabase for auth and database storage. If your Supabase project is new, follow these steps to create the required tables and connect the app.

## Required tables and schema

Run this SQL in the Supabase SQL editor or via Supabase CLI:

```sql
CREATE TYPE public.expense_category AS ENUM (
  'comida',
  'transporte',
  'hogar',
  'entretenimiento',
  'salud',
  'educacion',
  'compras',
  'servicios',
  'otros'
);

CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  category public.expense_category NOT NULL DEFAULT 'otros',
  description TEXT NOT NULL DEFAULT '',
  spent_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX expenses_user_spent_at_idx ON public.expenses (user_id, spent_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own expenses" ON public.expenses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own expenses" ON public.expenses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own expenses" ON public.expenses
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own expenses" ON public.expenses
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER expenses_set_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
```

## Environment variables

Set these variables in your `.env` file or in your deployment environment:

```dotenv
SUPABASE_URL="https://<your-project-id>.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
SUPABASE_SERVICE_ROLE_KEY="<your-service-role-key>"
VITE_SUPABASE_URL="https://<your-project-id>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="..."
TWILIO_MESSAGE_SERVICE_SID="MG..."
```

## Recommended steps

1. Create a new Supabase project.
2. Open the SQL editor and run the SQL above.
3. Copy the project URL and keys from Supabase settings.
4. Paste them into `.env`.
5. Restart the dev server.

## Useful npm commands

- `npm run supabase:login` — login to Supabase CLI
- `npm run supabase:push` — apply db migrations
- `npm run supabase:status` — inspect DB status
- `npm run supabase:start` — run local Supabase stack

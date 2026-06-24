-- initial_schema.sql
-- Ejecutar esto en Supabase SQL editor o mediante `npx supabase db push` si estás autenticado.

-- Tip: aplica en orden si tu proyecto no tiene migraciones previas.

-- 1) Tipo y tabla de gastos
-- `CREATE TYPE IF NOT EXISTS` puede no ser aceptado en el SQL editor; comprobamos y creamos condicionalmente.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'expense_category') THEN
    CREATE TYPE public.expense_category AS ENUM ('comida','transporte','hogar','entretenimiento','salud','educacion','compras','servicios','otros');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  category public.expense_category NOT NULL DEFAULT 'otros',
  description TEXT NOT NULL DEFAULT '',
  spent_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_user_spent_at_idx ON public.expenses(user_id, spent_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Policies: crear condicionalmente (SQL editor no soporta IF NOT EXISTS en CREATE POLICY)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Users select own expenses' AND polrelid = 'public.expenses'::regclass) THEN
    EXECUTE 'CREATE POLICY "Users select own expenses" ON public.expenses FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Users insert own expenses' AND polrelid = 'public.expenses'::regclass) THEN
    EXECUTE 'CREATE POLICY "Users insert own expenses" ON public.expenses FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Users update own expenses' AND polrelid = 'public.expenses'::regclass) THEN
    EXECUTE 'CREATE POLICY "Users update own expenses" ON public.expenses FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Users delete own expenses' AND polrelid = 'public.expenses'::regclass) THEN
    EXECUTE 'CREATE POLICY "Users delete own expenses" ON public.expenses FOR DELETE USING (auth.uid() = user_id)';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Crear el trigger solo si no existe (CREATE TRIGGER no admite IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'expenses_set_updated_at') THEN
    EXECUTE 'CREATE TRIGGER expenses_set_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END$$;

-- 2) Tabla pending_registrations
CREATE TABLE IF NOT EXISTS public.pending_registrations (
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

CREATE INDEX IF NOT EXISTS pending_registrations_phone_idx ON public.pending_registrations (phone);
CREATE INDEX IF NOT EXISTS pending_registrations_expires_idx ON public.pending_registrations (expires_at);

GRANT ALL ON public.pending_registrations TO service_role;

ALTER TABLE public.pending_registrations ENABLE ROW LEVEL SECURITY;

-- 3) Tabla password_reset_requests
CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS password_reset_requests_email_idx ON public.password_reset_requests (email);
CREATE INDEX IF NOT EXISTS password_reset_requests_expires_idx ON public.password_reset_requests (expires_at);

GRANT ALL ON public.password_reset_requests TO service_role;

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

-- Nota: la tabla `password_reset_requests` solo accede la clave de servicio cuando RLS está habilitado.

-- Nota: la tabla `pending_registrations` no tiene políticas públicas; solo la clave de servicio (service_role) puede acceder si RLS está habilitado.

-- FIN

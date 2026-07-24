
DO $$ BEGIN
  CREATE TYPE public.bot_admin_role AS ENUM ('super_admin', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.telegram_bot_admins
  ADD COLUMN IF NOT EXISTS role public.bot_admin_role NOT NULL DEFAULT 'admin';

UPDATE public.telegram_bot_admins SET role = 'super_admin' WHERE role = 'admin';

-- Convert telegram_bot_admins to GLOBAL bot admins (people allowed to use the bot itself)
DROP TABLE IF EXISTS public.telegram_bot_admins CASCADE;

CREATE TABLE public.telegram_bot_admins (
  user_id bigint PRIMARY KEY,
  username text,
  first_name text,
  added_by bigint,
  added_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.telegram_bot_admins TO authenticated;
GRANT ALL ON public.telegram_bot_admins TO service_role;

ALTER TABLE public.telegram_bot_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read bot admins" ON public.telegram_bot_admins
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TABLE public.telegram_bot_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL,
  user_id bigint NOT NULL,
  username text,
  first_name text,
  added_by bigint,
  added_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_id, user_id)
);

GRANT SELECT ON public.telegram_bot_admins TO authenticated;
GRANT ALL ON public.telegram_bot_admins TO service_role;

ALTER TABLE public.telegram_bot_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read bot admins" ON public.telegram_bot_admins
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_telegram_bot_admins_chat ON public.telegram_bot_admins (chat_id);
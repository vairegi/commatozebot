
CREATE TABLE public.bot_admin_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  chat_title TEXT,
  chat_username TEXT,
  chat_type TEXT,
  old_status TEXT,
  new_status TEXT,
  reason TEXT,
  actor_id BIGINT,
  actor_name TEXT,
  actor_username TEXT,
  deep_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bot_admin_events_created_at ON public.bot_admin_events (created_at DESC);
CREATE INDEX idx_bot_admin_events_chat_id ON public.bot_admin_events (chat_id);

GRANT SELECT, INSERT ON public.bot_admin_events TO authenticated;
GRANT ALL ON public.bot_admin_events TO service_role;

ALTER TABLE public.bot_admin_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view bot admin events"
  ON public.bot_admin_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

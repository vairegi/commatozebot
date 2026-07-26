
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS reply_markup JSONB;
ALTER TABLE public.broadcast_drafts ADD COLUMN IF NOT EXISTS reply_markup JSONB;

CREATE TABLE IF NOT EXISTS public.broadcast_button_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  buttons JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_button_presets TO authenticated;
GRANT ALL ON public.broadcast_button_presets TO service_role;
ALTER TABLE public.broadcast_button_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read own button presets" ON public.broadcast_button_presets
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

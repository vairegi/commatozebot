
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'copy';
ALTER TABLE public.broadcast_drafts ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'copy';
ALTER TABLE public.telegram_chats ADD COLUMN IF NOT EXISTS reactions_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.broadcast_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id bigint NOT NULL,
  name text NOT NULL,
  source_chat_id bigint NOT NULL,
  source_message_id bigint NOT NULL,
  preview_text text,
  mode text NOT NULL DEFAULT 'copy',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_templates TO authenticated;
GRANT ALL ON public.broadcast_templates TO service_role;
ALTER TABLE public.broadcast_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage broadcast_templates"
ON public.broadcast_templates FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS tg_broadcast_templates_updated_at ON public.broadcast_templates;
CREATE TRIGGER tg_broadcast_templates_updated_at
BEFORE UPDATE ON public.broadcast_templates
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

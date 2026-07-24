
-- Broadcast system tables

CREATE TABLE public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by bigint NOT NULL,
  created_by_name text,
  source_chat_id bigint NOT NULL,
  source_message_id bigint NOT NULL,
  preview_text text,
  scheduled_at timestamptz,
  auto_delete_seconds integer CHECK (auto_delete_seconds IS NULL OR (auto_delete_seconds > 0 AND auto_delete_seconds <= 172800)),
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.broadcasts TO authenticated;
GRANT ALL ON public.broadcasts TO service_role;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins can view broadcasts" ON public.broadcasts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_broadcasts_pending ON public.broadcasts (status, scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_broadcasts_created_by ON public.broadcasts (created_by, created_at DESC);

CREATE TABLE public.broadcast_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  chat_id bigint NOT NULL,
  chat_title text,
  sent_message_id bigint,
  status text NOT NULL DEFAULT 'pending',
  error text,
  delete_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.broadcast_targets TO authenticated;
GRANT ALL ON public.broadcast_targets TO service_role;
ALTER TABLE public.broadcast_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins can view broadcast targets" ON public.broadcast_targets FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_bt_broadcast ON public.broadcast_targets (broadcast_id);
CREATE INDEX idx_bt_delete_at ON public.broadcast_targets (delete_at) WHERE status = 'sent' AND delete_at IS NOT NULL;

CREATE TABLE public.broadcast_drafts (
  user_id bigint PRIMARY KEY,
  step text NOT NULL DEFAULT 'awaiting_content',
  source_chat_id bigint,
  source_message_id bigint,
  preview_text text,
  selected_chat_ids bigint[] NOT NULL DEFAULT '{}',
  scheduled_at timestamptz,
  auto_delete_seconds integer,
  editing_broadcast_id uuid,
  awaiting_custom text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.broadcast_drafts TO authenticated;
GRANT ALL ON public.broadcast_drafts TO service_role;
ALTER TABLE public.broadcast_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins can view drafts" ON public.broadcast_drafts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_broadcasts_updated BEFORE UPDATE ON public.broadcasts FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_bt_updated BEFORE UPDATE ON public.broadcast_targets FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_bd_updated BEFORE UPDATE ON public.broadcast_drafts FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

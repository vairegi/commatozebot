
CREATE TABLE public.broadcast_recurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by bigint NOT NULL,
  created_by_name text,
  source_chat_id bigint NOT NULL,
  source_message_id bigint NOT NULL,
  preview_text text,
  mode text NOT NULL DEFAULT 'copy',
  reply_markup jsonb,
  auto_delete_seconds integer,
  target_chat_ids bigint[] NOT NULL DEFAULT '{}',
  spec_kind text NOT NULL,           -- 'daily' | 'weekly' | 'monthly' | 'cron'
  spec_text text NOT NULL,           -- human readable ("daily 09:00 IST", or cron expr)
  cron_expr text NOT NULL,           -- normalized 5-field cron (UTC)
  active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz NOT NULL,
  run_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.broadcast_recurrences TO authenticated;
GRANT ALL ON public.broadcast_recurrences TO service_role;

ALTER TABLE public.broadcast_recurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view recurrences"
  ON public.broadcast_recurrences FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_broadcast_recurrences_updated_at
  BEFORE UPDATE ON public.broadcast_recurrences
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_broadcast_recurrences_next_run
  ON public.broadcast_recurrences (next_run_at) WHERE active;

ALTER TABLE public.telegram_chats
  ADD COLUMN IF NOT EXISTS bot_permissions jsonb,
  ADD COLUMN IF NOT EXISTS bot_permissions_checked_at timestamptz;

ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS recurrence_id uuid REFERENCES public.broadcast_recurrences(id) ON DELETE SET NULL;

ALTER TABLE public.broadcast_drafts
  ADD COLUMN IF NOT EXISTS split_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS split_source_chat_id bigint,
  ADD COLUMN IF NOT EXISTS split_source_message_id bigint,
  ADD COLUMN IF NOT EXISTS split_source_message_ids bigint[],
  ADD COLUMN IF NOT EXISTS split_preview_text text,
  ADD COLUMN IF NOT EXISTS split_media_group_id text;

ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS split_group_id uuid,
  ADD COLUMN IF NOT EXISTS split_variant text;
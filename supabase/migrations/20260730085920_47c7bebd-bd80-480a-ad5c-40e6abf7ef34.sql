ALTER TABLE public.telegram_chats ADD COLUMN IF NOT EXISTS invite_link text;
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS source_message_ids bigint[];
ALTER TABLE public.broadcast_drafts ADD COLUMN IF NOT EXISTS source_message_ids bigint[];
ALTER TABLE public.broadcast_drafts ADD COLUMN IF NOT EXISTS media_group_id text;
ALTER TABLE public.broadcast_targets ADD COLUMN IF NOT EXISTS sent_message_ids bigint[];
ALTER TABLE public.broadcast_recurrences ADD COLUMN IF NOT EXISTS source_message_ids bigint[];
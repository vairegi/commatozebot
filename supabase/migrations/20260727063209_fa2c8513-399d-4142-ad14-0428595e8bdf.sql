ALTER TABLE public.chat_lists DROP CONSTRAINT IF EXISTS chat_lists_category_check;
ALTER TABLE public.chat_lists ADD CONSTRAINT chat_lists_category_check CHECK (category ~ '^[a-z0-9_]{1,30}$');
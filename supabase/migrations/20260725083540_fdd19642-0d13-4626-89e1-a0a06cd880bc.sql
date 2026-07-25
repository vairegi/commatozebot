
CREATE TABLE public.chat_lists (
  category text NOT NULL CHECK (category IN ('adult','manga')),
  chat_id bigint NOT NULL,
  added_by bigint,
  added_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category, chat_id)
);

GRANT SELECT ON public.chat_lists TO authenticated;
GRANT ALL ON public.chat_lists TO service_role;

ALTER TABLE public.chat_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view chat_lists"
  ON public.chat_lists FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX chat_lists_category_idx ON public.chat_lists (category);
CREATE INDEX chat_lists_chat_id_idx ON public.chat_lists (chat_id);

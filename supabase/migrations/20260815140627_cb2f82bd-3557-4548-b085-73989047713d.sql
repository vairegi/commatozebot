CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.tg_mirror_to_turso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  payload jsonb;
  rec jsonb;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    rec := to_jsonb(OLD);
  ELSE
    rec := to_jsonb(NEW);
  END IF;

  payload := jsonb_build_object(
    'action', 'row',
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'row', rec
  );

  PERFORM extensions.net.http_post(
    url := 'https://project--6624d5dd-02eb-479e-b7ba-1bcc49b65ddd.lovable.app/api/public/hooks/mirror',
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpyc2Z6ZGNia3Z4c3RpeGF6d2xkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNDg1MTAsImV4cCI6MjA5OTgyNDUxMH0.vS7ZAQBks7v9ubVq9LOcrUsGgYgZAC3jVfKXNVMvYww'
    ),
    timeout_milliseconds := 5000
  );

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never let mirroring break an app write.
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'profiles','user_roles','telegram_bot_admins','telegram_chats','telegram_members',
    'telegram_messages','moderation_actions','bot_admin_events','broadcasts',
    'broadcast_targets','broadcast_drafts','broadcast_templates','broadcast_recurrences',
    'broadcast_button_presets','chat_lists'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_mirror_turso ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_mirror_turso AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_mirror_to_turso()',
      t
    );
  END LOOP;
END $$;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Telegram chats (groups the bot is in)
CREATE TABLE public.telegram_chats (
  chat_id BIGINT PRIMARY KEY,
  title TEXT,
  type TEXT,
  username TEXT,
  member_count INT,
  welcome_enabled BOOLEAN NOT NULL DEFAULT true,
  welcome_message TEXT DEFAULT 'Welcome to the group, {name}! 👋',
  rules TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_chats TO authenticated;
GRANT ALL ON public.telegram_chats TO service_role;
ALTER TABLE public.telegram_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read chats" ON public.telegram_chats FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth update chats" ON public.telegram_chats FOR UPDATE TO authenticated USING (true);

-- Telegram members
CREATE TABLE public.telegram_members (
  chat_id BIGINT NOT NULL REFERENCES public.telegram_chats(chat_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  status TEXT NOT NULL DEFAULT 'member',
  is_bot BOOLEAN NOT NULL DEFAULT false,
  message_count INT NOT NULL DEFAULT 0,
  warn_count INT NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_members TO authenticated;
GRANT ALL ON public.telegram_members TO service_role;
ALTER TABLE public.telegram_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read members" ON public.telegram_members FOR SELECT TO authenticated USING (true);

-- Telegram messages log
CREATE TABLE public.telegram_messages (
  update_id BIGINT PRIMARY KEY,
  chat_id BIGINT,
  user_id BIGINT,
  message_id BIGINT,
  text TEXT,
  raw_update JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tg_messages_chat ON public.telegram_messages(chat_id, created_at DESC);
GRANT SELECT ON public.telegram_messages TO authenticated;
GRANT ALL ON public.telegram_messages TO service_role;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read messages" ON public.telegram_messages FOR SELECT TO authenticated USING (true);

-- Moderation actions
CREATE TABLE public.moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id BIGINT NOT NULL,
  target_user_id BIGINT NOT NULL,
  target_name TEXT,
  action TEXT NOT NULL, -- ban, unban, kick, warn, mute
  reason TEXT,
  actor UUID REFERENCES auth.users, -- dashboard user, if via web
  actor_telegram_id BIGINT, -- if via telegram command
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mod_chat ON public.moderation_actions(chat_id, created_at DESC);
GRANT SELECT, INSERT ON public.moderation_actions TO authenticated;
GRANT ALL ON public.moderation_actions TO service_role;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read mod" ON public.moderation_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert mod" ON public.moderation_actions FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor);

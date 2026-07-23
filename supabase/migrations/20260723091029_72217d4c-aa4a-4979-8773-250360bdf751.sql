
-- telegram_members: admin-only read
DROP POLICY IF EXISTS "auth read members" ON public.telegram_members;
CREATE POLICY "admins read members" ON public.telegram_members
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- telegram_messages: admin-only read
DROP POLICY IF EXISTS "auth read messages" ON public.telegram_messages;
CREATE POLICY "admins read messages" ON public.telegram_messages
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- moderation_actions: admin-only read + insert
DROP POLICY IF EXISTS "auth read mod" ON public.moderation_actions;
DROP POLICY IF EXISTS "auth insert mod" ON public.moderation_actions;
CREATE POLICY "admins read mod" ON public.moderation_actions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins insert mod" ON public.moderation_actions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = actor);

-- telegram_chats: admin-only read + update
DROP POLICY IF EXISTS "auth read chats" ON public.telegram_chats;
DROP POLICY IF EXISTS "auth update chats" ON public.telegram_chats;
CREATE POLICY "admins read chats" ON public.telegram_chats
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update chats" ON public.telegram_chats
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Lock down SECURITY DEFINER functions from direct RPC by unauthenticated users
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

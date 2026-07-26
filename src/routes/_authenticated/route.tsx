import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Bot, LayoutDashboard, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Shell,
});

function Shell() {
  const router = useRouter();
  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  }
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold">
            <Bot className="h-5 w-5" />
            TeleManage
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/dashboard" className="flex items-center gap-1 hover:text-primary">
              <LayoutDashboard className="h-4 w-4" /> Chats
            </Link>
            <Link to="/bot-events" className="flex items-center gap-1 hover:text-primary">
              <AlertTriangle className="h-4 w-4" /> Admin events
            </Link>
            <button onClick={signOut} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
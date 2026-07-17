import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Shield, Users, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TeleManage — Telegram Group Management Bot" },
      {
        name: "description",
        content:
          "Manage your Telegram groups: welcome new members, moderate, and track activity from one dashboard.",
      },
      { property: "og:title", content: "TeleManage — Telegram Group Management" },
      {
        property: "og:description",
        content: "Welcome, moderate, and track your Telegram groups from a single dashboard.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-semibold">
            <Bot className="h-5 w-5" />
            TeleManage
          </div>
          <Link
            to="/auth"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-20">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Manage your Telegram groups with a bot
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Welcome new members automatically, moderate from the web, and see everything happening in
          your groups — all in one dashboard.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            to="/auth"
            className="rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Get started
          </Link>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          <Feature icon={<Users className="h-5 w-5" />} title="Member tracking">
            Auto-track joins, leaves, and message activity across every chat.
          </Feature>
          <Feature icon={<Shield className="h-5 w-5" />} title="Moderation">
            Ban, kick, or warn members from the dashboard. Every action logged.
          </Feature>
          <Feature icon={<MessageSquare className="h-5 w-5" />} title="Welcome messages">
            Custom welcome per group. Send announcements from the web.
          </Feature>
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-5">
      <div className="flex items-center gap-2 font-medium">
        {icon}
        {title}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

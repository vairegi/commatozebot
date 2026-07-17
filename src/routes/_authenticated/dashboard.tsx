import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listChats } from "@/lib/telegram.functions";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — TeleManage" }] }),
  component: Dashboard,
});

function Dashboard() {
  const fetchChats = useServerFn(listChats);
  const { data, isLoading, error } = useQuery({
    queryKey: ["chats"],
    queryFn: () => fetchChats(),
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your Telegram groups</h1>
          <p className="text-sm text-muted-foreground">
            Add the bot to a group to see it here. It will start tracking members and messages automatically.
          </p>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {error && <p className="text-destructive">{(error as Error).message}</p>}

      {data && data.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-2 font-medium">No groups yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your bot to a Telegram group as an admin. Once it receives its first update, the group will appear here.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {data?.map((c: any) => (
          <Link
            key={c.chat_id}
            to="/chats/$chatId"
            params={{ chatId: String(c.chat_id) }}
            className="rounded-lg border p-4 hover:border-primary"
          >
            <div className="flex items-center justify-between">
              <div className="font-medium">{c.title ?? `Chat ${c.chat_id}`}</div>
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{c.type}</span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Last activity {formatDistanceToNow(new Date(c.last_activity_at))} ago
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
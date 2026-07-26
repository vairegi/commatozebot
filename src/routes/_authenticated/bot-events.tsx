import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listBotAdminEvents } from "@/lib/telegram.functions";
import { formatDistanceToNow, format } from "date-fns";
import { AlertTriangle, ExternalLink, ShieldOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bot-events")({
  head: () => ({ meta: [{ title: "Admin events — TeleManage" }] }),
  component: BotEvents,
});

function statusBadgeClass(status: string | null) {
  switch (status) {
    case "kicked":
      return "bg-destructive/10 text-destructive";
    case "left":
      return "bg-orange-500/10 text-orange-600 dark:text-orange-400";
    case "restricted":
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function BotEvents() {
  const fetchEvents = useServerFn(listBotAdminEvents);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["bot-admin-events"],
    queryFn: () => fetchEvents(),
  });

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            Bot admin events
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every time the bot is demoted, removed, or kicked from a chat is logged here.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="rounded border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          disabled={isFetching}
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {error && <p className="text-destructive">{(error as Error).message}</p>}

      {data && data.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <ShieldOff className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-2 font-medium">No events yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The bot hasn't lost admin rights anywhere. Events will show up here as they happen.
          </p>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Chat</th>
                <th className="px-3 py-2 font-medium">Change</th>
                <th className="px-3 py-2 font-medium">By</th>
                <th className="px-3 py-2 font-medium">Open</th>
              </tr>
            </thead>
            <tbody>
              {data.map((e: any) => {
                const chatTitle = e.chat_title ?? `Chat ${e.chat_id}`;
                const when = e.created_at ? new Date(e.created_at) : null;
                return (
                  <tr key={e.id} className="border-t align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {when && (
                        <>
                          <div>{formatDistanceToNow(when, { addSuffix: true })}</div>
                          <div className="text-xs text-muted-foreground">
                            {format(when, "PPpp")}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{chatTitle}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.chat_username ? `@${e.chat_username} · ` : ""}
                        {e.chat_type ?? ""} · <span className="font-mono">{e.chat_id}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {e.old_status ?? "?"}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-xs ${statusBadgeClass(e.new_status)}`}
                        >
                          {e.new_status ?? "?"}
                        </span>
                      </div>
                      {e.reason && (
                        <div className="mt-1 text-xs text-muted-foreground">{e.reason}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div>{e.actor_name ?? "unknown"}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.actor_username ? `@${e.actor_username}` : ""}
                        {e.actor_id ? (e.actor_username ? " · " : "") + e.actor_id : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {e.deep_link ? (
                        <a
                          href={e.deep_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
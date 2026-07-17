import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getChat,
  listMembers,
  listRecentMessages,
  listModeration,
  updateChatSettings,
  sendChatMessage,
  moderateMember,
} from "@/lib/telegram.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, Ban, UserX, AlertTriangle, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/chats/$chatId")({
  component: ChatPage,
});

function ChatPage() {
  const { chatId } = Route.useParams();
  const chatIdNum = Number(chatId);
  const qc = useQueryClient();

  const fetchChat = useServerFn(getChat);
  const fetchMembers = useServerFn(listMembers);
  const fetchMessages = useServerFn(listRecentMessages);
  const fetchMod = useServerFn(listModeration);
  const updateFn = useServerFn(updateChatSettings);
  const sendFn = useServerFn(sendChatMessage);
  const moderateFn = useServerFn(moderateMember);

  const chatQ = useQuery({ queryKey: ["chat", chatIdNum], queryFn: () => fetchChat({ data: { chatId: chatIdNum } }) });
  const membersQ = useQuery({ queryKey: ["members", chatIdNum], queryFn: () => fetchMembers({ data: { chatId: chatIdNum } }) });
  const msgsQ = useQuery({ queryKey: ["msgs", chatIdNum], queryFn: () => fetchMessages({ data: { chatId: chatIdNum } }) });
  const modQ = useQuery({ queryKey: ["mod", chatIdNum], queryFn: () => fetchMod({ data: { chatId: chatIdNum } }) });

  const updateM = useMutation({
    mutationFn: (patch: { chatId: number; welcome_enabled?: boolean; welcome_message?: string; rules?: string }) =>
      updateFn({ data: patch }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["chat", chatIdNum] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendM = useMutation({
    mutationFn: (text: string) => sendFn({ data: { chatId: chatIdNum, text } }),
    onSuccess: () => toast.success("Message sent"),
    onError: (e: Error) => toast.error(e.message),
  });

  const modM = useMutation({
    mutationFn: (v: { userId: number; action: "ban" | "unban" | "kick" | "warn"; reason?: string }) =>
      moderateFn({ data: { chatId: chatIdNum, ...v } }),
    onSuccess: (_r, v) => {
      toast.success(`${v.action} applied`);
      qc.invalidateQueries({ queryKey: ["members", chatIdNum] });
      qc.invalidateQueries({ queryKey: ["mod", chatIdNum] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const chat = chatQ.data;
  const [welcomeEnabled, setWelcomeEnabled] = useState(true);
  const [welcomeMsg, setWelcomeMsg] = useState("");
  const [rules, setRules] = useState("");
  const [broadcast, setBroadcast] = useState("");

  useEffect(() => {
    if (chat) {
      setWelcomeEnabled(chat.welcome_enabled);
      setWelcomeMsg(chat.welcome_message ?? "");
      setRules(chat.rules ?? "");
    }
  }, [chat]);

  if (chatQ.isLoading) return <p>Loading…</p>;
  if (!chat) return <p>Chat not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All chats
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{chat.title ?? `Chat ${chat.chat_id}`}</h1>
        <p className="text-sm text-muted-foreground">
          {chat.type} · ID <code>{chat.chat_id}</code>
        </p>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="messages">Recent messages</TabsTrigger>
          <TabsTrigger value="moderation">Moderation log</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="broadcast">Send message</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Warns</th>
                  <th className="px-3 py-2">Last seen</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {membersQ.data?.map((m: any) => (
                  <tr key={m.user_id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      {m.first_name || m.username || `User ${m.user_id}`}
                      {m.username && <span className="ml-1 text-xs text-muted-foreground">@{m.username}</span>}
                    </td>
                    <td className="px-3 py-2 capitalize">{m.status}</td>
                    <td className="px-3 py-2">{m.warn_count}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDistanceToNow(new Date(m.last_seen_at))} ago
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => modM.mutate({ userId: Number(m.user_id), action: "warn" })}>
                          <AlertTriangle className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => modM.mutate({ userId: Number(m.user_id), action: "kick" })}>
                          <UserX className="h-4 w-4" />
                        </Button>
                        {m.status === "banned" ? (
                          <Button size="sm" variant="ghost" onClick={() => modM.mutate({ userId: Number(m.user_id), action: "unban" })}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => modM.mutate({ userId: Number(m.user_id), action: "ban" })}>
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {membersQ.data?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      No members observed yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="messages" className="mt-4 space-y-2">
          {msgsQ.data?.map((m: any) => (
            <div key={String(m.update_id)} className="rounded border p-3 text-sm">
              <div className="text-xs text-muted-foreground">
                {m.user_id} · {formatDistanceToNow(new Date(m.created_at))} ago
              </div>
              <div className="mt-1 whitespace-pre-wrap">{m.text ?? <em className="text-muted-foreground">(non-text)</em>}</div>
            </div>
          ))}
          {msgsQ.data?.length === 0 && <p className="text-muted-foreground">No messages yet.</p>}
        </TabsContent>

        <TabsContent value="moderation" className="mt-4">
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {modQ.data?.map((a: any) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{formatDistanceToNow(new Date(a.created_at))} ago</td>
                    <td className="px-3 py-2 capitalize">{a.action}</td>
                    <td className="px-3 py-2">{String(a.target_user_id)}</td>
                    <td className="px-3 py-2">{a.reason ?? "—"}</td>
                  </tr>
                ))}
                {modQ.data?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      No moderation actions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4 max-w-lg space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <div className="font-medium">Welcome new members</div>
              <div className="text-sm text-muted-foreground">Auto-send when someone joins.</div>
            </div>
            <Switch checked={welcomeEnabled} onCheckedChange={setWelcomeEnabled} />
          </div>
          <div>
            <Label htmlFor="wmsg">Welcome message</Label>
            <Textarea
              id="wmsg"
              rows={3}
              value={welcomeMsg}
              onChange={(e) => setWelcomeMsg(e.target.value)}
              placeholder="Welcome, {name}! 👋"
            />
            <p className="mt-1 text-xs text-muted-foreground">Use {"{name}"} for the member's name.</p>
          </div>
          <div>
            <Label htmlFor="rules">Group rules (shown via /rules)</Label>
            <Textarea id="rules" rows={5} value={rules} onChange={(e) => setRules(e.target.value)} />
          </div>
          <Button
            onClick={() =>
              updateM.mutate({
                chatId: chatIdNum,
                welcome_enabled: welcomeEnabled,
                welcome_message: welcomeMsg,
                rules,
              })
            }
            disabled={updateM.isPending}
          >
            Save settings
          </Button>
        </TabsContent>

        <TabsContent value="broadcast" className="mt-4 max-w-lg space-y-3">
          <Label htmlFor="broadcast">Send a message to this chat</Label>
          <Textarea
            id="broadcast"
            rows={4}
            value={broadcast}
            onChange={(e) => setBroadcast(e.target.value)}
            placeholder="Type a message the bot will post…"
          />
          <Button
            onClick={() => {
              if (!broadcast.trim()) return;
              sendM.mutate(broadcast, { onSuccess: () => setBroadcast("") });
            }}
            disabled={sendM.isPending}
          >
            Send
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
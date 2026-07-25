import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

async function isBotAdmin(supabaseAdmin: any, fromId: number): Promise<{ role: string | null; is: boolean }> {
  const { data } = await supabaseAdmin
    .from("telegram_bot_admins")
    .select("role")
    .eq("user_id", fromId)
    .maybeSingle();
  return { role: data?.role ?? null, is: !!data };
}

async function handleWhoAmI(args: {
  fromId: number;
  fromName: string;
  replyChatId: number;
  telegramCall: (m: string, b?: Record<string, unknown>) => Promise<any>;
  supabaseAdmin: any;
}) {
  const { fromId, fromName, replyChatId, telegramCall, supabaseAdmin } = args;
  const { role, is } = await isBotAdmin(supabaseAdmin, fromId);
  let badge: string;
  if (!is) badge = "👤 regular user (no bot access)";
  else if (role === "super_admin") badge = "👑 super admin (owner)";
  else badge = "🛡 admin";
  await telegramCall("sendMessage", {
    chat_id: replyChatId,
    text: `<b>${escapeHtml(fromName)}</b>\nID: <code>${fromId}</code>\nRole: ${badge}`,
    parse_mode: "HTML",
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function handleStats(args: {
  fromId: number;
  replyChatId: number;
  telegramCall: (m: string, b?: Record<string, unknown>) => Promise<any>;
  supabaseAdmin: any;
}) {
  const { fromId, replyChatId, telegramCall, supabaseAdmin } = args;
  const { is } = await isBotAdmin(supabaseAdmin, fromId);
  if (!is) {
    await telegramCall("sendMessage", { chat_id: replyChatId, text: "❌ Only bot admins can use /stats." });
    return;
  }
  const since24 = new Date(Date.now() - 86400_000).toISOString();
  const [chats, members, msgs24, msgsAll, bcTotal, bcPending] = await Promise.all([
    supabaseAdmin.from("telegram_chats").select("type", { count: "exact" }),
    supabaseAdmin.from("telegram_members").select("user_id", { count: "exact", head: true }),
    supabaseAdmin.from("telegram_messages").select("update_id", { count: "exact", head: true }).gte("created_at", since24),
    supabaseAdmin.from("telegram_messages").select("update_id", { count: "exact", head: true }),
    supabaseAdmin.from("broadcasts").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("broadcasts").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const buckets = { channel: 0, supergroup: 0, group: 0, private: 0 } as Record<string, number>;
  for (const c of (chats.data as any[]) ?? []) buckets[c.type ?? "other"] = (buckets[c.type ?? "other"] ?? 0) + 1;
  const lines = [
    "📊 <b>Bot stats</b>",
    "",
    `📢 Channels: <b>${buckets.channel ?? 0}</b>`,
    `👥 Supergroups: <b>${buckets.supergroup ?? 0}</b>`,
    `👥 Groups: <b>${buckets.group ?? 0}</b>`,
    `👤 Members tracked: <b>${members.count ?? 0}</b>`,
    "",
    `💬 Messages seen (24h): <b>${msgs24.count ?? 0}</b>`,
    `💬 Messages seen (all): <b>${msgsAll.count ?? 0}</b>`,
    "",
    `📣 Broadcasts total: <b>${bcTotal.count ?? 0}</b>`,
    `⏰ Broadcasts pending: <b>${bcPending.count ?? 0}</b>`,
  ];
  await telegramCall("sendMessage", { chat_id: replyChatId, text: lines.join("\n"), parse_mode: "HTML" });
}

async function handleInvite(args: {
  fromId: number;
  argText: string;
  replyChatId: number;
  currentChat: { id: number; type: string; username?: string };
  telegramCall: (m: string, b?: Record<string, unknown>) => Promise<any>;
  supabaseAdmin: any;
}) {
  const { fromId, argText, replyChatId, currentChat, telegramCall, supabaseAdmin } = args;
  const { is } = await isBotAdmin(supabaseAdmin, fromId);
  if (!is) {
    await telegramCall("sendMessage", { chat_id: replyChatId, text: "❌ Only bot admins can use /invite." });
    return;
  }
  const parts = argText.trim().split(/\s+/);
  const rawArg = parts[1];
  let targetId: number | null = null;
  if (rawArg) {
    const n = Number(rawArg);
    if (!Number.isFinite(n)) {
      await telegramCall("sendMessage", { chat_id: replyChatId, text: "Usage: /invite <chat_id>" });
      return;
    }
    targetId = n;
  } else if (currentChat.type !== "private") {
    targetId = currentChat.id;
  } else {
    await telegramCall("sendMessage", { chat_id: replyChatId, text: "Usage: /invite <chat_id>\nRun /channels to see chat IDs." });
    return;
  }
  try {
    const info = await telegramCall("getChat", { chat_id: targetId });
    let link: string | undefined = info?.invite_link;
    let username: string | undefined = info?.username;
    if (!link && username) link = `https://t.me/${username}`;
    if (!link) {
      try {
        const created = await telegramCall("exportChatInviteLink", { chat_id: targetId });
        if (typeof created === "string") link = created;
      } catch (e) {
        console.warn("exportChatInviteLink failed", targetId, e);
      }
    }
    if (!link) {
      await telegramCall("sendMessage", { chat_id: replyChatId, text: "🔒 No invite permission for that chat. Give me 'Invite users' admin right." });
      return;
    }
    const title = info?.title ?? info?.username ?? String(targetId);
    await telegramCall("sendMessage", {
      chat_id: replyChatId,
      text: `🔗 <b>${escapeHtml(title)}</b>\n${link}`,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (e: any) {
    await telegramCall("sendMessage", { chat_id: replyChatId, text: `❌ Failed: ${e?.message ?? "unknown"}` });
  }
}

function previewOfMessage(m: any): string {
  if (m.text) return m.text.slice(0, 120);
  if (m.caption) return `[media] ${m.caption.slice(0, 100)}`;
  if (m.photo) return "[photo]";
  if (m.video) return "[video]";
  if (m.document) return `[document] ${m.document.file_name ?? ""}`;
  if (m.animation) return "[gif]";
  if (m.audio) return "[audio]";
  if (m.voice) return "[voice]";
  if (m.sticker) return `[sticker] ${m.sticker.emoji ?? ""}`;
  return "[message]";
}

async function handleTemplateCommands(args: {
  cmd: string;
  fromId: number;
  fromName: string;
  argText: string;
  replyChatId: number;
  chatType: string;
  message: any;
  telegramCall: (m: string, b?: Record<string, unknown>) => Promise<any>;
  supabaseAdmin: any;
}) {
  const { cmd, fromId, fromName, argText, replyChatId, chatType, message, telegramCall, supabaseAdmin } = args;
  const { is } = await isBotAdmin(supabaseAdmin, fromId);
  if (!is) {
    await telegramCall("sendMessage", { chat_id: replyChatId, text: "❌ Only bot admins can use templates." });
    return;
  }
  if (chatType !== "private") {
    await telegramCall("sendMessage", { chat_id: replyChatId, text: `🔒 Use ${cmd} in a private chat with me.` });
    return;
  }
  const parts = argText.trim().split(/\s+/);
  const name = parts[1];

  if (cmd === "/templates") {
    const { data: rows } = await supabaseAdmin
      .from("broadcast_templates")
      .select("name, preview_text, mode, created_at")
      .eq("user_id", fromId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!rows?.length) {
      await telegramCall("sendMessage", { chat_id: replyChatId, text: "No templates yet. Reply to a message with /savetpl <name>." });
      return;
    }
    const lines = ["📚 <b>Your templates</b>", ""];
    for (const r of rows as any[]) {
      const badge = r.mode === "forward" ? "🔁" : "📝";
      lines.push(`${badge} <b>${escapeHtml(r.name)}</b> — <i>${escapeHtml((r.preview_text ?? "").slice(0, 60))}</i>`);
    }
    lines.push("", "Use /posttpl <name> to send.");
    await telegramCall("sendMessage", { chat_id: replyChatId, text: lines.join("\n"), parse_mode: "HTML" });
    return;
  }

  if (cmd === "/savetpl") {
    if (!name) {
      await telegramCall("sendMessage", { chat_id: replyChatId, text: "Usage: reply to a message with /savetpl <name>" });
      return;
    }
    const src = message.reply_to_message;
    if (!src?.message_id) {
      await telegramCall("sendMessage", { chat_id: replyChatId, text: "❌ Reply to the message you want to save as this template." });
      return;
    }
    const { error } = await supabaseAdmin.from("broadcast_templates").upsert(
      {
        user_id: fromId,
        name,
        source_chat_id: src.chat?.id ?? replyChatId,
        source_message_id: src.message_id,
        preview_text: previewOfMessage(src),
        mode: "copy",
      },
      { onConflict: "user_id,name" },
    );
    if (error) {
      await telegramCall("sendMessage", { chat_id: replyChatId, text: `❌ Save failed: ${error.message}` });
      return;
    }
    await telegramCall("sendMessage", { chat_id: replyChatId, text: `✅ Saved template <b>${escapeHtml(name)}</b>. Send with /posttpl ${escapeHtml(name)}.`, parse_mode: "HTML" });
    return;
  }

  if (cmd === "/deltpl") {
    if (!name) {
      await telegramCall("sendMessage", { chat_id: replyChatId, text: "Usage: /deltpl <name>" });
      return;
    }
    const { error, count } = await supabaseAdmin
      .from("broadcast_templates")
      .delete({ count: "exact" })
      .eq("user_id", fromId)
      .eq("name", name);
    if (error) {
      await telegramCall("sendMessage", { chat_id: replyChatId, text: `❌ Delete failed: ${error.message}` });
      return;
    }
    await telegramCall("sendMessage", { chat_id: replyChatId, text: count ? `🗑 Deleted template ${name}.` : `ℹ️ No template named ${name}.` });
    return;
  }

  if (cmd === "/posttpl") {
    if (!name) {
      await telegramCall("sendMessage", { chat_id: replyChatId, text: "Usage: /posttpl <name>" });
      return;
    }
    const { data: tpl } = await supabaseAdmin
      .from("broadcast_templates")
      .select("*")
      .eq("user_id", fromId)
      .eq("name", name)
      .maybeSingle();
    if (!tpl) {
      await telegramCall("sendMessage", { chat_id: replyChatId, text: `❌ No template named ${name}.` });
      return;
    }
    const t = tpl as any;
    const { startBroadcastFromTemplate } = await import("@/lib/broadcast-wizard.server");
    await telegramCall("sendMessage", {
      chat_id: replyChatId,
      text: `📚 Loading template <b>${escapeHtml(name)}</b>…`,
      parse_mode: "HTML",
    });
    await startBroadcastFromTemplate({
      fromId,
      chatId: replyChatId,
      template: {
        source_chat_id: t.source_chat_id,
        source_message_id: t.source_message_id,
        preview_text: t.preview_text,
        mode: t.mode,
      },
    });
    return;
  }
}

async function handleReactToggle(args: {
  fromId: number;
  argText: string;
  chat: { id: number; type: string };
  telegramCall: (m: string, b?: Record<string, unknown>) => Promise<any>;
  supabaseAdmin: any;
}) {
  const { fromId, argText, chat, telegramCall, supabaseAdmin } = args;
  const { is } = await isBotAdmin(supabaseAdmin, fromId);
  if (!is) {
    await telegramCall("sendMessage", { chat_id: chat.id, text: "❌ Only bot admins can use /react." });
    return;
  }
  if (chat.type !== "private") {
    await telegramCall("sendMessage", { chat_id: chat.id, text: "❌ /react only works in a private chat with me (DM)." });
    return;
  }
  const arg = (argText.trim().split(/\s+/)[1] ?? "").toLowerCase();
  if (arg !== "on" && arg !== "off") {
    const { data: cur } = await supabaseAdmin.from("telegram_chats").select("reactions_enabled").eq("chat_id", chat.id).maybeSingle();
    await telegramCall("sendMessage", { chat_id: chat.id, text: `😀 Auto-react in this DM is currently <b>${cur?.reactions_enabled ? "ON" : "OFF"}</b>.\nUse /react on or /react off.`, parse_mode: "HTML" });
    return;
  }
  const enabled = arg === "on";
  await supabaseAdmin
    .from("telegram_chats")
    .upsert(
      { chat_id: chat.id, type: chat.type, reactions_enabled: enabled },
      { onConflict: "chat_id" },
    );
  await telegramCall("sendMessage", { chat_id: chat.id, text: enabled ? "😀 Auto-reactions enabled — I'll react to every message you send me here." : "🚫 Auto-reactions disabled." });
}

async function handleComment(args: {
  fromId: number;
  argText: string;
  replyChatId: number;
  telegramCall: (m: string, b?: Record<string, unknown>) => Promise<any>;
  supabaseAdmin: any;
}) {
  const { fromId, argText, replyChatId, telegramCall, supabaseAdmin } = args;
  const { is } = await isBotAdmin(supabaseAdmin, fromId);
  if (!is) {
    await telegramCall("sendMessage", { chat_id: replyChatId, text: "❌ Only bot admins can use /comment." });
    return;
  }
  const parts = argText.trim().split(/\s+/);
  const channelId = Number(parts[1]);
  const messageId = Number(parts[2]);
  const text = parts.slice(3).join(" ");
  if (!Number.isFinite(channelId) || !Number.isFinite(messageId) || !text) {
    await telegramCall("sendMessage", { chat_id: replyChatId, text: "Usage: /comment <channel_id> <message_id> <text>" });
    return;
  }
  try {
    const info = await telegramCall("getChat", { chat_id: channelId });
    const linked = info?.linked_chat_id;
    if (!linked) {
      await telegramCall("sendMessage", { chat_id: replyChatId, text: "❌ That channel has no linked discussion group — comments aren't possible." });
      return;
    }
    const res = await telegramCall("sendMessage", {
      chat_id: linked,
      text,
      reply_parameters: { chat_id: channelId, message_id: messageId },
    });
    const mid = res?.message_id;
    await telegramCall("sendMessage", {
      chat_id: replyChatId,
      text: `💬 Comment posted${mid ? ` (msg ${mid} in linked group ${linked})` : ""}.`,
    });
  } catch (e: any) {
    await telegramCall("sendMessage", { chat_id: replyChatId, text: `❌ Comment failed: ${e?.message ?? "unknown"}` });
  }
}

function formatName(u: { first_name?: string; last_name?: string; username?: string } | null | undefined): string {
  if (!u) return "there";
  return u.first_name || u.username || "there";
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { deriveWebhookSecret, telegramCall, getBotIdentity, getChatMemberStatus, setMessageReaction, REACTION_EMOJIS } =
          await import("@/lib/telegram.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { handleBroadcastCommand, handleBroadcastMessage, handleBroadcastCallback } =
          await import("@/lib/broadcast-wizard.server");

        const expected = deriveWebhookSecret();
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = await request.json();
        if (typeof update.update_id !== "number") {
          return Response.json({ ok: true, ignored: true });
        }

        // Callback queries (inline button taps) — route broadcast wizard first.
        if (update.callback_query) {
          try {
            await handleBroadcastCallback(update.callback_query);
          } catch (e) {
            console.error("callback_query failed", e);
          }
          return Response.json({ ok: true });
        }

        // my_chat_member: bot's own membership changed in a chat
        const myMember = update.my_chat_member;
        if (myMember?.chat?.id) {
          const c = myMember.chat;
          const newStatus: string | undefined = myMember.new_chat_member?.status;
          const isAdmin = newStatus === "administrator" || newStatus === "creator";
          await supabaseAdmin.from("telegram_chats").upsert(
            {
              chat_id: c.id,
              title: c.title ?? c.username ?? `Chat ${c.id}`,
              type: c.type,
              username: c.username ?? null,
              last_activity_at: new Date().toISOString(),
            },
            { onConflict: "chat_id" },
          );
          // Store bot status via a follow-up update (columns may be added later; ignore if missing)
          try {
            await supabaseAdmin
              .from("telegram_chats")
              .update({
                bot_status: newStatus ?? null,
                bot_is_admin: isAdmin,
                bot_status_checked_at: new Date().toISOString(),
              } as any)
              .eq("chat_id", c.id);
          } catch (e) {
            console.warn("bot_status columns not yet migrated", e);
          }
          return Response.json({ ok: true });
        }

        const message = update.message ?? update.edited_message;
        const newMembers = message?.new_chat_members as Array<any> | undefined;
        const leftMember = message?.left_chat_member;
        const chat = message?.chat;

        // Log the raw update (idempotent by update_id)
        if (message && chat?.id) {
          await supabaseAdmin.from("telegram_messages").upsert(
            {
              update_id: update.update_id,
              chat_id: chat.id,
              user_id: message.from?.id ?? null,
              message_id: message.message_id ?? null,
              text: message.text ?? null,
              raw_update: update,
            },
            { onConflict: "update_id" },
          );

          // Upsert chat metadata
          await supabaseAdmin.from("telegram_chats").upsert(
            {
              chat_id: chat.id,
              title: chat.title ?? chat.username ?? `Chat ${chat.id}`,
              type: chat.type,
              username: chat.username ?? null,
              last_activity_at: new Date().toISOString(),
            },
            { onConflict: "chat_id" },
          );
        }

        // Handle new members: welcome them
        if (newMembers?.length && chat?.id) {
          const { data: chatRow } = await supabaseAdmin
            .from("telegram_chats")
            .select("welcome_enabled, welcome_message")
            .eq("chat_id", chat.id)
            .maybeSingle();

          for (const m of newMembers) {
            await supabaseAdmin.from("telegram_members").upsert(
              {
                chat_id: chat.id,
                user_id: m.id,
                username: m.username ?? null,
                first_name: m.first_name ?? null,
                last_name: m.last_name ?? null,
                is_bot: !!m.is_bot,
                status: "member",
                joined_at: new Date().toISOString(),
                last_seen_at: new Date().toISOString(),
              },
              { onConflict: "chat_id,user_id" },
            );

            if (!m.is_bot && chatRow?.welcome_enabled !== false) {
              const template = chatRow?.welcome_message || "Welcome, {name}! 👋";
              const text = template.replace(/\{name\}/g, formatName(m));
              try {
                await telegramCall("sendMessage", { chat_id: chat.id, text });
              } catch (e) {
                console.error("welcome send failed", e);
              }
            }
          }
        }

        // Left member
        if (leftMember && chat?.id) {
          await supabaseAdmin
            .from("telegram_members")
            .update({ status: "left", last_seen_at: new Date().toISOString() })
            .eq("chat_id", chat.id)
            .eq("user_id", leftMember.id);
        }

        // Regular messages: track sender + handle commands
        if (message && !newMembers && !leftMember && message.from && chat?.id) {
          const from = message.from;
          await supabaseAdmin.from("telegram_members").upsert(
            {
              chat_id: chat.id,
              user_id: from.id,
              username: from.username ?? null,
              first_name: from.first_name ?? null,
              last_name: from.last_name ?? null,
              is_bot: !!from.is_bot,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: "chat_id,user_id" },
          );
          // Keep bot admin names fresh whenever they interact.
          try {
            await supabaseAdmin
              .from("telegram_bot_admins")
              .update({
                first_name: from.first_name ?? null,
                username: from.username ?? null,
              })
              .eq("user_id", from.id);
          } catch (e) {
            console.warn("bot_admins name refresh failed", e);
          }
          const text: string = message.text ?? "";
          const cmd = text.trim().split(/\s+/)[0]?.split("@")[0]?.toLowerCase();

          try {
            // Broadcast wizard: consume forwarded/media messages or custom-input replies first.
            const consumed = await handleBroadcastMessage({
              fromId: from.id,
              fromName: from.first_name || from.username || `user ${from.id}`,
              chatId: chat.id,
              chatType: chat.type,
              message,
            });
            if (consumed) return Response.json({ ok: true });

            // Broadcast commands
            if (cmd === "/post" || cmd === "/crosspost" || cmd === "/broadcasts" || cmd === "/cancel") {
              const handled = await handleBroadcastCommand({
                cmd,
                fromId: from.id,
                fromName: from.first_name || from.username || `user ${from.id}`,
                chatId: chat.id,
                chatType: chat.type,
              });
              if (handled) return Response.json({ ok: true });
            }

            if (cmd === "/start" || cmd === "/help") {
              await telegramCall("sendMessage", {
                chat_id: chat.id,
                text:
                  "🤖 Group Management Bot\n\nCommands:\n" +
                  "/rules — show group rules\n" +
                  "/ping — check I'm alive\n" +
                  "/id — show your Telegram ID\n\n" +
                  "/whoami — show your bot role\n\n" +
                  "In private chat:\n" +
                  "/channels — list groups & channels where I am admin\n\n" +
                  "/leave [chat_id] — make me leave a chat (admins only)\n\n" +
                  "/invite <chat_id> — get an invite link for a chat (bot admins)\n\n" +
                  "/stats — global bot stats (bot admins)\n\n" +
                  "📣 Broadcast (bot admins, DM only):\n" +
                  "/post — start a broadcast wizard (send/forward the post → pick channels → timing → auto-delete)\n" +
                  "/crosspost — same wizard but forwards with the 'forwarded from' header\n" +
                  "/broadcasts — recent broadcasts, cancel pending, cancel auto-delete\n" +
                  "/cancel — abort current wizard\n\n" +
                  "📚 Templates (bot admins, DM):\n" +
                  "/savetpl <name> — reply to a message to save it as a template\n" +
                  "/templates — list saved templates\n" +
                  "/deltpl <name> — delete a template\n" +
                  "/posttpl <name> — start a broadcast from a saved template\n\n" +
                  "😀 Reactions (DM only, bot admins):\n" +
                  "/react on|off — auto-react to every message you send me in DM with a random emoji\n\n" +
                  "💬 Channel comments (bot admins):\n" +
                  "/comment <channel_id> <message_id> <text> — post a comment under a channel post via its linked discussion group\n\n" +
                  "Bot admins (people allowed to use this bot):\n" +
                  "/addadmin <user_id> [super] — grant bot access (super = super admin, super admins only)\n" +
                  "/radmin <user_id> — revoke bot access (super admins only for other super admins)\n" +
                  "/listadmins — list bot admins\n" +
                  "(First caller becomes the owner 👑 automatically.)\n\n" +
                  "📚 Channel lists (bot admins, DM):\n" +
                  "/adultchannels — list channels in the Adult list\n" +
                  "/mangachannels — list channels in the Manga list\n" +
                  "/addtolist <adult|manga> <chat_id> [chat_id …] — add channels to a list\n" +
                  "/removefromlist <adult|manga> <chat_id> [chat_id …] — remove channels\n" +
                  "In /post you can pick All, Adult only, or Manga only.\n\n" +
                  "Admins can manage this group from the web dashboard.",
              });
            } else if (cmd === "/ping") {
              await telegramCall("sendMessage", { chat_id: chat.id, text: "pong 🏓" });
            } else if (cmd === "/id") {
              await telegramCall("sendMessage", {
                chat_id: chat.id,
                text: `Your Telegram user ID: <code>${from.id}</code>\nChat ID: <code>${chat.id}</code>`,
                parse_mode: "HTML",
              });
            } else if (cmd === "/whoami") {
              await handleWhoAmI({ fromId: from.id, fromName: from.first_name || from.username || `user ${from.id}`, replyChatId: chat.id, telegramCall, supabaseAdmin });
            } else if (cmd === "/stats") {
              await handleStats({ fromId: from.id, replyChatId: chat.id, telegramCall, supabaseAdmin });
            } else if (cmd === "/invite") {
              await handleInvite({ fromId: from.id, argText: text, replyChatId: chat.id, currentChat: chat, telegramCall, supabaseAdmin });
            } else if (cmd === "/savetpl" || cmd === "/templates" || cmd === "/deltpl" || cmd === "/posttpl") {
              await handleTemplateCommands({ cmd, fromId: from.id, fromName: from.first_name || from.username || `user ${from.id}`, argText: text, replyChatId: chat.id, chatType: chat.type, message, telegramCall, supabaseAdmin });
            } else if (cmd === "/react") {
              await handleReactToggle({ fromId: from.id, argText: text, chat, telegramCall, supabaseAdmin });
            } else if (cmd === "/comment") {
              await handleComment({ fromId: from.id, argText: text, replyChatId: chat.id, telegramCall, supabaseAdmin });
            } else if (cmd === "/rules") {
              const { data: c } = await supabaseAdmin
                .from("telegram_chats")
                .select("rules")
                .eq("chat_id", chat.id)
                .maybeSingle();
              await telegramCall("sendMessage", {
                chat_id: chat.id,
                text: c?.rules?.trim() ? `📜 Group Rules:\n\n${c.rules}` : "No rules have been set for this group yet.",
              });
            } else if (cmd === "/channels") {
              if (chat.type !== "private") {
                await telegramCall("sendMessage", {
                  chat_id: chat.id,
                  text: "🔒 Use /channels in a private chat with me for privacy.",
                });
              } else {
                await handleChannelsCommand({
                  dmChatId: chat.id,
                  supabaseAdmin,
                  telegramCall,
                  getBotIdentity,
                  getChatMemberStatus,
                });
              }
            } else if (cmd === "/leave") {
              await handleLeaveCommand({
                fromId: from.id,
                replyChatId: chat.id,
                currentChat: chat,
                argText: text,
                telegramCall,
                getChatMemberStatus,
                supabaseAdmin,
              });
            } else if (cmd === "/addadmin" || cmd === "/radmin" || cmd === "/listadmins") {
              await handleBotAdminCommands({
                cmd,
                fromId: from.id,
                fromName: from.first_name || from.username || `user ${from.id}`,
                argText: text,
                replyChatId: chat.id,
                telegramCall,
                supabaseAdmin,
              });
            } else if (
              cmd === "/adultchannels" ||
              cmd === "/adultchannel" ||
              cmd === "/mangachannels" ||
              cmd === "/mangachannel" ||
              cmd === "/addtolist" ||
              cmd === "/removefromlist" ||
              cmd === "/rmfromlist"
            ) {
              await handleChatListCommands({
                cmd,
                fromId: from.id,
                fromName: from.first_name || from.username || `user ${from.id}`,
                argText: text,
                replyChatId: chat.id,
                chatType: chat.type,
                telegramCall,
                supabaseAdmin,
              });
            }

            // Auto-react to every message (including commands) in private DMs when enabled.
            if (
              chat.type === "private" &&
              message.message_id &&
              !from.is_bot
            ) {
              try {
                const { data: chatRow } = await supabaseAdmin
                  .from("telegram_chats")
                  .select("reactions_enabled")
                  .eq("chat_id", chat.id)
                  .maybeSingle();
                if (chatRow?.reactions_enabled) {
                  const emoji = REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)];
                  await setMessageReaction(chat.id, message.message_id, emoji);
                }
              } catch (e) {
                console.warn("auto-react failed", e);
              }
            }
          } catch (e) {
            console.error("command failed", e);
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});

async function handleChannelsCommand(args: {
  dmChatId: number;
  supabaseAdmin: any;
  telegramCall: (m: string, b?: Record<string, unknown>) => Promise<any>;
  getBotIdentity: () => Promise<{ id: number; username?: string }>;
  getChatMemberStatus: (chatId: number, userId: number) => Promise<string | null>;
}) {
  const { dmChatId, supabaseAdmin, telegramCall, getBotIdentity, getChatMemberStatus } = args;

  await telegramCall("sendMessage", { chat_id: dmChatId, text: "🔍 Checking chats…" });

  const { data: chats } = await supabaseAdmin
    .from("telegram_chats")
    .select("chat_id, title, type, username, first_seen_at")
    .in("type", ["group", "supergroup", "channel"])
    .order("first_seen_at", { ascending: true })
    .limit(200);

  if (!chats?.length) {
    await telegramCall("sendMessage", {
      chat_id: dmChatId,
      text: "I'm not in any groups or channels yet.",
    });
    return;
  }

  const bot = await getBotIdentity();
  const buckets: Record<"channel" | "supergroup" | "group", string[]> = {
    channel: [],
    supergroup: [],
    group: [],
  };

  await Promise.all(
    chats.map(async (c: any) => {
      const botStatus = await getChatMemberStatus(c.chat_id, bot.id);
      const botAdmin = botStatus === "administrator" || botStatus === "creator";
      if (!botAdmin) return;

      const label = c.title || c.username || `Chat ${c.chat_id}`;
      let linkLine = "";
      if (c.username) {
        linkLine = ` — @${c.username}`;
      } else {
        // Private chat: try to get an invite link (bot needs can_invite_users)
        try {
          const info = await telegramCall("getChat", { chat_id: c.chat_id });
          let invite: string | undefined = info?.invite_link;
          if (!invite) {
            try {
              const created = await telegramCall("exportChatInviteLink", { chat_id: c.chat_id });
              if (typeof created === "string") invite = created;
            } catch (e) {
              console.warn("exportChatInviteLink failed", c.chat_id, e);
            }
          }
          if (invite) linkLine = ` — <a href="${invite}">invite link</a>`;
          else linkLine = " — 🔒 private (no invite permission)";
        } catch (e) {
          console.warn("getChat failed", c.chat_id, e);
        }
      }
      const bucket = (c.type as "channel" | "supergroup" | "group") ?? "group";
      buckets[bucket].push(`${label}${linkLine}\n<code>${c.chat_id}</code>`);
    }),
  );

  const numbered = (items: string[]) =>
    items.map((it, i) => `<b>${i + 1}.</b> ${it}`).join("\n\n");

  const sections: string[] = [];
  if (buckets.channel.length)
    sections.push(`📢 <b>Channels (${buckets.channel.length})</b>\n${numbered(buckets.channel)}`);
  if (buckets.supergroup.length)
    sections.push(`👥 <b>Supergroups (${buckets.supergroup.length})</b>\n${numbered(buckets.supergroup)}`);
  if (buckets.group.length)
    sections.push(`👥 <b>Groups (${buckets.group.length})</b>\n${numbered(buckets.group)}`);

  const text = sections.length
    ? sections.join("\n\n")
    : "No chats found where I am admin.";

  await telegramCall("sendMessage", {
    chat_id: dmChatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

async function handleLeaveCommand(args: {
  fromId: number;
  replyChatId: number;
  currentChat: { id: number; type: string };
  argText: string;
  telegramCall: (m: string, b?: Record<string, unknown>) => Promise<any>;
  getChatMemberStatus: (chatId: number, userId: number) => Promise<string | null>;
  supabaseAdmin: any;
}) {
  const { fromId, replyChatId, currentChat, argText, telegramCall, getChatMemberStatus, supabaseAdmin } = args;

  const parts = argText.trim().split(/\s+/);
  const rawArg = parts[1];

  let targetChatId: number | null = null;
  if (rawArg) {
    const parsed = Number(rawArg);
    if (!Number.isFinite(parsed)) {
      await telegramCall("sendMessage", {
        chat_id: replyChatId,
        text: "Usage: /leave <chat_id>\nExample: /leave -1001234567890",
      });
      return;
    }
    targetChatId = parsed;
  } else if (currentChat.type !== "private") {
    targetChatId = currentChat.id;
  } else {
    await telegramCall("sendMessage", {
      chat_id: replyChatId,
      text: "Usage: /leave <chat_id>\nRun /channels to see chat IDs, or use /leave inside the group/channel itself.",
    });
    return;
  }

  // Allow if caller is a global bot admin OR an admin/creator of the target chat
  const { data: botAdminRow } = await supabaseAdmin
    .from("telegram_bot_admins")
    .select("user_id")
    .eq("user_id", fromId)
    .maybeSingle();
  const isBotAdmin = !!botAdminRow;
  if (!isBotAdmin) {
    const userStatus = await getChatMemberStatus(targetChatId, fromId);
    if (userStatus !== "administrator" && userStatus !== "creator") {
      await telegramCall("sendMessage", {
        chat_id: replyChatId,
        text: "❌ You must be a bot admin or an admin of that chat to make me leave.",
      });
      return;
    }
  }

  try {
    await telegramCall("leaveChat", { chat_id: targetChatId });
    try {
      await supabaseAdmin
        .from("telegram_chats")
        .update({
          bot_status: "left",
          bot_is_admin: false,
          bot_status_checked_at: new Date().toISOString(),
        } as any)
        .eq("chat_id", targetChatId);
    } catch (e) {
      console.warn("failed to update bot_status after leave", e);
    }
    if (replyChatId !== targetChatId) {
      await telegramCall("sendMessage", {
        chat_id: replyChatId,
        text: `👋 Left chat <code>${targetChatId}</code>.`,
        parse_mode: "HTML",
      });
    }
  } catch (e: any) {
    await telegramCall("sendMessage", {
      chat_id: replyChatId,
      text: `❌ Failed to leave chat <code>${targetChatId}</code>: ${e?.message ?? "unknown error"}`,
      parse_mode: "HTML",
    });
  }
}
async function handleBotAdminCommands(args: {
  cmd: string;
  fromId: number;
  fromName: string;
  argText: string;
  replyChatId: number;
  telegramCall: (m: string, b?: Record<string, unknown>) => Promise<any>;
  supabaseAdmin: any;
}) {
  const { cmd, fromId, fromName, argText, replyChatId, telegramCall, supabaseAdmin } = args;

  const send = (text: string, extra: Record<string, unknown> = {}) =>
    telegramCall("sendMessage", { chat_id: replyChatId, text, ...extra });

  // Count existing global bot admins
  const { count } = await supabaseAdmin
    .from("telegram_bot_admins")
    .select("user_id", { count: "exact", head: true });
  const adminCount = count ?? 0;

  // Is the caller a global bot admin?
  const { data: callerRow } = await supabaseAdmin
    .from("telegram_bot_admins")
    .select("user_id")
    .eq("user_id", fromId)
    .maybeSingle();
  const callerIsBotAdmin = !!callerRow;

  // Bootstrap: if there are no bot admins yet, the first caller becomes the owner.
  if (adminCount === 0 && (cmd === "/addadmin" || cmd === "/listadmins")) {
    await supabaseAdmin.from("telegram_bot_admins").upsert(
      {
        user_id: fromId,
        username: null,
        first_name: fromName,
        added_by: fromId,
        added_by_name: fromName,
        role: "super_admin",
      },
      { onConflict: "user_id" },
    );
    await send(
      `👑 No bot admins existed yet, so you (<code>${fromId}</code>) are now the owner (super admin).`,
      { parse_mode: "HTML" },
    );
    // Fall through so /addadmin <id> in the same message still works
  } else if (!callerIsBotAdmin) {
    await send("❌ Only bot admins can use this command.");
    return;
  }

  // Fetch caller's role for permission checks below
  const { data: callerFull } = await supabaseAdmin
    .from("telegram_bot_admins")
    .select("role")
    .eq("user_id", fromId)
    .maybeSingle();
  const callerIsSuper = callerFull?.role === "super_admin";

  if (cmd === "/listadmins") {
    const { data: rows } = await supabaseAdmin
      .from("telegram_bot_admins")
      .select("user_id, username, first_name, added_by_name, created_at, role")
      .order("role", { ascending: true })
      .order("created_at", { ascending: true });

    if (!rows?.length) {
      await send("No bot admins configured yet. Use /addadmin <user_id> to add one.");
      return;
    }

    // Backfill missing names via getChat (best effort — requires the user to have DMed the bot).
    await Promise.all(
      rows.map(async (r: any) => {
        if (r.first_name || r.username) return;
        try {
          const info = await telegramCall("getChat", { chat_id: r.user_id });
          const first_name = info?.first_name ?? null;
          const username = info?.username ?? null;
          if (first_name || username) {
            r.first_name = first_name;
            r.username = username;
            await supabaseAdmin
              .from("telegram_bot_admins")
              .update({ first_name, username })
              .eq("user_id", r.user_id);
          }
        } catch (e) {
          console.warn("getChat backfill failed", r.user_id, e);
        }
      }),
    );

    const lines = rows.map((r: any) => {
      const label = r.first_name || r.username || `user ${r.user_id}`;
      const handle = r.username ? ` (@${r.username})` : "";
      const crown = r.role === "super_admin" ? "👑 " : "• ";
      return `${crown}${label}${handle} — <code>${r.user_id}</code>`;
    });
    await send(
      `👮 Bot admins (${rows.length}) — 👑 = super admin:\n\n${lines.join("\n")}`,
      { parse_mode: "HTML" },
    );
    return;
  }

  // /addadmin and /radmin require a user_id argument
  const parts = argText.trim().split(/\s+/).slice(1);
  const rawArg = parts[0];
  const targetId = Number(rawArg);
  if (!rawArg || !Number.isFinite(targetId)) {
    const usage = cmd === "/addadmin"
      ? "Usage: /addadmin <user_id> [super]\nAdd 'super' to grant super admin (super admins only)."
      : `Usage: ${cmd} <user_id>`;
    await send(`${usage}\nTip: users can send /id to get their Telegram user ID.`);
    return;
  }

  if (cmd === "/addadmin") {
    const wantsSuper = (parts[1] ?? "").toLowerCase() === "super";
    if (wantsSuper && !callerIsSuper) {
      await send("❌ Only super admins 👑 can add other super admins.");
      return;
    }
    const role = wantsSuper ? "super_admin" : "admin";
    // Try to fetch the target's name/username via getChat (works if they've DMed the bot).
    let targetFirstName: string | null = null;
    let targetUsername: string | null = null;
    try {
      const info = await telegramCall("getChat", { chat_id: targetId });
      targetFirstName = info?.first_name ?? null;
      targetUsername = info?.username ?? null;
    } catch (e) {
      console.warn("getChat on addadmin target failed", targetId, e);
    }
    const { error } = await supabaseAdmin.from("telegram_bot_admins").upsert(
      {
        user_id: targetId,
        username: targetUsername,
        first_name: targetFirstName,
        added_by: fromId,
        added_by_name: fromName,
        role,
      },
      { onConflict: "user_id" },
    );

    if (error) {
      await send(`❌ Failed to add bot admin: ${error.message}`);
      return;
    }
    const label = targetFirstName || targetUsername || `user ${targetId}`;
    const badge = wantsSuper ? "super admin 👑" : "admin";
    await send(`✅ Added ${label} (<code>${targetId}</code>) as a ${badge}.`, { parse_mode: "HTML" });
    return;
  }

  if (cmd === "/radmin") {
    const { data: existing } = await supabaseAdmin
      .from("telegram_bot_admins")
      .select("first_name, username, role")
      .eq("user_id", targetId)
      .maybeSingle();

    if (!existing) {
      await send(`ℹ️ <code>${targetId}</code> is not a bot admin.`, { parse_mode: "HTML" });
      return;
    }

    if (existing.role === "super_admin" && !callerIsSuper) {
      await send("❌ Only super admins 👑 can remove other super admins.");
      return;
    }

    if (existing.role === "super_admin") {
      const { count: superCount } = await supabaseAdmin
        .from("telegram_bot_admins")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "super_admin");
      if ((superCount ?? 0) <= 1) {
        await send("❌ Can't remove the last super admin 👑.");
        return;
      }
    }

    const { error } = await supabaseAdmin
      .from("telegram_bot_admins")
      .delete()
      .eq("user_id", targetId);

    if (error) {
      await send(`❌ Failed to remove bot admin: ${error.message}`);
      return;
    }
    const label = existing.first_name || existing.username || `user ${targetId}`;
    await send(`🗑️ Removed ${label} (<code>${targetId}</code>) from bot admins.`, { parse_mode: "HTML" });
  }
}

async function handleChatListCommands(args: {
  cmd: string;
  fromId: number;
  fromName: string;
  argText: string;
  replyChatId: number;
  chatType: string;
  telegramCall: (m: string, b?: Record<string, unknown>) => Promise<any>;
  supabaseAdmin: any;
}) {
  const { cmd, fromId, fromName, argText, replyChatId, chatType, telegramCall, supabaseAdmin } = args;
  const send = (text: string, extra: Record<string, unknown> = {}) =>
    telegramCall("sendMessage", { chat_id: replyChatId, text, ...extra });

  const { is } = await isBotAdmin(supabaseAdmin, fromId);
  if (!is) {
    await send("❌ Only bot admins can manage channel lists.");
    return;
  }
  if (chatType !== "private") {
    await send(`🔒 Use ${cmd} in a private chat with me.`);
    return;
  }

  const listCmd =
    cmd === "/adultchannels" || cmd === "/adultchannel"
      ? "adult"
      : cmd === "/mangachannels" || cmd === "/mangachannel"
        ? "manga"
        : null;

  if (listCmd) {
    const { data: rows } = await supabaseAdmin
      .from("chat_lists")
      .select("chat_id, created_at")
      .eq("category", listCmd)
      .order("created_at", { ascending: true });
    if (!rows?.length) {
      await send(
        `📭 The ${listCmd} list is empty.\nAdd channels with /addtolist ${listCmd} <chat_id> [chat_id …]`,
      );
      return;
    }
    const ids = rows.map((r: any) => Number(r.chat_id));
    const { data: chats } = await supabaseAdmin
      .from("telegram_chats")
      .select("chat_id, title, username, type")
      .in("chat_id", ids);
    const byId = new Map<number, any>((chats ?? []).map((c: any) => [Number(c.chat_id), c]));
    const emoji = listCmd === "adult" ? "🔞" : "📚";
    const header = `${emoji} <b>${listCmd === "adult" ? "Adult" : "Manga"} channels (${rows.length})</b>`;
    const lines = rows.map((r: any, i: number) => {
      const c = byId.get(Number(r.chat_id));
      const title = c?.title || (c?.username ? `@${c.username}` : `Chat ${r.chat_id}`);
      const uname = c?.username ? ` — @${c.username}` : "";
      return `<b>${i + 1}.</b> ${escapeHtml(title)}${uname}\n<code>${r.chat_id}</code>`;
    });
    await send(`${header}\n\n${lines.join("\n\n")}`, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return;
  }

  // /addtolist and /removefromlist
  const rest = argText.replace(/^\/\S+\s*/, "").trim();
  const parts = rest.split(/\s+/).filter(Boolean);
  const category = (parts.shift() ?? "").toLowerCase();
  if (category !== "adult" && category !== "manga") {
    await send(
      `Usage:\n${cmd} <adult|manga> <chat_id> [chat_id …]\n\nExample: ${cmd} adult -1001710860595 -1002298797194`,
    );
    return;
  }
  const ids = parts
    .map((p) => Number(p))
    .filter((n) => Number.isFinite(n) && n !== 0);
  if (!ids.length) {
    await send(`Provide at least one chat_id. Run /channels to see IDs.`);
    return;
  }

  if (cmd === "/addtolist") {
    const rows = ids.map((chat_id) => ({
      category,
      chat_id,
      added_by: fromId,
      added_by_name: fromName,
    }));
    const { error } = await supabaseAdmin
      .from("chat_lists")
      .upsert(rows, { onConflict: "category,chat_id" });
    if (error) {
      await send(`❌ Failed: ${error.message}`);
      return;
    }
    await send(
      `✅ Added ${ids.length} chat${ids.length === 1 ? "" : "s"} to the ${category} list.\nSee /${category}channels`,
    );
    return;
  }

  // remove
  const { error } = await supabaseAdmin
    .from("chat_lists")
    .delete()
    .eq("category", category)
    .in("chat_id", ids);
  if (error) {
    await send(`❌ Failed: ${error.message}`);
    return;
  }
  await send(
    `🗑 Removed ${ids.length} chat${ids.length === 1 ? "" : "s"} from the ${category} list.`,
  );
}

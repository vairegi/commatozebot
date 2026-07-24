import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

function formatName(u: { first_name?: string; last_name?: string; username?: string } | null | undefined): string {
  if (!u) return "there";
  return u.first_name || u.username || "there";
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { deriveWebhookSecret, telegramCall, getBotIdentity, getChatMemberStatus } =
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
            if (cmd === "/post" || cmd === "/broadcasts" || cmd === "/cancel") {
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
                  "In private chat:\n" +
                  "/channels — list groups & channels where I am admin\n\n" +
                  "/leave [chat_id] — make me leave a chat (admins only)\n\n" +
                  "📣 Broadcast (bot admins, DM only):\n" +
                  "/post — start a broadcast wizard (send/forward the post → pick channels → timing → auto-delete)\n" +
                  "/broadcasts — recent broadcasts, cancel pending, cancel auto-delete\n" +
                  "/cancel — abort current wizard\n\n" +
                  "Bot admins (people allowed to use this bot):\n" +
                  "/addadmin <user_id> [super] — grant bot access (super = super admin, super admins only)\n" +
                  "/radmin <user_id> — revoke bot access (super admins only for other super admins)\n" +
                  "/listadmins — list bot admins\n" +
                  "(First caller becomes the owner 👑 automatically.)\n\n" +
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
    .select("chat_id, title, type, username")
    .in("type", ["group", "supergroup", "channel"])
    .order("last_activity_at", { ascending: false })
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
      buckets[bucket].push(`• ${label}${linkLine}\n  <code>${c.chat_id}</code>`);
    }),
  );

  const sections: string[] = [];
  if (buckets.channel.length) sections.push(`📢 <b>Channels (${buckets.channel.length})</b>\n${buckets.channel.join("\n")}`);
  if (buckets.supergroup.length) sections.push(`👥 <b>Supergroups (${buckets.supergroup.length})</b>\n${buckets.supergroup.join("\n")}`);
  if (buckets.group.length) sections.push(`👥 <b>Groups (${buckets.group.length})</b>\n${buckets.group.join("\n")}`);

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

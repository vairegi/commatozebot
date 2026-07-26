// Interactive /post wizard for bot admins (DM only).
import { telegramCall, getChatMemberStatus, getBotIdentity } from "./telegram.server";
import {
  parseScheduleIST,
  parseAutoDeleteSeconds,
  fmtIST,
  fmtDuration,
  executeBroadcast,
  formatDeliveryReport,
  runEditBroadcast,
  formatEditReport,
} from "./broadcast.server";

type Admin = { user_id: number; role: string };

async function getBotAdmin(fromId: number): Promise<Admin | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("telegram_bot_admins")
    .select("user_id, role")
    .eq("user_id", fromId)
    .maybeSingle();
  return (data as any) ?? null;
}

async function getDraft(userId: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("broadcast_drafts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data as any;
}

async function saveDraft(userId: number, patch: Record<string, any>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("broadcast_drafts").upsert(
    { user_id: userId, ...patch, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
}

async function clearDraft(userId: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("broadcast_drafts").delete().eq("user_id", userId);
}

function previewOf(message: any): string {
  if (message.text) return message.text.slice(0, 120);
  if (message.caption) return `[media] ${message.caption.slice(0, 100)}`;
  if (message.photo) return "[photo]";
  if (message.video) return "[video]";
  if (message.document) return `[document] ${message.document.file_name ?? ""}`;
  if (message.animation) return "[gif]";
  if (message.audio) return "[audio]";
  if (message.voice) return "[voice]";
  if (message.sticker) return `[sticker] ${message.sticker.emoji ?? ""}`;
  if (message.poll) return `[poll] ${message.poll.question ?? ""}`;
  return "[message]";
}

/** Entry: handle /post, /broadcasts, /cancel. Returns true if command was handled. */
export async function handleBroadcastCommand(args: {
  cmd: string;
  fromId: number;
  fromName: string;
  chatId: number;
  chatType: string;
  argText?: string;
}): Promise<boolean> {
  const { cmd, fromId, fromName, chatId, chatType, argText } = args;
  if (
    cmd !== "/post" &&
    cmd !== "/crosspost" &&
    cmd !== "/broadcasts" &&
    cmd !== "/cancel" &&
    cmd !== "/editpost"
  ) return false;

  const admin = await getBotAdmin(fromId);
  if (!admin) {
    await telegramCall("sendMessage", {
      chat_id: chatId,
      text: "❌ Only bot admins can use this. Ask an existing admin to /addadmin you.",
    });
    return true;
  }
  if (chatType !== "private") {
    await telegramCall("sendMessage", {
      chat_id: chatId,
      text: `🔒 Use ${cmd} in a private chat with me.`,
    });
    return true;
  }

  if (cmd === "/cancel") {
    const d = await getDraft(fromId);
    if (!d) {
      await telegramCall("sendMessage", { chat_id: chatId, text: "Nothing to cancel." });
    } else {
      await clearDraft(fromId);
      await telegramCall("sendMessage", { chat_id: chatId, text: "❌ Broadcast draft discarded." });
    }
    return true;
  }

  if (cmd === "/post" || cmd === "/crosspost") {
    const mode = cmd === "/crosspost" ? "forward" : "copy";
    await saveDraft(fromId, {
      step: "awaiting_content",
      source_chat_id: null,
      source_message_id: null,
      preview_text: null,
      selected_chat_ids: [],
      scheduled_at: null,
      auto_delete_seconds: null,
      editing_broadcast_id: null,
      awaiting_custom: null,
      source_message_json: null,
      mode,
    });
    const label = mode === "forward"
      ? "🔁 <b>New crosspost</b> (forwards with 'forwarded from' header)"
      : "📝 <b>New broadcast</b> (clean copy, no forward header)";
    await telegramCall("sendMessage", {
      chat_id: chatId,
      text:
        `${label}\n\nSend or forward the message you want to broadcast (text, photo, video, document, etc.).\n\nUse /cancel to abort.`,
      parse_mode: "HTML",
    });
    return true;
  }

  if (cmd === "/broadcasts") {
    await listBroadcasts(fromId, chatId, fromName);
    return true;
  }

  if (cmd === "/editpost") {
    // /editpost <broadcast_id>
    const rest = (argText ?? "").trim().split(/\s+/).slice(1).join(" ").trim();
    if (!rest) {
      await telegramCall("sendMessage", {
        chat_id: chatId,
        text: "Usage: <code>/editpost &lt;broadcast_id&gt;</code>\n\nOr use /broadcasts and tap ✏️ Edit on a sent post.",
        parse_mode: "HTML",
      });
      return true;
    }
    await startEditFlow(fromId, chatId, rest);
    return true;
  }
  return false;
}

async function listBroadcasts(fromId: number, chatId: number, _fromName: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("broadcasts")
    .select("id, preview_text, status, scheduled_at, sent_at, auto_delete_seconds, created_by, created_by_name, created_at")
    .eq("created_by", fromId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!rows?.length) {
    await telegramCall("sendMessage", { chat_id: chatId, text: "You haven't created any broadcasts yet. Use /post to make one." });
    return;
  }

  const lines: string[] = ["📣 <b>Recent broadcasts</b>\n"];
  const keyboard: any[][] = [];
  for (const r of rows as any[]) {
    const when = r.scheduled_at
      ? `⏰ ${fmtIST(r.scheduled_at)}`
      : r.sent_at
        ? `✅ ${fmtIST(r.sent_at)}`
        : `🕒 ${fmtIST(r.created_at)}`;
    const preview = (r.preview_text ?? "").slice(0, 60);
    lines.push(`• <b>${r.status}</b> — ${when}\n   ${escapeHtml(preview)}`);
    const row: any[] = [{ text: `👁 ${r.status}`, callback_data: `bc:v:${r.id}` }];
    if (r.status === "pending") row.push({ text: "🗑 Cancel", callback_data: `bc:cx:${r.id}` });
    if (r.status === "sent" || r.status === "partial") {
      row.push({ text: "✏️ Edit", callback_data: `bc:ed:${r.id}` });
      row.push({ text: "🚫 Cancel auto-delete", callback_data: `bc:cd:${r.id}` });
    }
    keyboard.push(row);
  }
  await telegramCall("sendMessage", {
    chat_id: chatId,
    text: lines.join("\n"),
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Called for any incoming DM message. Returns true if the message was consumed by the wizard. */
export async function handleBroadcastMessage(args: {
  fromId: number;
  fromName: string;
  chatId: number;
  chatType: string;
  message: any;
}): Promise<boolean> {
  const { fromId, chatId, chatType, message } = args;
  if (chatType !== "private") return false;
  const admin = await getBotAdmin(fromId);
  if (!admin) return false;
  const draft = await getDraft(fromId);
  if (!draft) return false;

  // Awaiting custom text input (schedule or auto-delete)
  if (draft.awaiting_custom === "schedule" && message.text) {
    const when = parseScheduleIST(message.text);
    if (!when) {
      await telegramCall("sendMessage", { chat_id: chatId, text: "❌ Couldn't parse that time. Try: `in 5m`, `in 2h 30m`, `tomorrow 9am`, `25 jul 18:30`.", parse_mode: "Markdown" });
      return true;
    }
    if (when.getTime() <= Date.now() + 5000) {
      await telegramCall("sendMessage", { chat_id: chatId, text: "❌ That time is in the past. Pick a future time." });
      return true;
    }
    await saveDraft(fromId, { scheduled_at: when.toISOString(), awaiting_custom: null, step: "awaiting_delete" });
    await promptAutoDelete(chatId, when);
    return true;
  }
  if (draft.awaiting_custom === "autodelete" && message.text) {
    const secs = parseAutoDeleteSeconds(message.text);
    if (secs === null) {
      await telegramCall("sendMessage", { chat_id: chatId, text: "❌ Couldn't parse that duration. Try: `30m`, `2h`, `2h 30m`, up to 48h." });
      return true;
    }
    await saveDraft(fromId, { auto_delete_seconds: secs, awaiting_custom: null, step: "confirm" });
    await promptConfirm(fromId, chatId);
    return true;
  }

  // Awaiting chat IDs typed manually
  if (draft.awaiting_custom === "chatid" && message.text) {
    const ids = Array.from(
      new Set(
        message.text
          .split(/[\s,]+/)
          .map((s: string) => s.trim())
          .filter(Boolean)
          .map((s: string) => Number(s))
          .filter((n: number) => Number.isFinite(n) && n !== 0),
      ),
    ) as number[];
    if (!ids.length) {
      await telegramCall("sendMessage", { chat_id: chatId, text: "❌ Send one or more chat IDs (space/comma separated). Example: `-1001234567890`", parse_mode: "Markdown" });
      return true;
    }
    const bot = await getBotIdentity();
    const ok: number[] = [];
    const bad: Array<{ id: number; reason: string }> = [];
    await Promise.all(ids.map(async (id) => {
      try {
        const bs = await getChatMemberStatus(id, bot.id);
        if (bs === "administrator" || bs === "creator") ok.push(id);
        else bad.push({ id, reason: `bot status: ${bs ?? "unknown"}` });
      } catch (e: any) {
        bad.push({ id, reason: e?.message ?? "lookup failed" });
      }
    }));
    if (!ok.length) {
      const lines = bad.map((b) => `  • <code>${b.id}</code> — ${escapeHtml(b.reason)}`).join("\n");
      await telegramCall("sendMessage", { chat_id: chatId, text: `❌ None of those work:\n${lines}\n\nSend valid IDs or /cancel.`, parse_mode: "HTML" });
      return true;
    }
    // Merge with any already-selected
    const merged = Array.from(new Set([...(draft.selected_chat_ids ?? []), ...ok]));
    await saveDraft(fromId, { selected_chat_ids: merged, awaiting_custom: null });
    const skipped = bad.length ? `\n\n⚠️ Skipped:\n${bad.map((b) => `  • <code>${b.id}</code> — ${escapeHtml(b.reason)}`).join("\n")}` : "";
    await telegramCall("sendMessage", {
      chat_id: chatId,
      text: `✅ Added ${ok.length} chat${ok.length === 1 ? "" : "s"} (total selected: <b>${merged.length}</b>).${skipped}\n\nTap ➡️ Next to continue, or send more IDs.`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: `➡️ Next (${merged.length})`, callback_data: "bc:next" },
          { text: "❌ Cancel", callback_data: "bc:x" },
        ]],
      },
    });
    return true;
  }

  // Awaiting content
  if (draft.step === "awaiting_content") {
    // Any message with an id is fine
    if (!message.message_id || !message.chat?.id) return true;
    await saveDraft(fromId, {
      source_chat_id: message.chat.id,
      source_message_id: message.message_id,
      preview_text: previewOf(message),
      step: "awaiting_channels",
      selected_chat_ids: [],
    });
    await promptChannels(fromId, chatId);
    return true;
  }

  // Awaiting new content for an edit
  if (draft.step === "awaiting_edit_content" && draft.editing_broadcast_id) {
    if (!message.message_id || !message.chat?.id) return true;
    await saveDraft(fromId, {
      source_chat_id: message.chat.id,
      source_message_id: message.message_id,
      preview_text: previewOf(message),
      source_message_json: message,
      step: "confirm_edit",
    });
    await promptConfirmEdit(fromId, chatId);
    return true;
  }

  // Any other text while draft exists but no prompt — ignore (let normal commands run)
  return false;
}

/** Begin an edit-after-send flow for an existing broadcast owned by fromId (or any, for super admins). */
async function startEditFlow(fromId: number, chatId: number, broadcastId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: bc } = await supabaseAdmin
    .from("broadcasts")
    .select("id, created_by, status, preview_text")
    .eq("id", broadcastId)
    .maybeSingle();
  if (!bc) {
    await telegramCall("sendMessage", { chat_id: chatId, text: "❌ Broadcast not found." });
    return;
  }
  const b = bc as any;
  if (b.created_by !== fromId) {
    const { data: admin } = await supabaseAdmin
      .from("telegram_bot_admins")
      .select("role")
      .eq("user_id", fromId)
      .maybeSingle();
    if (!admin || (admin as any).role !== "super_admin") {
      await telegramCall("sendMessage", { chat_id: chatId, text: "❌ You can only edit your own broadcasts." });
      return;
    }
  }
  if (b.status !== "sent" && b.status !== "partial") {
    await telegramCall("sendMessage", {
      chat_id: chatId,
      text: `❌ Only sent broadcasts can be edited (this one is <b>${b.status}</b>). Use /broadcasts to cancel it instead.`,
      parse_mode: "HTML",
    });
    return;
  }
  const { count } = await supabaseAdmin
    .from("broadcast_targets")
    .select("id", { count: "exact", head: true })
    .eq("broadcast_id", broadcastId)
    .not("sent_message_id", "is", null)
    .in("status", ["sent", "delete_failed"]);
  if (!count) {
    await telegramCall("sendMessage", { chat_id: chatId, text: "❌ Nothing to edit — no delivered targets left (they may have been auto-deleted)." });
    return;
  }
  await saveDraft(fromId, {
    step: "awaiting_edit_content",
    editing_broadcast_id: broadcastId,
    source_chat_id: null,
    source_message_id: null,
    preview_text: null,
    selected_chat_ids: [],
    scheduled_at: null,
    auto_delete_seconds: null,
    awaiting_custom: null,
    mode: "copy",
  });
  await telegramCall("sendMessage", {
    chat_id: chatId,
    text:
      `✏️ <b>Edit broadcast</b>\n\nSend or forward the <b>new</b> message. I'll replace it in all ${count} delivered target${count === 1 ? "" : "s"}.\n\n` +
      `Supported: text, photo, video, animation, document, audio. The new content type must match the original (Telegram won't turn a text post into media, or swap photo↔video, etc.).\n\n` +
      `Use /cancel to abort.`,
    parse_mode: "HTML",
  });
}

async function promptConfirmEdit(fromId: number, chatId: number) {
  const d = await getDraft(fromId);
  if (!d) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("broadcast_targets")
    .select("id", { count: "exact", head: true })
    .eq("broadcast_id", d.editing_broadcast_id)
    .not("sent_message_id", "is", null)
    .in("status", ["sent", "delete_failed"]);
  await telegramCall("sendMessage", {
    chat_id: chatId,
    text:
      `📋 <b>Confirm edit</b>\n\n` +
      `New content: <i>${escapeHtml((d.preview_text ?? "").slice(0, 200))}</i>\n\n` +
      `Will replace the message in <b>${count ?? 0}</b> target${count === 1 ? "" : "s"}.`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "👁 Preview to me", callback_data: "bc:pv" }],
        [
          { text: "✅ Apply edit", callback_data: "bc:egox" },
          { text: "❌ Cancel", callback_data: "bc:x" },
        ],
      ],
    },
  });
}

async function promptChannels(fromId: number, chatId: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: chats } = await supabaseAdmin
    .from("telegram_chats")
    .select("chat_id, title, type, username")
    .in("type", ["group", "supergroup", "channel"])
    .order("last_activity_at", { ascending: false })
    .limit(50);

  if (!chats?.length) {
    await telegramCall("sendMessage", { chat_id: chatId, text: "I'm not in any groups or channels yet." });
    await clearDraft(fromId);
    return;
  }

  // Filter to chats where the bot is admin (user admin status is not required).
  const bot = await getBotIdentity();
  const eligible: Array<{ chat_id: number; title: string; type: string }> = [];
  await Promise.all(
    (chats as any[]).map(async (c) => {
      const bs = await getChatMemberStatus(c.chat_id, bot.id);
      const ba = bs === "administrator" || bs === "creator";
      if (ba) eligible.push({ chat_id: c.chat_id, title: c.title ?? c.username ?? `Chat ${c.chat_id}`, type: c.type });
    }),
  );

  if (!eligible.length) {
    await telegramCall("sendMessage", { chat_id: chatId, text: "I'm not an admin in any groups or channels yet. Add me as admin first." });
    await clearDraft(fromId);
    return;
  }

  await renderChannelPicker(fromId, chatId, eligible, []);
}

/** Start a broadcast wizard directly from a saved template (skips awaiting_content). */
export async function startBroadcastFromTemplate(args: {
  fromId: number;
  chatId: number;
  template: { source_chat_id: number; source_message_id: number; preview_text?: string | null; mode?: string | null };
}): Promise<boolean> {
  const { fromId, chatId, template } = args;
  const admin = await getBotAdmin(fromId);
  if (!admin) return false;
  await saveDraft(fromId, {
    step: "awaiting_channels",
    source_chat_id: template.source_chat_id,
    source_message_id: template.source_message_id,
    preview_text: template.preview_text ?? null,
    selected_chat_ids: [],
    scheduled_at: null,
    auto_delete_seconds: null,
    editing_broadcast_id: null,
    awaiting_custom: null,
    mode: template.mode ?? "copy",
  });
  await promptChannels(fromId, chatId);
  return true;
}

async function renderChannelPicker(
  _fromId: number,
  chatId: number,
  eligible: Array<{ chat_id: number; title: string; type: string }>,
  selected: number[],
) {
  const rows: any[][] = eligible.map((c) => {
    const on = selected.includes(c.chat_id);
    const icon = c.type === "channel" ? "📢" : "👥";
    return [
      {
        text: `${on ? "✅" : "◻️"} ${icon} ${c.title.slice(0, 40)}`,
        callback_data: `bc:t:${c.chat_id}`,
      },
    ];
  });
  rows.push([
    { text: "☑️ All", callback_data: "bc:all" },
    { text: "🔞 Adult", callback_data: "bc:pre:adult" },
    { text: "📚 Manga", callback_data: "bc:pre:manga" },
  ]);
  rows.push([
    { text: "🔞+📚 Adult & Manga", callback_data: "bc:pre:both" },
  ]);
  rows.push([
    { text: "🎯 Pick by ID", callback_data: "bc:byid" },
  ]);
  rows.push([
    { text: "❌ Cancel", callback_data: "bc:x" },
    { text: `➡️ Next (${selected.length})`, callback_data: "bc:next" },
  ]);
  await telegramCall("sendMessage", {
    chat_id: chatId,
    text:
      `📡 <b>Pick target channels</b>\n\n` +
      `Tap to toggle, or use a preset: All / 🔞 Adult / 📚 Manga / 🔞+📚 Both. Then press Next.`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows },
  });
}

async function promptTiming(_fromId: number, chatId: number) {
  await telegramCall("sendMessage", {
    chat_id: chatId,
    text: "⏰ <b>When to send?</b> (all times IST)",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🚀 Post now", callback_data: "bc:sch:now" },
          { text: "in 5m", callback_data: "bc:sch:300" },
        ],
        [
          { text: "in 2h", callback_data: "bc:sch:7200" },
          { text: "in 6h", callback_data: "bc:sch:21600" },
        ],
        [
          { text: "🌅 tomorrow 9am", callback_data: "bc:sch:tmr9" },
          { text: "✏️ Custom…", callback_data: "bc:sch:custom" },
        ],
        [{ text: "❌ Cancel", callback_data: "bc:x" }],
      ],
    },
  });
}

async function promptAutoDelete(chatId: number, scheduledAt: Date | null) {
  const line = scheduledAt ? `Scheduled: <b>${fmtIST(scheduledAt)}</b>\n\n` : "Post now.\n\n";
  await telegramCall("sendMessage", {
    chat_id: chatId,
    text: `${line}🗑 <b>Auto-delete after…?</b> (max 48h)`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🚫 No delete", callback_data: "bc:ad:0" },
          { text: "30m", callback_data: "bc:ad:1800" },
        ],
        [
          { text: "1h", callback_data: "bc:ad:3600" },
          { text: "6h", callback_data: "bc:ad:21600" },
        ],
        [
          { text: "24h", callback_data: "bc:ad:86400" },
          { text: "48h", callback_data: "bc:ad:172800" },
        ],
        [
          { text: "✏️ Custom…", callback_data: "bc:ad:custom" },
          { text: "❌ Cancel", callback_data: "bc:x" },
        ],
      ],
    },
  });
}

async function promptConfirm(fromId: number, chatId: number) {
  const d = await getDraft(fromId);
  if (!d) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: chats } = await supabaseAdmin
    .from("telegram_chats")
    .select("chat_id, title, username")
    .in("chat_id", d.selected_chat_ids ?? []);
  const chatLines = (chats as any[] | null | undefined)?.map((c) => `  • ${c.title ?? c.username ?? c.chat_id}`).join("\n") ?? "";

  const when = d.scheduled_at ? `⏰ ${fmtIST(d.scheduled_at)}` : "🚀 Now";
  const del = d.auto_delete_seconds ? `🗑 after ${fmtDuration(d.auto_delete_seconds)}` : "🚫 no auto-delete";

  await telegramCall("sendMessage", {
    chat_id: chatId,
    text:
      `📋 <b>Confirm broadcast</b>\n\n` +
      `Preview: <i>${escapeHtml((d.preview_text ?? "").slice(0, 200))}</i>\n\n` +
      `Channels (${(d.selected_chat_ids ?? []).length}):\n${chatLines}\n\n` +
      `When: ${when}\n` +
      `Delete: ${del}`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "👁 Preview to me", callback_data: "bc:pv" }],
        [
          { text: "✅ Confirm", callback_data: "bc:go" },
          { text: "❌ Cancel", callback_data: "bc:x" },
        ],
      ],
    },
  });
}

/** Handle any callback_query with data starting with "bc:". */
export async function handleBroadcastCallback(cq: any): Promise<boolean> {
  const data: string = cq?.data ?? "";
  if (!data.startsWith("bc:")) return false;
  const fromId: number = cq.from.id;
  const fromName: string = cq.from.first_name || cq.from.username || `user ${fromId}`;
  const chatId: number = cq.message?.chat?.id ?? fromId;

  const admin = await getBotAdmin(fromId);
  if (!admin) {
    await telegramCall("answerCallbackQuery", { callback_query_id: cq.id, text: "Not a bot admin.", show_alert: true });
    return true;
  }

  const [, op, arg] = data.split(":");
  const draft = await getDraft(fromId);

  // Global cancel
  if (op === "x") {
    await clearDraft(fromId);
    await telegramCall("answerCallbackQuery", { callback_query_id: cq.id, text: "Cancelled" });
    if (cq.message?.message_id) {
      try {
        await telegramCall("editMessageText", { chat_id: chatId, message_id: cq.message.message_id, text: "❌ Broadcast cancelled." });
      } catch { /* ignore */ }
    }
    return true;
  }

  // Channel toggle
  if (op === "t" && draft) {
    const cid = Number(arg);
    const cur: number[] = draft.selected_chat_ids ?? [];
    const next = cur.includes(cid) ? cur.filter((x) => x !== cid) : [...cur, cid];
    await saveDraft(fromId, { selected_chat_ids: next });
    await telegramCall("answerCallbackQuery", { callback_query_id: cq.id });
    // Re-render picker
    const bot = await getBotIdentity();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: chats } = await supabaseAdmin
      .from("telegram_chats")
      .select("chat_id, title, type, username")
      .in("type", ["group", "supergroup", "channel"])
      .order("last_activity_at", { ascending: false })
      .limit(50);
    const eligible: Array<{ chat_id: number; title: string; type: string }> = [];
    await Promise.all((chats as any[]).map(async (c) => {
      const bs = await getChatMemberStatus(c.chat_id, bot.id);
      if (bs === "administrator" || bs === "creator") {
        eligible.push({ chat_id: c.chat_id, title: c.title ?? c.username ?? `Chat ${c.chat_id}`, type: c.type });
      }
    }));
    const rows: any[][] = eligible.map((c) => {
      const on = next.includes(c.chat_id);
      const icon = c.type === "channel" ? "📢" : "👥";
      return [{ text: `${on ? "✅" : "◻️"} ${icon} ${c.title.slice(0, 40)}`, callback_data: `bc:t:${c.chat_id}` }];
    });
    rows.push([
      { text: "☑️ All", callback_data: "bc:all" },
      { text: "🔞 Adult", callback_data: "bc:pre:adult" },
      { text: "📚 Manga", callback_data: "bc:pre:manga" },
    ]);
    rows.push([
      { text: "🔞+📚 Adult & Manga", callback_data: "bc:pre:both" },
    ]);
    rows.push([
      { text: "🎯 Pick by ID", callback_data: "bc:byid" },
    ]);
    rows.push([
      { text: "❌ Cancel", callback_data: "bc:x" },
      { text: `➡️ Next (${next.length})`, callback_data: "bc:next" },
    ]);
    try {
      await telegramCall("editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: cq.message.message_id,
        reply_markup: { inline_keyboard: rows },
      });
    } catch { /* ignore */ }
    return true;
  }

  if (op === "pre" && draft) {
    const categories: Array<"adult" | "manga"> =
      arg === "adult" ? ["adult"] : arg === "manga" ? ["manga"] : arg === "both" ? ["adult", "manga"] : [];
    if (!categories.length) {
      await telegramCall("answerCallbackQuery", { callback_query_id: cq.id });
      return true;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: listRows } = await supabaseAdmin
      .from("chat_lists")
      .select("chat_id")
      .in("category", categories);
    const listIds = new Set<number>((listRows ?? []).map((r: any) => Number(r.chat_id)));
    if (!listIds.size) {
      await telegramCall("answerCallbackQuery", {
        callback_query_id: cq.id,
        text: `The ${categories.join(" & ")} list is empty. Use /addtolist <category> <chat_id>.`,
        show_alert: true,
      });
      return true;
    }
    // Filter to chats where the bot is admin.
    const bot = await getBotIdentity();
    const { data: chats } = await supabaseAdmin
      .from("telegram_chats")
      .select("chat_id")
      .in("chat_id", Array.from(listIds));
    const eligible: number[] = [];
    await Promise.all(
      ((chats as any[]) ?? []).map(async (c) => {
        const bs = await getChatMemberStatus(Number(c.chat_id), bot.id);
        if (bs === "administrator" || bs === "creator") eligible.push(Number(c.chat_id));
      }),
    );
    if (!eligible.length) {
      await telegramCall("answerCallbackQuery", {
        callback_query_id: cq.id,
        text: `No chats in the ${categories.join(" & ")} list where I'm currently admin.`,
        show_alert: true,
      });
      return true;
    }
    await saveDraft(fromId, { selected_chat_ids: eligible });
    await telegramCall("answerCallbackQuery", {
      callback_query_id: cq.id,
      text: `Selected ${eligible.length} chat${eligible.length === 1 ? "" : "s"} (${categories.join(" & ")}).`,
    });
    return true;
  }

  if (op === "byid" && draft) {
    await saveDraft(fromId, { awaiting_custom: "chatid" });
    await telegramCall("answerCallbackQuery", { callback_query_id: cq.id });
    await telegramCall("sendMessage", {
      chat_id: chatId,
      text:
        "🎯 <b>Send chat ID(s)</b>\n\nPaste one or more Telegram chat IDs (space or comma separated). I'll verify I'm admin in each.\n\nExample: <code>-1001234567890 -1009876543210</code>",
      parse_mode: "HTML",
    });
    return true;
  }

  if (op === "all" && draft) {
    const bot = await getBotIdentity();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: chats } = await supabaseAdmin
      .from("telegram_chats")
      .select("chat_id, type, title, username")
      .in("type", ["group", "supergroup", "channel"])
      .limit(50);
    const eligible: number[] = [];
    await Promise.all((chats as any[]).map(async (c) => {
      const bs = await getChatMemberStatus(c.chat_id, bot.id);
      if (bs === "administrator" || bs === "creator") eligible.push(c.chat_id);
    }));
    await saveDraft(fromId, { selected_chat_ids: eligible });
    await telegramCall("answerCallbackQuery", { callback_query_id: cq.id, text: `Selected ${eligible.length}` });
    return true;
  }

  if (op === "next" && draft) {
    if (!(draft.selected_chat_ids ?? []).length) {
      await telegramCall("answerCallbackQuery", { callback_query_id: cq.id, text: "Pick at least one channel.", show_alert: true });
      return true;
    }
    await saveDraft(fromId, { step: "awaiting_timing" });
    await telegramCall("answerCallbackQuery", { callback_query_id: cq.id });
    await promptTiming(fromId, chatId);
    return true;
  }

  if (op === "sch" && draft) {
    await telegramCall("answerCallbackQuery", { callback_query_id: cq.id });
    if (arg === "custom") {
      await saveDraft(fromId, { awaiting_custom: "schedule" });
      await telegramCall("sendMessage", {
        chat_id: chatId,
        text: "Send the time (IST). Examples: `in 5m`, `in 2h 30m`, `tomorrow 9am`, `25 jul 18:30`.",
        parse_mode: "Markdown",
      });
      return true;
    }
    let scheduledAt: Date | null = null;
    if (arg === "now") scheduledAt = null;
    else if (arg === "tmr9") scheduledAt = parseScheduleIST("tomorrow 9am");
    else {
      const secs = Number(arg);
      if (Number.isFinite(secs)) scheduledAt = new Date(Date.now() + secs * 1000);
    }
    await saveDraft(fromId, { scheduled_at: scheduledAt ? scheduledAt.toISOString() : null, step: "awaiting_delete" });
    await promptAutoDelete(chatId, scheduledAt);
    return true;
  }

  if (op === "ad" && draft) {
    await telegramCall("answerCallbackQuery", { callback_query_id: cq.id });
    if (arg === "custom") {
      await saveDraft(fromId, { awaiting_custom: "autodelete" });
      await telegramCall("sendMessage", { chat_id: chatId, text: "Send auto-delete duration. Examples: `30m`, `2h`, `2h 30m`. Max 48h.", parse_mode: "Markdown" });
      return true;
    }
    const secs = Number(arg);
    await saveDraft(fromId, { auto_delete_seconds: secs > 0 ? secs : null, step: "confirm" });
    await promptConfirm(fromId, chatId);
    return true;
  }

  if (op === "go" && draft) {
    await telegramCall("answerCallbackQuery", { callback_query_id: cq.id, text: "Submitting…" });
    await commitDraft(fromId, fromName, chatId);
    return true;
  }

  // Preview: copy source message to the admin's DM so they see exactly what channels will get.
  if (op === "pv" && draft) {
    if (!draft.source_chat_id || !draft.source_message_id) {
      await telegramCall("answerCallbackQuery", { callback_query_id: cq.id, text: "No content yet.", show_alert: true });
      return true;
    }
    try {
      await telegramCall("sendMessage", { chat_id: fromId, text: "👁 <b>Preview</b> — this is exactly what channels will receive:", parse_mode: "HTML" });
      await telegramCall("copyMessage", {
        chat_id: fromId,
        from_chat_id: draft.source_chat_id,
        message_id: draft.source_message_id,
      });
      await telegramCall("answerCallbackQuery", { callback_query_id: cq.id, text: "Preview sent" });
    } catch (e: any) {
      await telegramCall("answerCallbackQuery", { callback_query_id: cq.id, text: `Preview failed: ${e?.message ?? "unknown"}`, show_alert: true });
    }
    return true;
  }

  // /nuke confirmation
  if (op === "nuke") {
    const { runNuke } = await import("@/lib/broadcast.server");
    await telegramCall("answerCallbackQuery", { callback_query_id: cq.id, text: "Nuking…" });
    try {
      const res = await runNuke({ broadcastId: arg, fromId });
      await telegramCall("sendMessage", {
        chat_id: chatId,
        text: `☢️ <b>Nuke complete</b>\n✅ Deleted: <b>${res.deleted}</b>\n❌ Failed: <b>${res.failed}</b>`,
        parse_mode: "HTML",
      });
    } catch (e: any) {
      await telegramCall("sendMessage", { chat_id: chatId, text: `❌ Nuke failed: ${e?.message ?? e}` });
    }
    if (cq.message?.message_id) {
      try { await telegramCall("editMessageReplyMarkup", { chat_id: chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }); } catch { /* ignore */ }
    }
    return true;
  }
  if (op === "nukex") {
    await telegramCall("answerCallbackQuery", { callback_query_id: cq.id, text: "Cancelled" });
    if (cq.message?.message_id) {
      try { await telegramCall("editMessageText", { chat_id: chatId, message_id: cq.message.message_id, text: "☢️ Nuke cancelled." }); } catch { /* ignore */ }
    }
    return true;
  }

  // /broadcasts row actions
  if (op === "v") {
    await showBroadcastDetail(fromId, chatId, arg, cq.id);
    return true;
  }
  if (op === "cx") {
    await cancelPendingBroadcast(fromId, chatId, arg, cq.id);
    return true;
  }
  if (op === "cd") {
    await cancelAutoDeletes(fromId, chatId, arg, cq.id);
    return true;
  }

  // Edit-after-send: start
  if (op === "ed") {
    await telegramCall("answerCallbackQuery", { callback_query_id: cq.id });
    await startEditFlow(fromId, chatId, arg);
    return true;
  }

  // Edit-after-send: apply
  if (op === "egox" && draft?.editing_broadcast_id) {
    if (!draft.source_chat_id || !draft.source_message_id) {
      await telegramCall("answerCallbackQuery", { callback_query_id: cq.id, text: "No new content yet.", show_alert: true });
      return true;
    }
    await telegramCall("answerCallbackQuery", { callback_query_id: cq.id, text: "Applying edit…" });
    // Fetch the new source message details from Telegram by copying it into DM — no; we have it stored.
    // We need the full Message object to build InputMedia. Re-fetch by looking at the last stored preview isn't enough,
    // so we instead read the message via a self-copy trick: forwardMessage into DM would re-send.
    // Simpler: the wizard captured the message directly; reconstruct file_ids by reading the raw update — but the draft
    // only stored ids. We hydrate by using getChat / but Bot API has no getMessage. So we asked the admin to send in DM;
    // that message already lives at source_chat_id/source_message_id. Re-fetch via a forwardMessage→ourselves? That
    // creates a new message. Instead, we store the raw message in the draft row.
    const newSource = draft.source_message_json ?? null;
    if (!newSource) {
      await telegramCall("sendMessage", { chat_id: chatId, text: "❌ Lost the new content — please /editpost again." });
      await clearDraft(fromId);
      return true;
    }
    try {
      const res = await runEditBroadcast({
        broadcastId: draft.editing_broadcast_id,
        fromId,
        newSource,
      });
      await telegramCall("sendMessage", {
        chat_id: chatId,
        text: formatEditReport(res),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
    } catch (e: any) {
      await telegramCall("sendMessage", { chat_id: chatId, text: `❌ Edit failed: ${e?.message ?? e}` });
    }
    await clearDraft(fromId);
    return true;
  }

  await telegramCall("answerCallbackQuery", { callback_query_id: cq.id });
  return true;
}

async function commitDraft(fromId: number, fromName: string, chatId: number) {
  const d = await getDraft(fromId);
  if (!d) return;
  if (!d.source_chat_id || !d.source_message_id || !(d.selected_chat_ids ?? []).length) {
    await telegramCall("sendMessage", { chat_id: chatId, text: "❌ Draft incomplete." });
    await clearDraft(fromId);
    return;
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: bc, error } = await supabaseAdmin
    .from("broadcasts")
    .insert({
      created_by: fromId,
      created_by_name: fromName,
      source_chat_id: d.source_chat_id,
      source_message_id: d.source_message_id,
      preview_text: d.preview_text,
      scheduled_at: d.scheduled_at,
      auto_delete_seconds: d.auto_delete_seconds,
      mode: d.mode ?? "copy",
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !bc) {
    await telegramCall("sendMessage", { chat_id: chatId, text: `❌ Failed to create broadcast: ${error?.message ?? "unknown"}` });
    return;
  }
  // Targets
  const { data: chats } = await supabaseAdmin
    .from("telegram_chats")
    .select("chat_id, title, username")
    .in("chat_id", d.selected_chat_ids);
  const targetRows = (d.selected_chat_ids as number[]).map((cid) => {
    const c = (chats as any[] | null | undefined)?.find((x) => Number(x.chat_id) === Number(cid));
    return {
      broadcast_id: bc.id,
      chat_id: cid,
      chat_title: c?.title ?? c?.username ?? String(cid),
    };
  });
  await supabaseAdmin.from("broadcast_targets").insert(targetRows);
  await clearDraft(fromId);

  if (!d.scheduled_at) {
    await telegramCall("sendMessage", { chat_id: chatId, text: "🚀 Sending now…" });
    try {
      const res = await executeBroadcast(bc.id);
      await telegramCall("sendMessage", {
        chat_id: chatId,
        text: formatDeliveryReport(res.targets, res.status),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
    } catch (e: any) {
      await telegramCall("sendMessage", { chat_id: chatId, text: `❌ Send failed: ${e?.message ?? e}` });
    }
  } else {
    await telegramCall("sendMessage", {
      chat_id: chatId,
      text: `⏰ Scheduled for ${fmtIST(d.scheduled_at)}. Use /broadcasts to view or cancel.`,
    });
  }
}

async function showBroadcastDetail(fromId: number, chatId: number, id: string, cqId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: bc } = await supabaseAdmin.from("broadcasts").select("*").eq("id", id).eq("created_by", fromId).maybeSingle();
  if (!bc) {
    await telegramCall("answerCallbackQuery", { callback_query_id: cqId, text: "Not found", show_alert: true });
    return;
  }
  const { data: targets } = await supabaseAdmin.from("broadcast_targets").select("chat_id, chat_title, status, error, delete_at").eq("broadcast_id", id);
  const b = bc as any;
  const lines = [
    `📣 <b>Broadcast ${b.status}</b>`,
    `Preview: <i>${escapeHtml((b.preview_text ?? "").slice(0, 200))}</i>`,
    b.scheduled_at ? `Scheduled: ${fmtIST(b.scheduled_at)}` : "Immediate",
    b.sent_at ? `Sent: ${fmtIST(b.sent_at)}` : "",
    b.auto_delete_seconds ? `Auto-delete: ${fmtDuration(b.auto_delete_seconds)}` : "No auto-delete",
    "",
    "Targets:",
    ...((targets as any[] | null | undefined) ?? []).map((t) => {
      const del = t.delete_at ? ` (del ${fmtIST(t.delete_at)})` : "";
      const err = t.error ? ` — ${escapeHtml(t.error.slice(0, 60))}` : "";
      return `  • ${t.status} ${escapeHtml(t.chat_title ?? String(t.chat_id))}${del}${err}`;
    }),
  ].filter(Boolean);
  await telegramCall("answerCallbackQuery", { callback_query_id: cqId });
  await telegramCall("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
}

async function cancelPendingBroadcast(fromId: number, chatId: number, id: string, cqId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: bc } = await supabaseAdmin.from("broadcasts").select("id, status").eq("id", id).eq("created_by", fromId).maybeSingle();
  if (!bc) { await telegramCall("answerCallbackQuery", { callback_query_id: cqId, text: "Not found", show_alert: true }); return; }
  if ((bc as any).status !== "pending") {
    await telegramCall("answerCallbackQuery", { callback_query_id: cqId, text: "Already sent.", show_alert: true }); return;
  }
  await supabaseAdmin.from("broadcasts").update({ status: "cancelled" }).eq("id", id);
  await telegramCall("answerCallbackQuery", { callback_query_id: cqId, text: "Cancelled" });
  await telegramCall("sendMessage", { chat_id: chatId, text: "🗑 Broadcast cancelled." });
}

async function cancelAutoDeletes(fromId: number, chatId: number, id: string, cqId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: bc } = await supabaseAdmin.from("broadcasts").select("id").eq("id", id).eq("created_by", fromId).maybeSingle();
  if (!bc) { await telegramCall("answerCallbackQuery", { callback_query_id: cqId, text: "Not found", show_alert: true }); return; }
  const { error } = await supabaseAdmin
    .from("broadcast_targets")
    .update({ delete_at: null })
    .eq("broadcast_id", id)
    .eq("status", "sent")
    .not("delete_at", "is", null);
  if (error) {
    await telegramCall("answerCallbackQuery", { callback_query_id: cqId, text: "Failed", show_alert: true }); return;
  }
  await telegramCall("answerCallbackQuery", { callback_query_id: cqId, text: "Auto-delete cancelled" });
  await telegramCall("sendMessage", { chat_id: chatId, text: "🚫 Auto-delete cleared for remaining targets." });
}
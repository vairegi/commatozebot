// Command handlers for /recur, /recurring, /delrecur (bot admins, DM only).
import { telegramCall } from "./telegram.server";
import { parseRecurrenceSpec, nextRunAfter } from "./recurring.server";
import { fmtIST } from "./broadcast.server";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function isBotAdmin(supabaseAdmin: any, fromId: number): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("telegram_bot_admins")
    .select("user_id")
    .eq("user_id", fromId)
    .maybeSingle();
  return !!data;
}

/** Returns true if the command was handled. */
export async function handleRecurringCommand(args: {
  cmd: string;
  fromId: number;
  fromName: string;
  argText: string;
  chatId: number;
  chatType: string;
}): Promise<boolean> {
  const { cmd, fromId, fromName, argText, chatId, chatType } = args;
  if (!["/recur", "/recurring", "/delrecur"].includes(cmd)) return false;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!(await isBotAdmin(supabaseAdmin, fromId))) {
    await telegramCall("sendMessage", { chat_id: chatId, text: "❌ Only bot admins can use recurring commands." });
    return true;
  }
  if (chatType !== "private") {
    await telegramCall("sendMessage", { chat_id: chatId, text: "🔒 Use recurring commands in a private chat with me." });
    return true;
  }

  if (cmd === "/recurring") {
    await listRecurrences(fromId, chatId);
    return true;
  }
  if (cmd === "/delrecur") {
    const id = argText.replace(/^\/delrecur(@\S+)?\s*/i, "").trim();
    await deleteRecurrence(fromId, chatId, id);
    return true;
  }
  if (cmd === "/recur") {
    await createRecurrence(fromId, fromName, chatId, argText);
    return true;
  }
  return false;
}

const USAGE =
  "🔁 <b>Create a recurring post</b>\n\n" +
  "<code>/recur &lt;broadcast_id&gt; &lt;spec&gt;</code>\n\n" +
  "The broadcast is used as the <b>template</b> (its source message, target channels, buttons, mode, and auto-delete are copied).\n\n" +
  "<b>Spec examples</b>\n" +
  "• <code>daily 09:00</code> — every day at 09:00 IST\n" +
  "• <code>weekly mon 21:30</code> — every Monday 21:30 IST\n" +
  "• <code>monthly 1 09:00</code> — 1st of each month, 09:00 IST\n" +
  "• <code>cron 0 9 * * *</code> — advanced 5-field cron (UTC)\n\n" +
  "See existing schedules with /recurring, remove with /delrecur &lt;id&gt;.";

async function createRecurrence(fromId: number, fromName: string, chatId: number, argText: string) {
  const rest = argText.replace(/^\/recur(@\S+)?\s*/i, "").trim();
  if (!rest) {
    await telegramCall("sendMessage", { chat_id: chatId, text: USAGE, parse_mode: "HTML" });
    return;
  }
  const firstSpace = rest.indexOf(" ");
  if (firstSpace < 0) {
    await telegramCall("sendMessage", { chat_id: chatId, text: USAGE, parse_mode: "HTML" });
    return;
  }
  const broadcastId = rest.slice(0, firstSpace).trim();
  const specText = rest.slice(firstSpace + 1).trim();

  let parsed;
  try {
    parsed = parseRecurrenceSpec(specText);
  } catch (e: any) {
    await telegramCall("sendMessage", { chat_id: chatId, text: `❌ ${e?.message ?? "invalid spec"}\n\n${USAGE}`, parse_mode: "HTML" });
    return;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: bc } = await supabaseAdmin
    .from("broadcasts")
    .select("id, source_chat_id, source_message_id, preview_text, mode, reply_markup, auto_delete_seconds, created_by")
    .eq("id", broadcastId)
    .maybeSingle();
  if (!bc) {
    await telegramCall("sendMessage", { chat_id: chatId, text: "❌ Broadcast not found." });
    return;
  }
  const { data: targets } = await supabaseAdmin
    .from("broadcast_targets")
    .select("chat_id")
    .eq("broadcast_id", broadcastId);
  const chatIds = ((targets as any[]) ?? []).map((t) => Number(t.chat_id));
  if (!chatIds.length) {
    await telegramCall("sendMessage", { chat_id: chatId, text: "❌ That broadcast has no target channels." });
    return;
  }

  const next = nextRunAfter(parsed.cron);
  const { data: rec, error } = await supabaseAdmin
    .from("broadcast_recurrences")
    .insert({
      created_by: fromId,
      created_by_name: fromName,
      source_chat_id: (bc as any).source_chat_id,
      source_message_id: (bc as any).source_message_id,
      preview_text: (bc as any).preview_text,
      mode: (bc as any).mode ?? "copy",
      reply_markup: (bc as any).reply_markup ?? null,
      auto_delete_seconds: (bc as any).auto_delete_seconds,
      target_chat_ids: chatIds,
      spec_kind: parsed.kind,
      spec_text: parsed.humanText,
      cron_expr: parsed.cron,
      next_run_at: next.toISOString(),
    })
    .select("id")
    .single();
  if (error || !rec) {
    await telegramCall("sendMessage", { chat_id: chatId, text: `❌ Failed: ${error?.message ?? "unknown"}` });
    return;
  }
  await telegramCall("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `✅ <b>Recurring post scheduled</b>\n` +
      `ID: <code>${(rec as any).id}</code>\n` +
      `Schedule: ${escapeHtml(parsed.humanText)}\n` +
      `Targets: ${chatIds.length} channel${chatIds.length === 1 ? "" : "s"}\n` +
      `Next run: ${fmtIST(next)}`,
  });
}

async function listRecurrences(fromId: number, chatId: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("broadcast_recurrences")
    .select("id, spec_text, active, next_run_at, last_run_at, run_count, preview_text, target_chat_ids, last_error")
    .eq("created_by", fromId)
    .order("created_at", { ascending: false })
    .limit(30);
  const rows = (data as any[]) ?? [];
  if (!rows.length) {
    await telegramCall("sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: "No recurring posts. Create one with <code>/recur &lt;broadcast_id&gt; daily 09:00</code>",
    });
    return;
  }
  const lines = ["🔁 <b>Your recurring posts</b>\n"];
  for (const r of rows) {
    const targets = (r.target_chat_ids ?? []).length;
    const state = r.active ? "✅" : "⏸";
    const preview = escapeHtml((r.preview_text ?? "").slice(0, 60));
    lines.push(
      `${state} <code>${r.id}</code>\n` +
      `   ${escapeHtml(r.spec_text)} • ${targets} chat${targets === 1 ? "" : "s"} • ran ${r.run_count}×\n` +
      `   next: ${fmtIST(r.next_run_at)}${r.last_run_at ? ` • last: ${fmtIST(r.last_run_at)}` : ""}\n` +
      (preview ? `   <i>${preview}</i>\n` : "") +
      (r.last_error ? `   ⚠ ${escapeHtml(String(r.last_error).slice(0, 100))}\n` : ""),
    );
  }
  lines.push("\nRemove with <code>/delrecur &lt;id&gt;</code>.");
  await telegramCall("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
}

async function deleteRecurrence(fromId: number, chatId: number, id: string) {
  if (!id) {
    await telegramCall("sendMessage", { chat_id: chatId, text: "Usage: <code>/delrecur &lt;id&gt;</code>", parse_mode: "HTML" });
    return;
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error, count } = await supabaseAdmin
    .from("broadcast_recurrences")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("created_by", fromId);
  if (error) {
    await telegramCall("sendMessage", { chat_id: chatId, text: `❌ ${error.message}` });
    return;
  }
  await telegramCall("sendMessage", {
    chat_id: chatId,
    text: count ? "✅ Recurring post removed." : "❌ Not found (or not yours).",
  });
}
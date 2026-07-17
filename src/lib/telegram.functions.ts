import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listChats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("telegram_chats")
      .select("*")
      .order("last_activity_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { chatId: number }) => z.object({ chatId: z.number() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: chat, error } = await context.supabase
      .from("telegram_chats")
      .select("*")
      .eq("chat_id", data.chatId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return chat;
  });

export const listMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { chatId: number }) => z.object({ chatId: z.number() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("telegram_members")
      .select("*")
      .eq("chat_id", data.chatId)
      .order("last_seen_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listRecentMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { chatId: number }) => z.object({ chatId: z.number() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("telegram_messages")
      .select("update_id, chat_id, user_id, text, created_at")
      .eq("chat_id", data.chatId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listModeration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { chatId: number }) => z.object({ chatId: z.number() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("moderation_actions")
      .select("*")
      .eq("chat_id", data.chatId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateChatSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    chatId: number;
    welcome_enabled?: boolean;
    welcome_message?: string;
    rules?: string;
  }) =>
    z
      .object({
        chatId: z.number(),
        welcome_enabled: z.boolean().optional(),
        welcome_message: z.string().max(2000).optional(),
        rules: z.string().max(4000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { chatId, ...patch } = data;
    const { error } = await context.supabase.from("telegram_chats").update(patch).eq("chat_id", chatId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { chatId: number; text: string }) =>
    z.object({ chatId: z.number(), text: z.string().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { telegramCall } = await import("@/lib/telegram.server");
    await telegramCall("sendMessage", { chat_id: data.chatId, text: data.text });
    return { ok: true };
  });

export const moderateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    chatId: number;
    userId: number;
    action: "ban" | "unban" | "kick" | "warn";
    reason?: string;
  }) =>
    z
      .object({
        chatId: z.number(),
        userId: z.number(),
        action: z.enum(["ban", "unban", "kick", "warn"]),
        reason: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { telegramCall } = await import("@/lib/telegram.server");

    if (data.action === "ban") {
      await telegramCall("banChatMember", { chat_id: data.chatId, user_id: data.userId });
      await context.supabase
        .from("telegram_members")
        .update({ status: "banned" })
        .eq("chat_id", data.chatId)
        .eq("user_id", data.userId);
    } else if (data.action === "unban") {
      await telegramCall("unbanChatMember", { chat_id: data.chatId, user_id: data.userId });
      await context.supabase
        .from("telegram_members")
        .update({ status: "member" })
        .eq("chat_id", data.chatId)
        .eq("user_id", data.userId);
    } else if (data.action === "kick") {
      // Kick = ban then unban
      await telegramCall("banChatMember", { chat_id: data.chatId, user_id: data.userId });
      await telegramCall("unbanChatMember", { chat_id: data.chatId, user_id: data.userId });
      await context.supabase
        .from("telegram_members")
        .update({ status: "left" })
        .eq("chat_id", data.chatId)
        .eq("user_id", data.userId);
    } else if (data.action === "warn") {
      // increment warn count
      const { data: cur } = await context.supabase
        .from("telegram_members")
        .select("warn_count, first_name, username")
        .eq("chat_id", data.chatId)
        .eq("user_id", data.userId)
        .maybeSingle();
      const next = (cur?.warn_count ?? 0) + 1;
      await context.supabase
        .from("telegram_members")
        .update({ warn_count: next })
        .eq("chat_id", data.chatId)
        .eq("user_id", data.userId);
      const name = cur?.first_name || cur?.username || `user ${data.userId}`;
      await telegramCall("sendMessage", {
        chat_id: data.chatId,
        text: `⚠️ ${name} has been warned (${next} total).${data.reason ? `\nReason: ${data.reason}` : ""}`,
      });
    }

    await context.supabase.from("moderation_actions").insert({
      chat_id: data.chatId,
      target_user_id: data.userId,
      action: data.action,
      reason: data.reason ?? null,
      actor: context.userId,
    });
    return { ok: true };
  });
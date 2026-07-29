// Server-only Telegram gateway helpers
const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

export async function telegramCall(method: string, body: Record<string, unknown> = {}) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const telegramKey = process.env.TELEGRAM_API_KEY;
  if (!lovableKey || !telegramKey) {
    throw new Error("Telegram connector env vars are missing");
  }
  // Retry transient upstream errors (502/503/504) and rate limits (429).
  const maxAttempts = 4;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${GATEWAY_URL}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": telegramKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) {
      const json = JSON.parse(text);
      if (json.ok === false) {
        throw new Error(`Telegram ${method} error: ${json.description ?? text}`);
      }
      return json.result;
    }
    const retriable = res.status === 429 || (res.status >= 500 && res.status <= 599);
    lastErr = new Error(`Telegram ${method} failed [${res.status}]: ${text}`);
    if (!retriable || attempt === maxAttempts) throw lastErr;
    // Honor Retry-After when present; otherwise exponential backoff (0.5s, 1s, 2s).
    let delayMs = 500 * Math.pow(2, attempt - 1);
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) {
      const secs = Number(retryAfter);
      if (Number.isFinite(secs) && secs > 0) delayMs = Math.min(secs * 1000, 10_000);
    } else {
      try {
        const j = JSON.parse(text);
        const p = j?.parameters?.retry_after;
        if (typeof p === "number" && p > 0) delayMs = Math.min(p * 1000, 10_000);
      } catch {}
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw lastErr ?? new Error(`Telegram ${method} failed`);
}

export function deriveWebhookSecret(): string {
  const key = process.env.TELEGRAM_API_KEY;
  if (!key) throw new Error("TELEGRAM_API_KEY missing");
  const { createHash } = require("crypto") as typeof import("crypto");
  return createHash("sha256").update(`telegram-webhook:${key}`).digest("base64url");
}

let _botIdCache: { id: number; username?: string } | null = null;
export async function getBotIdentity(): Promise<{ id: number; username?: string }> {
  if (_botIdCache) return _botIdCache;
  const me = await telegramCall("getMe");
  _botIdCache = { id: me.id, username: me.username };
  return _botIdCache;
}

export async function getChatMemberStatus(
  chatId: number,
  userId: number,
): Promise<string | null> {
  try {
    const m = await telegramCall("getChatMember", { chat_id: chatId, user_id: userId });
    return m?.status ?? null;
  } catch {
    return null;
  }
}

/** Build a t.me link to a message. Public username -> t.me/<username>/<id>, private supergroup/channel -> t.me/c/<internal>/<id>. */
export function buildMessageLink(opts: {
  chatId: number;
  messageId: number;
  username?: string | null;
}): string | null {
  if (!opts.messageId) return null;
  if (opts.username) return `https://t.me/${opts.username}/${opts.messageId}`;
  // Private supergroups/channels have id like -100XXXXXXXXXX; strip the -100 prefix.
  const s = String(opts.chatId);
  if (s.startsWith("-100")) {
    const internal = s.slice(4);
    return `https://t.me/c/${internal}/${opts.messageId}`;
  }
  return null;
}

/** React to a message with a single emoji (Telegram Bot API 7.0+). */
export async function setMessageReaction(
  chatId: number,
  messageId: number,
  emoji: string,
): Promise<void> {
  await telegramCall("setMessageReaction", {
    chat_id: chatId,
    message_id: messageId,
    reaction: [{ type: "emoji", emoji }],
    is_big: false,
  });
}

/** Emojis Telegram accepts as free reactions on most chats. */
export const REACTION_EMOJIS = [
  "👍","👎","❤","🔥","🥰","👏","😁","🤔","🤯","😱",
  "🎉","🤩","😢","🙏","👌","🕊","🤣","⚡","🍌","🏆",
  "💯","🤗","🫡","😍","🐳","❤‍🔥","🌚","🌭","💅","🤪",
];
// Server-only: live mirror of every app table into Turso (libSQL) over the HTTP API.
//
// Design: each Postgres table gets a Turso table of the same name shaped as
//   (pk TEXT PRIMARY KEY, data TEXT /* json */, op TEXT, synced_at TEXT)
// The full row is stored as JSON so schema changes here never break the mirror.
// Query it in Turso with json_extract(data, '$.column').

export const MIRRORED_TABLES = [
  "profiles",
  "user_roles",
  "telegram_bot_admins",
  "telegram_chats",
  "telegram_members",
  "telegram_messages",
  "moderation_actions",
  "bot_admin_events",
  "broadcasts",
  "broadcast_targets",
  "broadcast_drafts",
  "broadcast_templates",
  "broadcast_recurrences",
  "broadcast_button_presets",
  "chat_lists",
] as const;

export type MirroredTable = (typeof MIRRORED_TABLES)[number];

/** Primary key column(s) per table — used to build the mirror row key. */
export const PK_COLUMNS: Record<string, string[]> = {
  profiles: ["id"],
  user_roles: ["id"],
  telegram_bot_admins: ["user_id"],
  telegram_chats: ["chat_id"],
  telegram_members: ["chat_id", "user_id"],
  telegram_messages: ["update_id"],
  moderation_actions: ["id"],
  bot_admin_events: ["id"],
  broadcasts: ["id"],
  broadcast_targets: ["id"],
  broadcast_drafts: ["user_id"],
  broadcast_templates: ["id"],
  broadcast_recurrences: ["id"],
  broadcast_button_presets: ["id"],
  chat_lists: ["category", "chat_id"],
};

export function isMirroredTable(t: string): t is MirroredTable {
  return (MIRRORED_TABLES as readonly string[]).includes(t);
}

export function rowKey(table: string, row: Record<string, unknown>): string {
  const cols = PK_COLUMNS[table] ?? ["id"];
  return cols.map((c) => String(row?.[c] ?? "")).join("::");
}

function endpoint(): string {
  const raw = process.env.TURSO_DATABASE_URL;
  if (!raw) throw new Error("TURSO_DATABASE_URL is not set");
  const https = raw.replace(/^libsql:\/\//, "https://").replace(/\/$/, "");
  return `${https}/v2/pipeline`;
}

type Arg = { type: "text" | "null"; value?: string };
type Stmt = { sql: string; args?: Arg[] };

function arg(v: string | null): Arg {
  return v === null ? { type: "null" } : { type: "text", value: v };
}

/** Execute one or more statements in a single Turso HTTP round-trip. */
export async function tursoExec(stmts: Stmt[]): Promise<any[]> {
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!token) throw new Error("TURSO_AUTH_TOKEN is not set");

  const body = {
    requests: [...stmts.map((stmt) => ({ type: "execute", stmt })), { type: "close" }],
  };

  const res = await fetch(endpoint(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Turso HTTP ${res.status}: ${text.slice(0, 500)}`);

  const parsed = JSON.parse(text);
  const results: any[] = parsed?.results ?? [];
  for (const r of results) {
    if (r?.type === "error") {
      throw new Error(`Turso error: ${r?.error?.message ?? JSON.stringify(r).slice(0, 300)}`);
    }
  }
  return results;
}

function createSql(table: string): string {
  return `CREATE TABLE IF NOT EXISTS "${table}" (pk TEXT PRIMARY KEY, data TEXT, op TEXT, synced_at TEXT)`;
}

/** Create every mirror table (idempotent). */
export async function ensureSchema(): Promise<string[]> {
  await tursoExec(MIRRORED_TABLES.map((t) => ({ sql: createSql(t) })));
  return [...MIRRORED_TABLES];
}

export async function upsertRows(
  table: string,
  rows: Array<Record<string, unknown>>,
): Promise<number> {
  if (!rows.length) return 0;
  const now = new Date().toISOString();
  const stmts: Stmt[] = [{ sql: createSql(table) }];
  for (const row of rows) {
    stmts.push({
      sql:
        `INSERT INTO "${table}" (pk, data, op, synced_at) VALUES (?, ?, 'upsert', ?) ` +
        `ON CONFLICT(pk) DO UPDATE SET data=excluded.data, op='upsert', synced_at=excluded.synced_at`,
      args: [arg(rowKey(table, row)), arg(JSON.stringify(row)), arg(now)],
    });
  }
  // Chunk so a single pipeline request stays reasonable.
  const CHUNK = 200;
  let done = 0;
  for (let i = 0; i < stmts.length; i += CHUNK) {
    await tursoExec(stmts.slice(i, i + CHUNK));
  }
  done = rows.length;
  return done;
}

export async function deleteRow(table: string, row: Record<string, unknown>): Promise<void> {
  await tursoExec([
    { sql: createSql(table) },
    { sql: `DELETE FROM "${table}" WHERE pk = ?`, args: [arg(rowKey(table, row))] },
  ]);
}

/** Copy every existing row from Lovable Cloud into Turso. */
export async function backfillAll(): Promise<{
  copied: Record<string, number>;
  errors: Record<string, string>;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await ensureSchema();

  const copied: Record<string, number> = {};
  const errors: Record<string, string> = {};
  const PAGE = 1000;

  for (const table of MIRRORED_TABLES) {
    try {
      let from = 0;
      let total = 0;
      for (;;) {
        const { data, error } = await supabaseAdmin
          .from(table)
          .select("*")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as Array<Record<string, unknown>>;
        if (!rows.length) break;
        await upsertRows(table, rows);
        total += rows.length;
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      copied[table] = total;
    } catch (e: any) {
      errors[table] = e?.message ?? String(e);
      copied[table] = copied[table] ?? 0;
    }
  }
  return { copied, errors };
}
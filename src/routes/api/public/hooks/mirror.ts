import { createFileRoute } from "@tanstack/react-router";

// Live mirror sink. Called by Postgres triggers (via pg_net) on every
// insert/update/delete, and manually for schema setup + full backfill.
//
// Auth: shared secret in the `x-mirror-secret` header.

export const Route = createFileRoute("/api/public/hooks/mirror")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.MIRROR_HOOK_SECRET;
        const provided =
          request.headers.get("x-mirror-secret") ?? request.headers.get("X-Mirror-Secret");
        if (!secret || provided !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
        }

        const mod = await import("@/lib/turso.server");

        try {
          const action = String(body?.action ?? "row");

          if (action === "ensure") {
            const tables = await mod.ensureSchema();
            return Response.json({ ok: true, tables });
          }

          if (action === "backfill") {
            const res = await mod.backfillAll();
            return Response.json({ ok: true, ...res });
          }

          const table = String(body?.table ?? "");
          const op = String(body?.op ?? "").toUpperCase();
          const row = body?.row ?? body?.old ?? null;

          if (!mod.isMirroredTable(table)) {
            return Response.json({ ok: false, error: `unknown table ${table}` }, { status: 400 });
          }
          if (!row || typeof row !== "object") {
            return Response.json({ ok: false, error: "missing row" }, { status: 400 });
          }

          if (op === "DELETE") {
            await mod.deleteRow(table, row);
          } else {
            await mod.upsertRows(table, [row]);
          }
          return Response.json({ ok: true, table, op });
        } catch (e: any) {
          console.error("turso mirror failed", e);
          return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
        }
      },
    },
  },
});
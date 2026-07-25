import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/backup-weekly")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { buildBackup, sendJsonDocument } = await import("@/lib/backup.server");

        const { data: supers, error } = await supabaseAdmin
          .from("telegram_bot_admins")
          .select("user_id, first_name, username")
          .eq("role", "super_admin");
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        if (!supers?.length) return Response.json({ ok: true, skipped: "no super admins" });

        const payload = await buildBackup();
        const filename = `telemanage-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        const totalRows = Object.values(payload.meta.row_counts).reduce((a, b) => a + b, 0);
        const caption =
          `🗄 <b>Weekly backup</b>\n` +
          `Generated: <code>${payload.generated_at}</code>\n` +
          `Rows: <b>${totalRows}</b> across ${Object.keys(payload.meta.row_counts).length} tables`;

        const results: Array<{ user_id: number; ok: boolean; error?: string }> = [];
        for (const s of supers as any[]) {
          try {
            await sendJsonDocument(s.user_id, filename, payload, caption);
            results.push({ user_id: s.user_id, ok: true });
          } catch (e: any) {
            results.push({ user_id: s.user_id, ok: false, error: e?.message ?? "unknown" });
          }
        }
        return Response.json({ ok: true, sent: results });
      },
    },
  },
});
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/broadcast-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("apikey") ?? request.headers.get("Apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || auth !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { tickBroadcasts } = await import("@/lib/broadcast.server");
        try {
          const res = await tickBroadcasts();
          return Response.json({ ok: true, ...res });
        } catch (e: any) {
          console.error("broadcast tick failed", e);
          return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
        }
      },
    },
  },
});
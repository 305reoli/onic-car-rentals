import { createFileRoute } from "@tanstack/react-router";

// Global Pays callback. Fail closed: without WEBHOOK_SECRET + CUTOFF (real modes) every call is ignored.
// The secret travels in the URL, is compared in constant time and scrubbed from logs. booking_id is optional:
// the panel route posts without it and the booking is resolved from the body's orderId.
export const Route = createFileRoute("/api/public/webhooks/globalpays")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gp = await import("@/services/globalpays.server");
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { settle, logPaymentEvent } = await import("@/services/instant.server");
        const { handleGpWebhook } = await import("@/services/gpWebhook.server");
        const cols = "id, created_at, provider_order_id, flow";
        return handleGpWebhook(request, {
          gp,
          findById: async (id) => (await db.from("prereservations").select(cols).eq("id", id).maybeSingle()).data,
          findByOrder: async (o) => (await db.from("prereservations").select(cols).eq("provider_order_id", o).maybeSingle()).data,
          settle: (id, p) => settle(db, id, p),
          log: (e) => logPaymentEvent(db, e),
        });
      },
    },
  },
});

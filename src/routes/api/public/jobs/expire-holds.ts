import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Scheduled: cancels card holds not approved before expires_at and emails the customer.
export const Route = createFileRoute("/api/public/jobs/expire-holds")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { expireDue } = await import("@/services/holds.server");
        const expired = await expireDue(supabaseAdmin);
        const { expireInstantHolds } = await import("@/services/instant.server");
        const instantExpired = await expireInstantHolds(supabaseAdmin);
        const { processCheckoutRecovery } = await import("@/services/checkout-recovery.server");
        const recovery = await processCheckoutRecovery(supabaseAdmin);
        return Response.json({ success: true, expired, instantExpired, recovery });
      },
    },
  },
});

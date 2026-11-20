import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Allowlisted cross-preview target for proofs; the default (empty body) always uses the configured production intake.
const RC_PREVIEW_INTAKE = "https://project--aabe2901-94c2-46e5-8018-bfc88a62d9b8-dev.lovable.app/api/public/fleet-sync";

// Prompt dispatcher for queued fleet events (bookings, blocked dates, availability, rule edits); run every minute by the managed schedule.
export const Route = createFileRoute("/api/public/jobs/fleet-flush")({
  server: { handlers: { POST: async ({ request }) => {
    const fail = await authenticateCronRequest(request);
    if (fail) return fail;
    const body = (await request.json().catch(() => ({}))) as { target?: unknown; vehicle_id?: unknown };
    const target = body.target === "sistemagestao_preview" ? RC_PREVIEW_INTAKE : undefined;
    const vehicleId = typeof body.vehicle_id === "string" && /^[0-9a-f-]{36}$/i.test(body.vehicle_id) ? body.vehicle_id : null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { flushFleetEvents } = await import("@/services/fleet-sync.server");
    return Response.json(await flushFleetEvents(supabaseAdmin, vehicleId, target));
  } } },
});

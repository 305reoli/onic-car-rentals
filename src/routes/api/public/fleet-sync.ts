import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/fleet-sync")({
  server: { handlers: { POST: async ({ request }) => {
    const { receiveFleetEvent } = await import("@/services/fleet-sync.server");
    return receiveFleetEvent(request, process.env["SISTEMAGESTAO_INTAKE_SECRET"], async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return supabaseAdmin;
    });
  } } },
});
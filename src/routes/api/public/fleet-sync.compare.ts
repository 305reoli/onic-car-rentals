import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/fleet-sync/compare")({
  server: { handlers: { POST: async ({ request }) => {
    const { respondCompare } = await import("@/services/fleet-check.server");
    return respondCompare(request, process.env["SISTEMAGESTAO_INTAKE_SECRET"], async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin);
  } } },
});

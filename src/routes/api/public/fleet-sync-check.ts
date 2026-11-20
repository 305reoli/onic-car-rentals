import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Manual (shared secret) or managed scheduled call. dry_run:true = read-only; false records the run and alerts the owner once if divergent.
export const Route = createFileRoute("/api/public/fleet-sync-check")({
  server: { handlers: { POST: async ({ request }) => {
    const { validFleetSecret, FLEET_AUTH_HEADER } = await import("@/services/fleet-sync");
    const bySecret = await validFleetSecret(request.headers.get(FLEET_AUTH_HEADER), process.env["SISTEMAGESTAO_INTAKE_SECRET"]);
    if (!bySecret) {
      const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
      const fail = await authenticateCronRequest(request);
      if (fail) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    let dryRun = true;
    try { dryRun = z.object({ dry_run: z.boolean() }).parse(JSON.parse(await request.text())).dry_run; } catch { return Response.json({ ok: false, error: "invalid_payload" }, { status: 400 }); }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runFleetCheck, liveCheckDeps } = await import("@/services/fleet-check.server");
    try { return Response.json(await runFleetCheck(await liveCheckDeps(supabaseAdmin), dryRun)); }
    catch { return Response.json({ ok: false, error: "check failed" }, { status: 503 }); }
  } } },
});

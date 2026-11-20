import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildBookingExport } from "@/lib/bookingExport";

export const bookingExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!allowed) throw new Error("Forbidden");
    const { data: r, error } = await context.supabase.from("prereservations").select("*").eq("id", data.id).single();
    if (error || !r) throw new Error("Booking not found");
    const [{ data: vehicle }, { data: city }] = await Promise.all([
      r.vehicle_id ? context.supabase.from("vehicles").select("slug, security_deposit_usd").eq("id", r.vehicle_id).maybeSingle() : Promise.resolve({ data: null }),
      context.supabase.from("cities").select("name").eq("slug", r.service_city || r.base_city || "").maybeSingle(),
    ]);
    return buildBookingExport(r, vehicle, city?.name ?? null);
  });
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createSchema } from "./booking-schema";

export const captureCheckout = createServerFn({ method: "POST" })
  .inputValidator((data: z.infer<typeof createSchema> & { documentCapability?: string }) => createSchema.extend({ documentCapability: z.string().length(64).optional() }).parse(data))
  .handler(async ({ data }) => {
    const { documentCapability } = await import("./document-ai.server");
    if (data.documents && await documentCapability(data.documents.folder) !== data.documentCapability) throw new Error("Invalid upload authorization");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { validateBooking } = await import("./booking-core.server");
    const { v, city, pickup, ret, q } = await validateBooking(db, data);
    const { data: row, error } = await db.from("checkout_captures").insert({
      first_name: data.driver.firstName, last_name: data.driver.lastName, email: data.driver.email, phone: data.driver.phone,
      vehicle_id: v.id, vehicle_name: v.name, vehicle_slug: v.slug, base_city: v.city, service_city: city.slug,
      pickup_at: pickup.toISOString(), return_at: ret.toISOString(), total_usd: q.total, language: data.language,
    }).select("token").single();
    if (error || !row) throw new Error("Capture unavailable");
    return row;
  });

export const listAbandonedCheckouts = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!admin) throw new Error("Forbidden");
  const { data, error } = await context.supabase.from("checkout_captures").select("id,status,first_name,last_name,email,phone,vehicle_name,vehicle_slug,base_city,service_city,pickup_at,return_at,total_usd,language,created_at,expires_at,recovery_sent_at,recovery_error").neq("status", "completed").order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return data ?? [];
});
export const deleteAbandonedCheckout = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Forbidden");
    const { error } = await context.supabase.from("checkout_captures").delete().eq("id", data.id).neq("status", "completed");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
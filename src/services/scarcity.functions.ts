import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { availableModelUnits, recentPaidCount } from "@/lib/scarcity";
import { modelKey } from "@/lib/discovery";
import { blockingFilter } from "@/lib/pricing";

/** Public aggregate only: never return booking rows, identities or payment details. */
export const getModelScarcity = createServerFn({ method: "GET" })
  .inputValidator((d: { vehicleId: string; pickup: string; ret: string }) => z.object({ vehicleId: z.string().uuid(), pickup: z.string().max(40), ret: z.string().max(40) }).parse(d))
  .handler(async ({ data }) => {
    const empty = { units: null as number | null, booked: null as number | null };
    const p = new Date(data.pickup), r = new Date(data.ret), now = new Date();
    if (!Number.isFinite(p.getTime()) || !Number.isFinite(r.getTime()) || r <= p) return empty;
    const { publicClient } = await import("./public-client.server");
    const pub = publicClient();
    const { data: target, error } = await pub.from("vehicles").select("id,brand,model,city,active,blocked_dates").eq("id", data.vehicleId).eq("active", true).maybeSingle();
    if (error || !target || !target.brand.trim() || !target.model.trim()) return empty;
    const fleet = await pub.from("vehicles").select("id,brand,model,city,active,blocked_dates").eq("city", target.city).eq("active", true).limit(1001);
    if (fleet.error || !fleet.data || fleet.data.length >= 1000) return empty;
    const units = fleet.data.filter(v => modelKey(v) === modelKey(target));
    const ids = units.map(v => v.id);
    if (!ids.length) return empty;
    // Private booking access is required to count overlaps; only the two aggregates leave this handler.
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const [overlaps, recent, remote] = await Promise.all([
      db.from("prereservations").select("vehicle_id,pickup_at,return_at,status,hold_until,created_at").in("vehicle_id", ids).or(blockingFilter(now)).lt("pickup_at", r.toISOString()).gt("return_at", p.toISOString()).limit(1001),
      db.from("prereservations").select("is_test,status,created_at,paid_amount_usd").in("vehicle_id", ids).eq("is_test", false).in("status", ["approved", "confirmed", "pending_approval"]).gt("paid_amount_usd", 0).gte("created_at", new Date(now.getTime() - 7 * 86400000).toISOString()).limit(1001),
      // SistemaGestao-reported blocks count as unavailable, exactly like search and booking checks.
      db.from("fleet_sync_remote_availability").select("site_vehicle_id,available,ranges").in("site_vehicle_id", ids),
    ]);
    const { remoteBlocks } = await import("./fleet-sync");
    const remoteBlocked = new Set((remote.data ?? []).filter(x => remoteBlocks(x, p, r)).map(x => x.site_vehicle_id));
    return {
      units: overlaps.error || !overlaps.data || overlaps.data.length >= 1000 || remote.error ? null : availableModelUnits(units, overlaps.data, target, data.pickup, data.ret, now, remoteBlocked),
      booked: recent.error || !recent.data || recent.data.length >= 1000 ? null : recentPaidCount(recent.data, now),
    };
  });

/** Capability-scoped lookup: a draft/expiry is not a stock hold. */
export const getCheckoutStockHold = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string; vehicleId: string; pickup: string; ret: string }) => z.object({ token: z.string().min(20).max(100), vehicleId: z.string().uuid(), pickup: z.string().max(40), ret: z.string().max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await db.from("prereservations").select("status,hold_until,pickup_at,return_at").eq("token", data.token).eq("vehicle_id", data.vehicleId).maybeSingle();
    if (error || !row || row.status !== "checkout_hold" || !row.hold_until || new Date(row.pickup_at).getTime() !== new Date(data.pickup).getTime() || new Date(row.return_at).getTime() !== new Date(data.ret).getTime()) return null;
    return { status: row.status, holdUntil: row.hold_until, serverNow: new Date().toISOString() };
  });
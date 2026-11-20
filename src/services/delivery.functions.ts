import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { deliverySchema } from "./booking-schema";
import { deliveryDestination } from "@/lib/deliveryCity";

/** Checkout preview of the delivery price (same server rules as booking; the booking recomputes anyway). */
export const quoteDelivery = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ vehicleId: z.string().uuid(), serviceCity: z.string().max(60), delivery: deliverySchema }).parse(d))
  .handler(async ({ data }) => {
    const { publicClient } = await import("./public-client.server");
    const db = publicClient();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveDelivery } = await import("./delivery.server");
    const [{ data: v }, { data: st }] = await Promise.all([
      supabaseAdmin.from("vehicles").select("body_category, delivery_tier_override, city, delivery_pricing, allows_one_way").eq("id", data.vehicleId).eq("active", true).maybeSingle(),
      db.from("settings").select("delivery_config").eq("id", 1).maybeSingle(),
    ]);
    if (!v) throw new Error("Car not available");
    // Display final fixed option fees only; booking recomputes through resolveDelivery.
    const { deliveryLegPrice, effectiveDeliveryPrices, deliveryCities } = await import("@/lib/pricing");
    const optionPrices: Record<string, { pickup: number | null; airport: number | null; address: number | null }> = {};
    const addressFee = effectiveDeliveryPrices(v, st?.delivery_config).ownCityAddress;
    for (const direction of ["pickup", "return"] as const) {
      for (const city of deliveryCities(v.city)) {
        const fees = { pickup: null, airport: null, address: null } as { pickup: number | null; airport: number | null; address: number | null };
        for (const type of ["pickup", "airport", "address"] as const) {
          try {
            const p = deliveryLegPrice(v, { city, type }, direction, null, st?.delivery_config);
            fees[type] = type === "address" && city === v.city ? addressFee : p.fee;
          } catch { /* Unsupported options stay unpriced; existing UI restrictions apply. */ }
        }
        optionPrices[`${direction}:${city}`] = fees;
      }
    }
    const destination = deliveryDestination(data.serviceCity, data.delivery);
    const { data: city } = await db.from("cities").select("slug").eq("slug", destination).maybeSingle();
    if (!city) return { ok: false as const, error: "DELIVERY_CITY" };
    try {
      const r = await resolveDelivery(v, city.slug, data.delivery, st?.delivery_config);
      return { ok: true as const, status: r.status, itemizedFee: r.itemizedFee, embeddedFee: r.embeddedFee, cross: r.cross, label: r.label, legs: r.legs ?? null, optionPrices };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "ERROR", optionPrices };
    }
  });

/** Address autocomplete (Google Places, server-side). Empty list when no key is configured. */
export const suggestDeliveryAddress = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(3).max(120), city: z.enum(["orlando", "miami", "tampa", "fort-lauderdale"]), sessionToken: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { suggestAddresses } = await import("./distance.server");
    const { crossConfig } = await import("@/lib/pricing");
    const { publicClient } = await import("./public-client.server");
    const db = publicClient();
    const { data: st } = await db.from("settings").select("delivery_config").eq("id", 1).maybeSingle();
    const center = crossConfig((st?.delivery_config as { cross?: unknown } | null)?.cross).centers[data.city];
    return suggestAddresses(data.q, center, data.sessionToken);
  });

/** Short-lived signed checkout session authenticates bounded Maps requests without customer account signup. */
export const beginDeliverySession = createServerFn({ method: "POST" }).handler(async () => {
  const { startMapsSession } = await import("./distance.server");
  await startMapsSession(); return { ready: true };
});

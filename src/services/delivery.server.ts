// Authoritative delivery pricing (server-only). Both local and inter-city fees are itemized before tax.
import type { DeliveryChoice } from "./booking-schema";
import { deliveryConfig, sameCityDeliveryOnly, deliveryTier, roundMi, deliveryLegPrice, bookingBase, applyMcoPair, type DeliveryLeg, type CrossMode } from "@/lib/pricing";
import { distanceFrom } from "./distance.server";
import { deliveryDestination } from "@/lib/deliveryCity";

type Car = import("@/lib/pricing").DeliveryCar;
export type DeliveryResolution = {
  legs?: (DeliveryLeg & { direction: "pickup" | "return"; status: "priced" | "quote_pending"; fee: number | null; fixedFee: number | null; localFee: number | null; interCity: boolean; distanceMi: number | null })[];
  status: "priced" | "quote_pending";
  itemizedFee: number;      // separate "Delivery" line (same city)
  embeddedFee: number;      // cross-city logistics fee folded into the daily price
  cross: boolean;
  label: { city: string; type: DeliveryChoice["type"]; mode: CrossMode | null; airportMode: "one_way" | "round_trip" | null; airport: string | null; distanceMi: number | null };
  row: Record<string, unknown>;
  quoteReason: string | null;
};

export async function resolveDelivery(v: Car, serviceCity: string, choice: DeliveryChoice, rawCfg: unknown): Promise<DeliveryResolution> {
  if (choice.pickupLeg) return resolveLegs(v, choice, rawCfg);
  // Legacy single-location callers use the same authoritative per-leg model.
  serviceCity = deliveryDestination(serviceCity, choice);
  const result = await resolveLegs(v, { ...choice, pickupLeg: { city: serviceCity, type: choice.type, address: choice.address }, sameReturn: true }, rawCfg, false);
  if (choice.mode === "delivery" || choice.mode === "collection" || choice.airportMode === "one_way") {
    const leg = result.legs?.find(l => l.direction === (choice.mode === "collection" ? "return" : "pickup"));
    if (leg) return { ...result, legs: [leg], itemizedFee: leg.fee ?? 0, row: { ...result.row, delivery_fee_usd: leg.fee } };
  }
  return result;
}

async function resolveLegs(v: Car, choice: DeliveryChoice, raw: unknown, requireSelection = true): Promise<DeliveryResolution> {
  const pickup = choice.pickupLeg;
  if (!pickup) throw new Error("DELIVERY_CITY");
  const ret = choice.sameReturn !== false ? pickup : choice.returnLeg;
  if (!ret) throw new Error("DELIVERY_CITY");
  if (v.allows_one_way === false && ret.city !== pickup.city) throw new Error("ONE_WAY_DISABLED");
  const cfg = deliveryConfig(raw);
  const legs: NonNullable<DeliveryResolution["legs"]> = [];
  for (const [direction, leg] of [["pickup", pickup], ["return", ret]] as const) {
    // Validate restrictions before any billable distance call.
    deliveryLegPrice(v, leg, direction, null, raw);
    let distanceMi: number | null = null;
    const base = cfg.bases[bookingBase(leg.city)];
    const airport = cfg.airports[leg.city];
    if (!base) throw new Error("DELIVERY_CITY");
    if (leg.type === "address" && (!leg.address || requireSelection && !leg.placeId)) throw new Error("DELIVERY_ADDRESS");
    if (direction === "return" && choice.sameReturn !== false && legs[0]) distanceMi = legs[0].distanceMi;
    else if (leg.type === "address" && leg.city === v.city) {
      const d = await distanceFrom(base, leg.type === "address" ? { address: leg.address, placeId: leg.placeId, sessionToken: leg.sessionToken } : { point: airport, airportCode: airport?.code });
      if (d.ok) distanceMi = roundMi(d.miles);
    }
    legs.push({ ...leg, direction, distanceMi, ...deliveryLegPrice(v, leg, direction, distanceMi, raw) });
  }
  legs.splice(0, 2, ...applyMcoPair(v.city, legs));
  const pending = legs.some(l => l.status === "quote_pending"), fee = legs.reduce((sum, l) => sum + (l.fee ?? 0), 0);
  const location = (l: DeliveryLeg) => l.type === "pickup" ? cfg.bases[l.city]?.address : l.type === "airport" ? cfg.airports[l.city]?.terminal : l.address;
  return { legs, status: pending ? "quote_pending" : "priced", itemizedFee: fee, embeddedFee: 0, cross: legs.some(l => l.interCity), label: { city: v.city, type: pickup.type, mode: null, airportMode: null, airport: cfg.airports[pickup.city]?.code ?? null, distanceMi: legs[0]?.distanceMi ?? null }, row: { delivery_type: pickup.type, delivery_tier: deliveryTier(v), delivery_address: location(pickup), delivery_status: pending ? "quote_pending" : "priced", delivery_fee_usd: pending ? null : fee, pickup_location: location(pickup), return_location: location(ret) }, quoteReason: pending ? "Delivery quote needed: per-leg distance or route fee requires owner confirmation" : null };
}

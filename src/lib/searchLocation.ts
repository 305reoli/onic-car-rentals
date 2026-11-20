// Maps the hero/search "loc" key to a checkout delivery leg and its existing fixed fee (display only).
import { bookingBase, computeQuote, deliveryConfig, deliveryLegPrice, deliveryTier, effectiveDeliveryPrices, matchingFees, effectiveMinDays, mcoRoundTripFree, DEFAULT_SETTINGS, type DeliveryLeg } from "@/lib/pricing";

type Car = Parameters<typeof deliveryLegPrice>[0];

/** "mco"/"mia" → airport, "hotel" → address, anything else (base keys) → base pickup. */
export function locLeg(loc: string | undefined, city: string, raw: unknown): DeliveryLeg | null {
  if (!loc) return null;
  const c = bookingBase(city);
  const code = deliveryConfig(raw).airports[c]?.code?.toLowerCase();
  if (code && loc.toLowerCase() === code) return { city: c, type: "airport" };
  if (loc === "hotel") return { city: c, type: "address" };
  return { city: c, type: "pickup" };
}

/** Per-leg fee for the searched place using the existing fixed delivery pricing; null when the car can't serve it. */
export function locFee(v: Car, loc: string | undefined, raw: unknown): { type: DeliveryLeg["type"]; fee: number; upTo25?: boolean } | null {
  const leg = locLeg(loc, v.city, raw);
  if (!leg || leg.city !== v.city) return null;
  try {
    if (leg.type === "address") return { type: "address", fee: effectiveDeliveryPrices(v, raw).ownCityAddress, upTo25: true };
    // The search location is the same place for pickup AND return, so the Orlando MCO pair rule applies (both legs free).
    if (mcoRoundTripFree(v.city, leg, leg)) return { type: leg.type, fee: 0 };
    const p = deliveryLegPrice(v, leg, "pickup", null, raw);
    return p.fee == null ? null : { type: leg.type, fee: p.fee };
  } catch { return null; }
}

/** Total for the searched dates: rental + mandatory daily lines + mandatory fees + tax (no optional add-ons/delivery). */
export function datedTotal(v: Car & { daily_price_usd: number | null; prereservation_amount_usd: number | null }, pickup: string | undefined, ret: string | undefined, settings: unknown, serviceCity: string) {
  if (!pickup || !ret || v.daily_price_usd == null) return null;
  const st = (settings ?? {}) as Record<string, unknown>;
  const raw = st["delivery_config"];
  const exotic = deliveryTier(v) === "exotic";
  try {
    const custom = matchingFees(deliveryConfig(raw).custom_fees, { body_category: v.body_category, exotic }, serviceCity);
    const q = computeQuote(v, new Date(pickup), new Date(ret), { insurance: false, hotelCheckin: false, luggageCar: false }, { ...DEFAULT_SETTINGS, ...st } as never, 0, 0, { exotic, fees: deliveryConfig(raw).fees, customFees: custom, chosenFees: [], minDays: effectiveMinDays(v as never, st["min_days_by_category"]).n });
    return q.total == null ? null : { total: q.total, days: q.days, dailyRate: q.dailyRate, durationPct: q.durationPct, decemberDays: q.decemberDays };
  } catch { return null; }
}

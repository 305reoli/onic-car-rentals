import { applyMcoPair, bookingBase, type DeliveryLeg } from "./pricing";

/** Per-option fees for this car as computed server-side by `deliveryLegPrice` (includes the car's private overrides). Key: `${direction}:${city}`. */
export type OptionPrices = Record<string, { pickup: number | null; airport: number | null; address: number | null }>;
export type PreviewLeg = DeliveryLeg & { direction: "pickup" | "return"; fee: number | null; fixedFee: number | null; localFee: number | null; interCity: boolean; status: "priced" | "quote_pending" };

/**
 * Fee to show the moment a leg is selected, before the server quote returns.
 * Fixed-fee options (base, airport, served city, other base city, exotic own-city) come straight from the table;
 * an own-city typed address (exotics included) depends on distance (≤25 mi fixed fee, beyond = confirm), so it waits for the quote.
 */
export function previewLegFee(prices: OptionPrices, leg: DeliveryLeg, direction: "pickup" | "return", carCity: string, sameCityOnly: boolean): number | null {
  if (leg.type === "address" && leg.city === carCity) return null;
  return prices[`${direction}:${leg.city}`]?.[leg.type] ?? null;
}

export function previewLegs(p: { pickup: DeliveryLeg; ret: DeliveryLeg; prices: OptionPrices; carCity: string; sameCityOnly: boolean }) {
  const legs: PreviewLeg[] = applyMcoPair(p.carCity, (["pickup", "return"] as const).map((direction) => {
    const leg = direction === "pickup" ? p.pickup : p.ret;
    const fee = previewLegFee(p.prices, leg, direction, p.carCity, p.sameCityOnly);
    const other = leg.city !== p.carCity;
    return { ...leg, direction, fee, fixedFee: other ? fee : 0, localFee: other ? 0 : fee, interCity: bookingBase(leg.city) !== p.carCity, status: fee == null ? "quote_pending" : "priced" };
  }));
  return { legs, fee: legs.reduce((s, l) => s + (l.fee ?? 0), 0), pending: legs.some((l) => l.fee == null) };
}

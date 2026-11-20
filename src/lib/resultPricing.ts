import { effectiveMinDays, rentalDays } from "./pricing";
import { datedTotal } from "./searchLocation";
import { hasDailyPrice, type Vehicle } from "./vehicles";

export type ResultPriceContext = { pickup?: string | undefined; ret?: string | undefined; settings?: unknown; serviceCity?: string | undefined };

/** Minimum-day eligibility only; does not deduplicate or change availability. */
export function meetsResultMinimum(v: Vehicle, context: ResultPriceContext): boolean {
  if (!hasDailyPrice(v) || !context.pickup || !context.ret) return true;
  const days = rentalDays(new Date(context.pickup), new Date(context.ret));
  if (!days) return true; // invalid dates remain the existing date-validation path
  const settings = context.settings as { min_days_by_category?: unknown } | undefined;
  return days >= effectiveMinDays(v, settings?.min_days_by_category).n;
}

/** Sort by the same dated total rendered on cards; unknown totals stay last in both directions. */
export function sortResultPrices(cars: Vehicle[], direction: "asc" | "desc", context: ResultPriceContext): Vehicle[] {
  const rows = cars.map(v => ({ v, price: !hasDailyPrice(v) ? null : context.pickup && context.ret
    ? datedTotal(v, context.pickup, context.ret, context.settings, context.serviceCity ?? v.city)?.total ?? null
    : Number(v.daily_price_usd) }));
  rows.sort((a, b) => a.price == null ? b.price == null ? 0 : 1 : b.price == null ? -1 : direction === "asc" ? a.price - b.price : b.price - a.price);
  return rows.map(row => row.v);
}
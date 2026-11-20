import { sameSubstituteCategory } from "./pricing";
import type { BookingSearch } from "./search";
import type { Vehicle } from "./vehicles";

export const showSimilarModels = (pickup: string | undefined, ret: string | undefined, bookedIssue: boolean) => !!pickup && !!ret && bookedIssue;

/** Availability IDs come only from unavailableQuery/getUnavailableIds (shared pricing rules + remote blocks). */
export function similarModels(cars: Vehicle[], current: Pick<Vehicle, "id" | "city" | "body_category">, unavailable: string[] | undefined) {
  if (!unavailable) return [];
  const blocked = new Set(unavailable);
  return cars.filter(v => v.active && v.id !== current.id && v.city === current.city && sameSubstituteCategory(current.body_category, v.body_category) && !blocked.has(v.id))
    .sort((a, b) => (a.daily_price_usd && a.daily_price_usd > 0 ? a.daily_price_usd : Infinity) - (b.daily_price_usd && b.daily_price_usd > 0 ? b.daily_price_usd : Infinity) || a.name.localeCompare(b.name));
}
export const similarCardLink = (lang: string, v: Pick<Vehicle, "city" | "slug">, search: BookingSearch) => ({
  to: "/$lang/cars/$city/$slug" as const, params: { lang, city: v.city, slug: v.slug }, search: { ...search, similarTo: undefined },
});
export const similarFleetLink = (lang: string, v: Pick<Vehicle, "id" | "city" | "body_category">, search: BookingSearch) => ({
  to: "/$lang/catalog/$city/$category" as const, params: { lang, city: v.city, category: v.body_category }, search: { ...search, similarTo: v.id },
});
import { inCategory, PUBLIC_CATEGORIES, type Vehicle, type CityRow } from "@/lib/vehicles";
import { discoveryKey, slugify } from "@/lib/publicRoutes";
import { servesCity, crossConfig } from "@/lib/pricing";

export type CatalogCar = Pick<Vehicle, "id" | "name" | "brand" | "model" | "city" | "slug" | "body_category" | "is_convertible" | "daily_price_usd" | "active">;
export type DiscoveryGroup = { kind: "category" | "brand" | "model"; city: string; key: string; label: string; path: string; ids: string[] };
export const modelLabel = (v: Pick<CatalogCar, "brand" | "model">) => v.model.toLowerCase().startsWith(v.brand.toLowerCase()) ? v.model : `${v.brand} ${v.model}`;
export const modelKey = (v: Pick<CatalogCar, "brand" | "model">) => slugify(modelLabel(v));
export function lowestDaily(cars: Pick<CatalogCar, "daily_price_usd">[]): number | null {
  const prices = cars.flatMap((v) => v.daily_price_usd == null ? [] : [Number(v.daily_price_usd)]).filter(Number.isFinite);
  return prices.length ? Math.min(...prices) : null;
}
/** Group active rows only, scoped to one base city; never merge or deduplicate units. */
export function discoveryGroups(cars: CatalogCar[]): DiscoveryGroup[] {
  const out: DiscoveryGroup[] = [];
  for (const city of ["orlando", "miami"]) {
    const fleet = cars.filter((v) => v.active && v.city === city);
    for (const cat of PUBLIC_CATEGORIES) {
      const units = fleet.filter((v) => inCategory(v, cat));
      if (units.length) out.push({ kind: "category", city, key: cat, label: cat, path: `${city}/${cat}`, ids: units.map((v) => v.id) });
    }
    for (const kind of ["brand", "model"] as const) {
      const groups = new Map<string, CatalogCar[]>();
      for (const v of fleet) {
        const key = kind === "brand" ? slugify(v.brand) : modelKey(v);
        const units = groups.get(key) ?? []; units.push(v); groups.set(key, units);
      }
      for (const [key, units] of groups) {
        const first = units[0];
        if (first && key) out.push({ kind, city, key, label: kind === "brand" ? first.brand : modelLabel(first), path: discoveryKey(kind, city, key), ids: units.map((v) => v.id) });
      }
    }
  }
  return out;
}
/** Service pages use only their configured base fleet and existing server pricing eligibility. */
export function landingFleet<T extends CatalogCar>(cars: T[], city: Pick<CityRow, "slug" | "fleet_from_city">, delivery: unknown): T[] {
  const cfg = crossConfig((delivery as { cross?: unknown } | null)?.cross);
  return cars.filter((v) => v.active && v.city === (city.fleet_from_city || city.slug) && servesCity(v.city, city.slug, v, cfg));
}
import { aeoUi, fmt, type Lang } from "./i18n";
import { publicPath, slugify } from "./publicRoutes";
import type { Vehicle, CityRow } from "./vehicles";

export const brandHubKey = (city: string, brand: string) => `brand-hub/${city}/${slugify(brand)}`;
export function brandHubs(cars: Vehicle[], cities: CityRow[]) {
  return cities.flatMap(city => {
    // Hubs describe cars physically based in this city; service-area pages retain their existing fleet rules.
    if (city.fleet_from_city && city.fleet_from_city !== city.slug) return [];
    const fleet = cars.filter(v => v.active && v.city === (city.fleet_from_city || city.slug));
    return [...new Set(fleet.map(v => v.brand))].filter(Boolean).map(brand => ({ city, brand, key: slugify(brand), path: brandHubKey(city.slug, brand), cars: fleet.filter(v => v.brand === brand) }));
  });
}
/** Never change, truncate or manufacture the supplied price to satisfy a length target. */
export const carMeta = (lang: Lang, car: string, city: string, price: number | null) => fmt(price == null ? aeoUi[lang].carNoPrice : aeoUi[lang].carMeta, { car, city, price: price ?? "" });
export function editorialMeta(text: string, lang: Lang): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length >= 140 && clean.length <= 160) return clean;
  if (clean.length < 140) {
    return editorialMeta(clean + aeoUi[lang].editorialSuffix, lang);
  }
  if (clean.length > 160) {
    const sentence = clean.slice(0, 159).replace(/\s+\S*$/, "").replace(/[,:;.]$/, "");
    if (sentence.length >= 139) return sentence + ".";
  }
  return clean;
}
/** Legacy root query URLs only; clean/transactional routes are never intercepted. */
export function legacyCarTarget(url: URL, cars: Pick<Vehicle, "active" | "slug" | "city">[], cities: Pick<CityRow, "slug" | "fleet_from_city">[]): string | null {
  if (!["/", "/pt", "/en", "/es"].includes(url.pathname)) return null;
  const marker = [...url.searchParams.entries()].find(([key]) => /^carros-\d+$/.test(key));
  if (!marker) return null;
  const lang: Lang = url.pathname === "/en" ? "en" : url.pathname === "/es" ? "es" : "pt";
  const requested = url.searchParams.get("city") ?? url.searchParams.get("cidade");
  const city = cities.find(c => c.slug === requested) ?? cities.find(c => c.slug === "orlando") ?? cities[0];
  if (!city) return null;
  const base = city.fleet_from_city || city.slug;
  const matches = cars.filter(v => v.active && v.slug === marker[1]);
  const car = matches.find(v => v.city === base) ?? (!requested ? matches[0] : undefined);
  return car ? publicPath(lang, `cars/${car.city}/${car.slug}`) : publicPath(lang, city.slug);
}
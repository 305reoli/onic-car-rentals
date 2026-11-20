import type { Database } from "@/integrations/supabase/types";
import { ownerText, fmt, type Lang } from "./i18n";
import { modelDescriptions } from "@/data/modelContent";

/** Full row — admin only. */
export type AdminVehicle = Database["public"]["Tables"]["vehicles"]["Row"];
/** Public car data: internal ownership/confirmation columns are never read or sent to visitors. */
export type Vehicle = Omit<AdminVehicle, "owner_type" | "confirmation_type" | "review_category" | "instant_full_booking" | "delivery_pricing"> & { svc?: ServiceInfo | undefined };
export const PUBLIC_VEHICLE_COLUMNS =
  "id, slug, name, brand, model, city, catalog_group, category, body_category, payment_mode, is_convertible, color, seats, bags, doors, hp, transmission, daily_price_usd, min_days, mileage_limit, extra_mile_price_usd, min_age, security_deposit_usd, prereservation_amount_usd, description_en, description_pt, description_es, highlights, highlights_pt, highlights_es, photos, blocked_dates, is_sample, sort_order, active, created_at, updated_at, insurance_override, delivery_tier_override, allows_one_way";
/** Service-city pricing attached by getVehicles({ city }) (cross-city fee embedded in the daily price). */
export type ServiceInfo = { cross: boolean; fee: number | null; quote: boolean; fromDaily: number | null; referenceDays: number };
/** Local fleet first: hide another fleet's car when the same model exists locally and is available. */
/** "Local" = the city's designated fleet (Tampa → Orlando, Fort Lauderdale → Miami); same model = same public name. */
export function dedupeCrossFleet<T extends { id: string; city: string; name: string; svc?: ServiceInfo | undefined }>(cars: T[], unavailable: string[] = [], localFleet?: string) {
  const key = (v: T) => v.name.toLowerCase().replace(/\s+/g, " ").trim();
  const isLocal = (v: T) => (localFleet ? v.city === localFleet : !v.svc?.cross);
  const local = new Set(cars.filter((v) => isLocal(v) && !unavailable.includes(v.id)).map(key));
  return cars.filter((v) => isLocal(v) || !local.has(key(v)));
}
export type CityRow = Database["public"]["Tables"]["cities"]["Row"];
export type DeliveryLocation = { key: string; en: string; pt: string; es: string };
export const CATEGORIES = ["economy", "family", "luxury_suv", "sport", "exotic"] as const;
export type Category = (typeof CATEGORIES)[number];
/** Public categories in fixed display order. "convertible" is a tag: a car shows in its primary section AND in Convertible. */
export const PUBLIC_CATEGORIES = ["suv", "sedan", "luxury", "convertible", "sports", "exotics"] as const;
export type PublicCategory = (typeof PUBLIC_CATEGORIES)[number];
export const PRIMARY_CATEGORIES = PUBLIC_CATEGORIES.filter((c) => c !== "convertible");
export const inCategory = (v: Pick<Vehicle, "body_category" | "is_convertible">, c: string) =>
  c === "convertible" ? v.is_convertible : v.body_category === c;

/** Seed photos live in /public; uploaded photos live in private storage served via the photo proxy route. */
export function photoUrl(p: string | undefined | null) {
  if (!p) return "/images/car-placeholder.svg";
  if (p.startsWith("/") || p.startsWith("http")) return p;
  return `/api/public/photo/${p.split("/").map(encodeURIComponent).join("/")}`;
}

/** Responsive srcset for CDN-hosted photos (the asset CDN resizes on `?w=` and serves AVIF/WebP by Accept). Other URLs get no srcset. */
export function photoSrcSet(p: string | undefined | null, widths: number[]) {
  const u = photoUrl(p);
  if (!u.startsWith("/__l5e/")) return undefined;
  return widths.map((w) => `${u}?w=${w}&q=75 ${w}w`).join(", ");
}
export const sizedPhoto = (p: string | undefined | null, w: number) => { const u = photoUrl(p); return u.startsWith("/__l5e/") ? `${u}?w=${w}&q=75` : u; };
export const CARD_SIZES = "(min-width: 1024px) 25vw, (min-width: 640px) 45vw, 80vw";
export const GALLERY_SIZES = "(min-width: 1024px) 60vw, 100vw";
export const GALLERY_WIDTHS = [480, 828, 1200, 1600];

export function description(v: Vehicle, lang: Lang) {
  return modelDescriptions[`${v.brand} ${v.model}`]?.[lang] ?? ((lang === "pt" ? v.description_pt : lang === "es" ? v.description_es : v.description_en) || v.description_en);
}

export function cityDescription(c: CityRow, lang: Lang) {
  return (lang === "pt" ? c.description_pt : lang === "es" ? c.description_es : c.description_en) || c.description_en;
}

export function cityLocations(c: CityRow | undefined): DeliveryLocation[] {
  return Array.isArray(c?.delivery_locations) ? (c!.delivery_locations as unknown as DeliveryLocation[]) : [];
}

export const locationLabel = (c: CityRow | undefined, key: string, lang: Lang) =>
  cityLocations(c).find((l) => l.key === key)?.[lang] ?? key;

/** Public mileage text: "unlimited" key → translated label; empty → on request. */
export const mileageLabel = (m: string, tr: { car: { unlimited: string; onRequest: string } }) => (m === "unlimited" ? tr.car.unlimited : m || tr.car.onRequest);

/** Base city whose vehicles a city page lists (Tampa → Orlando, etc.). */
export const fleetCityOf = (c: CityRow | undefined) => (c?.fleet_from_city || c?.slug || "");
/** Service city for a car: the requested city when it is served by the car's base fleet, otherwise the base city. */
export function resolveServiceCity(cities: CityRow[], requested: string | undefined, baseCity: string): CityRow | undefined {
  const req = requested ? cities.find((c) => c.slug === requested) : undefined;
  // Any active city may be requested: cross-fleet service (both directions) is decided by the matrix, and the server re-checks servesCity.
  if (req) return req;
  return cities.find((c) => c.slug === baseCity);
}
export const cityName = (cities: CityRow[], slug: string) => cities.find((c) => c.slug === slug)?.name ?? slug;

/** Key features in the visitor's language (falls back to English when a translation is missing). */
export function highlightsFor(v: Pick<Vehicle, "highlights" | "highlights_pt" | "highlights_es">, lang: Lang) {
  const t = lang === "pt" ? v.highlights_pt : lang === "es" ? v.highlights_es : null;
  return t && t.length ? t : v.highlights;
}

/** Home showcase: up to `n` random Exotics + Luxury cars with a photo, weighted 2:1 toward Exotics. */
export function pickFeatured<T extends Pick<Vehicle, "body_category" | "photos">>(all: T[], n = 8, rand: () => number = Math.random): T[] {
  const pool = all.filter((v) => (v.body_category === "exotics" || v.body_category === "luxury") && v.photos.length > 0)
    .map((v) => ({ v, w: v.body_category === "exotics" ? 2 : 1 }));
  const out: T[] = [];
  while (out.length < n && pool.length) {
    let x = rand() * pool.reduce((s, p) => s + p.w, 0);
    let i = 0;
    while (i < pool.length - 1 && (x -= pool[i]!.w) > 0) i++;
    out.push(pool.splice(i, 1)[0]!.v);
  }
  return out;
}

export const isPublicCategory = (c: string): c is PublicCategory => (PUBLIC_CATEGORIES as readonly string[]).includes(c);

/** Price high → low; "price on request" cars go last. */
export const byPriceDesc = (a: Pick<Vehicle, "daily_price_usd">, b: Pick<Vehicle, "daily_price_usd">) =>
  (b.daily_price_usd ?? -1) - (a.daily_price_usd ?? -1);

/** Tile cover for a city × category: owner override, else first photo of the most expensive car with a photo. */
export function categoryCover(city: Pick<CityRow, "category_covers"> | undefined, cars: Vehicle[], cat: string): string | null {
  const o = (city?.category_covers as Record<string, string> | null | undefined)?.[cat];
  if (o) return o;
  const top = cars.filter((v) => inCategory(v, cat) && v.photos.length > 0).sort(byPriceDesc)[0];
  return top?.photos[0] ?? null;
}

/** Preview-safe defaults: never overwrite an existing admin deposit or historical booking. */
export function defaultRegularDeposit(v: { security_deposit_usd: number | null; body_category: string; daily_price_usd: number | null; name: string }): number | null {
  if (v.security_deposit_usd != null) return v.security_deposit_usd;
  if (["exotics", "sports"].includes(v.body_category)) return null;
  if (/macan|bmw x[35]/i.test(v.name) || v.body_category === "luxury") return 250;
  return v.daily_price_usd != null && v.daily_price_usd <= 99 ? 150 : 250;
}
export function withDepositDefault<T extends { security_deposit_usd: number | null; body_category: string; daily_price_usd: number | null; name: string }>(v: T): T {
  return { ...v, security_deposit_usd: defaultRegularDeposit(v) };
}
/** Per-unit extra-mile price (USD); falls back to the standard US$ 7/mile. */
export function extraMilePrice(v: { extra_mile_price_usd?: number | null }): number {
  const o = v.extra_mile_price_usd == null ? null : Number(v.extra_mile_price_usd);
  return o != null && Number.isFinite(o) && o >= 0 ? o : 7;
}
export function carMileageLine(v: { body_category: string; mileage_limit?: string; extra_mile_price_usd?: number | null }, lang: Lang): string {
  const tx = ownerText[lang];
  if (!["exotics", "sports"].includes(v.body_category)) return tx.unlimited;
  const allowance = v.mileage_limit?.trim() ?? "";
  const m = allowance.match(/^(\d+(?:[–-]\d+)?)(?:\s*(?:mi|miles?)\s*\/\s*day)?$/i);
  const daily = m && (lang !== "en" || allowance === m[1]) ? fmt(tx.milesDaily, { n: m[1]! }) : allowance;
  return [daily, fmt(tx.extraTpl, { n: String(extraMilePrice(v)) })].filter(Boolean).join(" · ");
}
/** Unit data only: no model-level assumptions or absent field placeholders. */
export function carSpecs(v: { hp?: number | null; color?: string; transmission?: string }, lang: Lang): [string, string][] {
  const tx = ownerText[lang];
  return [v.hp ? [tx.hp, `${v.hp} hp`] : null, v.color?.trim() ? [tx.color, v.color.trim()] : null, v.transmission?.trim() ? [tx.transmission, v.transmission.trim()] : null].filter((row): row is [string, string] => row !== null);
}
export function filterFleet<T extends { seats: number | null; daily_price_usd: number | null }>(cars: T[], seats: string, sort: "default" | "asc" | "desc"): T[] {
  const filtered = seats ? cars.filter(v => v.seats != null && v.seats >= Number(seats)) : [...cars];
  if (sort === "default") return filtered;
  return filtered.sort((a,b) => a.daily_price_usd == null ? b.daily_price_usd == null ? 0 : 1 : b.daily_price_usd == null ? -1 : sort === "asc" ? a.daily_price_usd-b.daily_price_usd : b.daily_price_usd-a.daily_price_usd);
}

/** Display-only deductible, never a fee added to the quote or a security deposit. */
export function insuranceDeductible(v: { name: string; body_category: string; insurance_deductible_usd?: number | null }): number {
  const override = v.insurance_deductible_usd;
  if (override != null && Number.isFinite(override) && override >= 0) return override;
  const premium = ["luxury", "sports", "exotics"].includes(v.body_category)
    || /macan|cayenne|bmw x[3-7]|tahoe|expedition|escalade|suburban|wagoneer|defender|range rover|gls|g63|g550|urus|bentayga|cullinan|model x/i.test(v.name);
  return premium ? 2500 : 1500;
}
export function insuranceDeductibleAmount(v: Parameters<typeof insuranceDeductible>[0], lang: Lang): string {
  return `US$ ${insuranceDeductible(v).toLocaleString(lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US", { maximumFractionDigits: 0 })}`;
}
export function insuranceDeductibleLine(v: Parameters<typeof insuranceDeductible>[0], lang: Lang): string {
  return `${ownerText[lang].deductible}: ${insuranceDeductibleAmount(v, lang)}`;
}

/** A car is bookable online only with a positive daily price; null/undefined/0/negative = "Price on request" (WhatsApp only, never $0). */
export const hasDailyPrice = (v: { daily_price_usd?: number | string | null | undefined } | null | undefined) => {
  const n = v?.daily_price_usd == null || v.daily_price_usd === "" ? NaN : Number(v.daily_price_usd);
  return Number.isFinite(n) && n > 0;
};

// Which cars a service city lists: its own fleet + other fleets' cars whose matrix cell is offered for their tier.
import { allInPrice, crossCell, crossConfig, crossPrice } from "@/lib/pricing";
import type { Vehicle } from "@/lib/vehicles";

export type ServiceInfo = { cross: boolean; fee: number | null; quote: boolean; fromDaily: number | null; referenceDays: number };

export function enrichForCity<T extends Vehicle>(cars: T[], city: { slug: string; fleet_from_city: string | null }, rawCfg: unknown): (T & { svc: ServiceInfo })[] {
  const cross = crossConfig((rawCfg as { cross?: unknown } | null)?.cross);
  const own = city.fleet_from_city || city.slug;
  const out: (T & { svc: ServiceInfo })[] = [];
  for (const v of cars) {
    // A city's designated fleet (e.g. Tampa → Orlando) is priced through the matrix too, unless it is the city itself.
    if (v.city !== own && !(cross.matrix[v.city]?.[city.slug])) continue;
    const c = crossCell(v.city, city.slug, v, cross);
    if (c && !c.offered) continue;
    if (!c || c.itemized || c.pickupOnly) { out.push({ ...v, svc: { cross: false, fee: 0, quote: false, fromDaily: v.daily_price_usd, referenceDays: cross.reference_days } }); continue; }
    const p = crossPrice(c, "both");
    const fee = p.status === "priced" ? p.fee : null;
    const fromDaily = v.daily_price_usd != null && fee != null ? allInPrice(Number(v.daily_price_usd), cross.reference_days, fee).allInDaily : null;
    out.push({ ...v, svc: { cross: true, fee, quote: p.status === "quote_pending", fromDaily, referenceDays: cross.reference_days } });
  }
  return out;
}

/** Fleets that can appear in a service city (own fleet + matrix rows with that city). */
export function fleetsFor(city: { slug: string; fleet_from_city: string | null }, rawCfg: unknown) {
  const cross = crossConfig((rawCfg as { cross?: unknown } | null)?.cross);
  const set = new Set([city.fleet_from_city || city.slug]);
  for (const [fleet, row] of Object.entries(cross.matrix)) if (row[city.slug] && Object.values(row[city.slug]!).some((c) => c.offered)) set.add(fleet);
  return [...set];
}

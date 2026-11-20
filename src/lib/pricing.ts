// Pure booking rules shared by the browser (display) and server (authoritative).

export const ABSOLUTE_MIN_PRERESERVATION = 75;

export interface PricingSettings {
  /** Sports/Exotics multi-day tier (admin Promotions tab); defaults 5% / 10%. */
  duration_tiers?: import("@/integrations/supabase/types").Json | undefined;
  /** Active per-car promotions (rental rate only, dates inclusive, New York calendar). */
  promotions?: Promotion[] | undefined;
  prereservation_min_usd: number;
  prereservation_days: number;
  addon_insurance_per_day: number;
  addon_hotel_checkin: number;
  addon_luggage_car: number;
  addon_baby_seat?: number;
  addon_coverage?: number;
  addon_prepaid_fuel?: number;
  addon_vip_delivery?: number;
  approval_window_hours: number;
  cutoff_hours_before_pickup: number;
  min_lead_time_hours: number;
}

export const DEFAULT_SETTINGS: PricingSettings = {
  prereservation_min_usd: 75,
  prereservation_days: 1,
  addon_insurance_per_day: 35,
  addon_hotel_checkin: 50,
  addon_luggage_car: 150,
  approval_window_hours: 24,
  cutoff_hours_before_pickup: 3,
  min_lead_time_hours: 6,
};

/** Legacy quote snapshot field only; never used to choose a new booking charge (dueAtBooking is authoritative). */
export function prereservationAmount(
  dailyPrice: number | null | undefined,
  override: number | null | undefined,
  s: Pick<PricingSettings, "prereservation_min_usd" | "prereservation_days"> = DEFAULT_SETTINGS,
): number {
  const floor = Math.max(ABSOLUTE_MIN_PRERESERVATION, Number(s.prereservation_min_usd) || 0);
  if (override != null && Number(override) > 0) return Math.max(floor, Number(override));
  const days = dailyPrice ? Number(dailyPrice) * (Number(s.prereservation_days) || 1) : 0;
  return Math.max(floor, days);
}

/** Expires at whichever comes first: request + approval window, or pick-up − cutoff. */
export function holdExpiresAt(
  requestedAt: Date,
  pickupAt: Date,
  s: Pick<PricingSettings, "approval_window_hours" | "cutoff_hours_before_pickup"> = DEFAULT_SETTINGS,
): Date {
  const a = requestedAt.getTime() + s.approval_window_hours * 3600_000;
  const b = pickupAt.getTime() - s.cutoff_hours_before_pickup * 3600_000;
  return new Date(Math.min(a, b));
}

/** Online booking only when pick-up is at least the minimum lead time away. */
export function canBookOnline(now: Date, pickupAt: Date, s: Pick<PricingSettings, "min_lead_time_hours"> = DEFAULT_SETTINGS) {
  return pickupAt.getTime() - now.getTime() >= s.min_lead_time_hours * 3600_000;
}

/** Billable days: every started 24h counts, minimum 1. */
export function rentalDays(pickupAt: Date, returnAt: Date): number {
  const ms = returnAt.getTime() - pickupAt.getTime();
  if (!(ms > 0)) return 0;
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

export interface Addons { insurance: boolean; hotelCheckin: boolean; luggageCar: boolean; babySeat?: boolean | undefined; coverage?: boolean | undefined; prepaidFuel?: boolean | undefined; vipDelivery?: boolean | undefined }

export interface Quote {
  days: number;
  dailyRate: number | null;
  /** Listed (undiscounted) daily rate. */
  listedDaily: number | null;
  /** Duration discount % applied to the daily rate (Sports/Exotics only). */
  durationPct: number;
  /** Informational: listed × days − rental line (already reflected in base; never subtracted again). */
  durationDiscount: number;
  /** Rental days outside December (the only days the duration tier counts and discounts). */
  nonDecemberDays: number;
  /** Rental days in December — always charged at the full listed daily rate. */
  decemberDays: number;
  /** Days the tier discount applied to (non-December days not taken by a higher promo). */
  tierDays: number;
  /** Per-car promotion discounts applied (grouped by %); informational, already inside base. */
  promoDiscounts: { pct: number; days: number; amount: number }[];
  promoDiscount: number;
  /** Days charged at a SUPER_DEALS fixed rate (already inside base). */
  superDealDays?: number;
  /** Rental days grouped by charged daily rate. */
  rateGroups: { rate: number; days: number }[];
  /** Discounted daily rate applied to the non-December days (null when no price). */
  discountedDaily: number | null;
  base: number | null;
  insurance: number;
  hotelCheckin: number;
  luggageCar: number;
  babySeat: number;
  coverage: number;
  prepaidFuel: number;
  vipDelivery: number;
  addonsTotal: number;
  deliveryFee: number;
  /** Mandatory basic insurance (non-exotic only). */
  basicInsurance: number;
  /** Mandatory tolls (non-exotic only). */
  tolls: number;
  /** Mandatory Solid Waste fee ($2/day, first 30 days); taxable, never discounted. */
  solidWaste: number;
  discount: number;
  subtotal: number | null;
  taxRate: number;
  tax: number | null;
  /** Owner custom fees applied (snapshot). Taxable ones are inside subtotal; others are added after tax. */
  customFees: AppliedFee[];
  total: number | null;
  prereservation: number;
}

/** Owner checkout fees (SistemaGestao calcAmounts mirror). Basic insurance + toll apply to non-exotic cars only. */
export interface FeesConfig { tax_rate_pct: number; basic_insurance_per_day: number; toll_per_day: number }
/** Solid Waste (FL 212.0606 mechanics): fixed per-day amount on the first N days of every rental, all cars. */
export const SOLID_WASTE_PER_DAY = 2;
export const SOLID_WASTE_MAX_DAYS = 30;
export function solidWasteFee(days: number) { return round2(SOLID_WASTE_PER_DAY * Math.min(Math.max(0, Math.floor(days || 0)), SOLID_WASTE_MAX_DAYS)); }
export const DEFAULT_FEES: FeesConfig = { tax_rate_pct: 6.5, basic_insurance_per_day: 10, toll_per_day: 5 };
export function feesConfig(raw: unknown): FeesConfig {
  const r = (raw ?? {}) as Partial<FeesConfig>;
  const n = (x: unknown, d: number) => (x != null && Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : d);
  return { tax_rate_pct: n(r.tax_rate_pct, DEFAULT_FEES.tax_rate_pct), basic_insurance_per_day: n(r.basic_insurance_per_day, DEFAULT_FEES.basic_insurance_per_day), toll_per_day: n(r.toll_per_day, DEFAULT_FEES.toll_per_day) };
}
/** Owner-created custom fee (Settings → Delivery & add-ons → Other fees). */
export interface CustomFee {
  id: string; name_en: string; name_pt: string; name_es: string;
  type: "fixed" | "per_day" | "percent"; amount: number; pct_base: "rental" | "subtotal";
  applies: "all" | "non_exotic" | "exotic" | "categories"; categories: string[]; cities: string[];
  mode: "mandatory" | "optional"; taxable: boolean; active: boolean;
}
export type AppliedFee = { id: string; name_en: string; name_pt: string; name_es: string; type: CustomFee["type"]; rate: number; pct_base: CustomFee["pct_base"]; taxable: boolean; mode: CustomFee["mode"]; amount: number };
export function customFeesConfig(raw: unknown): CustomFee[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((f) => f && typeof f === "object" && String((f as CustomFee).name_en ?? "").trim()).map((f: Partial<CustomFee>) => ({
    id: String(f.id ?? ""), name_en: String(f.name_en).trim(), name_pt: String(f.name_pt ?? "").trim(), name_es: String(f.name_es ?? "").trim(),
    type: f.type === "per_day" || f.type === "percent" ? f.type : "fixed", amount: Math.max(0, Number(f.amount) || 0),
    pct_base: f.pct_base === "rental" ? "rental" : "subtotal",
    applies: (["all", "non_exotic", "exotic", "categories"] as const).includes(f.applies as never) ? f.applies! : "all",
    categories: Array.isArray(f.categories) ? f.categories.map(String) : [], cities: Array.isArray(f.cities) ? f.cities.map(String) : [],
    mode: f.mode === "optional" ? "optional" : "mandatory", taxable: f.taxable !== false, active: f.active !== false,
  }));
}
/** Fee name in the visitor's language; PT/ES fall back to EN. */
export const feeName = (f: { name_en: string; name_pt?: string; name_es?: string }, lang: string) =>
  (lang === "pt" ? f.name_pt : lang === "es" ? f.name_es : "") || f.name_en;
/** Active fees that apply to this car in this service city (optional ones included; the customer chooses). */
export function matchingFees(fees: CustomFee[], v: { body_category: string; exotic: boolean }, serviceCity: string) {
  return fees.filter((f) => f.active && (f.cities.length === 0 || f.cities.includes(serviceCity)) && (
    f.applies === "all" || (f.applies === "exotic" && v.exotic) || (f.applies === "non_exotic" && !v.exotic) || (f.applies === "categories" && f.categories.includes(v.body_category))));
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** subtotal = rental + basic + toll + delivery + add-ons − discount (≥0); tax = rate × subtotal; total = subtotal + tax. Each line round2. */
export function composeTotals(p: { base: number | null; basicInsurance: number; tolls: number; deliveryFee: number; addonsTotal: number; discount?: number; solidWaste?: number; taxRatePct: number; customFees?: CustomFee[]; days?: number; applied?: AppliedFee[] }) {
  if (p.base == null) return { subtotal: null, tax: null, total: null, customFees: [] as AppliedFee[] };
  const rental = round2(p.base);
  const pre = round2(rental + round2(p.basicInsurance) + round2(p.tolls) + round2(p.deliveryFee) + round2(p.addonsTotal));
  // Recompute from fee definitions, or reuse a stored snapshot (fixed amounts; percentages re-based).
  const defs: AppliedFee[] = p.applied ?? (p.customFees ?? []).map((c) => ({ id: c.id, name_en: c.name_en, name_pt: c.name_pt, name_es: c.name_es, type: c.type, rate: c.amount, pct_base: c.pct_base, taxable: c.taxable, mode: c.mode, amount: 0 }));
  const flat = defs.filter((d) => d.type !== "percent").map((d) => ({ ...d, amount: d.type === "per_day" ? round2(d.rate * (p.days ?? 0)) : round2(d.rate) }));
  // Percentages come after all non-percentage lines; base = rental, or subtotal before tax.
  const nonPct = round2(pre + flat.filter((d) => d.taxable).reduce((a, d) => a + d.amount, 0));
  const pct = defs.filter((d) => d.type === "percent").map((d) => ({ ...d, amount: round2((d.pct_base === "rental" ? rental : nonPct) * d.rate / 100) }));
  const order = new Map(defs.map((d, i) => [d.id, i]));
  const applied = [...flat, ...pct].sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
  const taxableFees = applied.filter((d) => d.taxable).reduce((a, d) => a + d.amount, 0);
  const untaxed = applied.filter((d) => !d.taxable).reduce((a, d) => a + d.amount, 0);
  const subtotal = round2(Math.max(0, pre + taxableFees - round2(p.discount ?? 0)) + round2(p.solidWaste ?? 0));
  const tax = round2(subtotal * (p.taxRatePct / 100));
  return { subtotal, tax, total: round2(subtotal + tax + untaxed), customFees: applied };
}

export interface Promotion { vehicle_id: string; pct: number; starts_on: string; ends_on: string; active?: boolean }
export interface DurationTiers { two: number; three: number }
export const DEFAULT_TIERS: DurationTiers = { two: 5, three: 10 };
/** Admin tier config; each value 0–100, falling back to the 5%/10% defaults. */
export function durationTiers(raw: unknown): DurationTiers {
  const r = (raw ?? {}) as Partial<Record<keyof DurationTiers, unknown>>;
  const ok = (x: unknown, d: number) => (x != null && x !== "" && Number.isFinite(Number(x)) && Number(x) >= 0 && Number(x) <= 100 ? Number(x) : d);
  return { two: ok(r.two, DEFAULT_TIERS.two), three: ok(r.three, DEFAULT_TIERS.three) };
}
/** Owner rule: Sports/Exotics only — 1 day 0%, 2 days tier.two, 3+ days tier.three off the DAILY rate. Regular cars never. */
export function durationDiscountPct(v: { body_category?: string | null; delivery_tier_override?: string | null }, days: number, tiers: DurationTiers = DEFAULT_TIERS): number {
  if (!v.body_category) return 0;
  const cat = addressCategory(v as DeliveryCar);
  if (cat !== "sports" && cat !== "exotic") return 0;
  return days >= 3 ? tiers.three : days === 2 ? tiers.two : 0;
}
/** Promotion status for the admin list, by New York calendar date. */
export function promoStatus(p: { starts_on: string; ends_on: string; active?: boolean }, now: Date = new Date()): "active" | "scheduled" | "expired" | "inactive" {
  if (p.active === false) return "inactive";
  const today = nyDate(now);
  return today < p.starts_on ? "scheduled" : today > p.ends_on ? "expired" : "active";
}
const nyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
/** YYYY-MM-DD in New York. */
export const nyDate = (d: Date) => nyFmt.format(d);
/** True if [a1,a2] and [b1,b2] (inclusive YYYY-MM-DD) overlap. */
export const promoOverlaps = (a: { starts_on: string; ends_on: string }, b: { starts_on: string; ends_on: string }) => a.starts_on <= b.ends_on && a.ends_on >= b.starts_on;
/** Splits rental calendar days (pickup date inclusive, `days` days, New York calendar) into non-December vs December. */
export function decemberSplit(pickupAt: Date, days: number): { nonDecemberDays: number; decemberDays: number } {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric" });
  let dec = 0;
  for (let i = 0; i < days; i++) if (fmt.format(new Date(pickupAt.getTime() + i * 86_400_000)) === "12") dec++;
  return { nonDecemberDays: days - dec, decemberDays: dec };
}
/** Owner rule: December days are never discounted; the tier counts only non-December days. */
export function durationSplit(v: { body_category?: string | null; delivery_tier_override?: string | null }, pickupAt: Date, returnAt: Date) {
  const days = rentalDays(pickupAt, returnAt);
  const sp = decemberSplit(pickupAt, days);
  return { days, ...sp, pct: durationDiscountPct(v, sp.nonDecemberDays) };
}
/** Effective daily rate after the duration discount, rounded to the cent. */
export const effectiveDaily = (listed: number, pct: number) => round2(listed * (1 - pct / 100));

/** Owner super deals: a fixed daily rate on one unit for December days, only for bookings made by `bookBy`
 *  (New York calendar). The listed price stays in the database; this is code, so a fleet sync never erases it. */
export interface SuperDeal { vehicle_id: string; rate: number; bookBy: string; from: string; to: string }
export const SUPER_DEALS: SuperDeal[] = [
  // Orange Lamborghini Huracán Evo Spyder, Orlando (slug lamborghini-huracan-evo-spyder). Miami units untouched.
  { vehicle_id: "741e5447-248d-43f9-a9f1-92d843f7e342", rate: 990, bookBy: "2026-12-05", from: "2026-12-01", to: "2026-12-31" },
];
/** Super deal still bookable today for this car (null when none or the booking window has closed). */
export function superDealFor(vehicleId: string | null | undefined, now: Date = new Date()): SuperDeal | null {
  if (!vehicleId) return null;
  const today = nyDate(now);
  return SUPER_DEALS.find((d) => d.vehicle_id === vehicleId && today <= d.bookBy) ?? null;
}

export function computeQuote(
  v: { daily_price_usd: number | null; prereservation_amount_usd: number | null; body_category?: string | null; delivery_tier_override?: string | null },
  pickupAt: Date,
  returnAt: Date,
  addons: Addons,
  s: PricingSettings = DEFAULT_SETTINGS,
  deliveryFeeUsd: number | null | undefined = 0,
  /** Cross-city logistics fee embedded in the daily price (no separate line). */
  embeddedFeeUsd: number | null | undefined = 0,
  extra: { exotic: boolean; fees?: FeesConfig; discount?: number; customFees?: CustomFee[]; chosenFees?: string[]; minDays?: number; deliveryPending?: boolean; bookedAt?: Date } = { exotic: false },
): Quote {
  const days = rentalDays(pickupAt, returnAt);
  // Server paths pass the effective minimum: a total is never computed below it.
  if (extra.minDays != null && days < extra.minDays) throw new Error("MIN_DAYS");
  const rawDaily = v.daily_price_usd != null ? Number(v.daily_price_usd) : null;
  const emb = Math.max(0, Number(embeddedFeeUsd) || 0);
  
  const { nonDecemberDays, decemberDays } = decemberSplit(pickupAt, days);
  const durationPct = rawDaily != null ? durationDiscountPct(v, nonDecemberDays, durationTiers(s.duration_tiers)) : 0;
  const discountedDaily = rawDaily != null ? effectiveDaily(rawDaily, durationPct) : null;
  // Per day: December = full; otherwise the HIGHER of tier and an in-window promo (never stacked).
  const vid = (v as { id?: string }).id;
  const promos = vid ? (s.promotions ?? []).filter((p) => p.vehicle_id === vid && p.active !== false && Number(p.pct) > 0) : [];
  const deal = superDealFor(vid, extra.bookedAt ?? new Date());
  let superDealDays = 0;
  const counts = new Map<string, { rate: number; days: number; kind: "full" | "tier" | "promo" | "super"; pct: number }>();
  const dec = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric" });
  for (let i = 0; rawDaily != null && i < days; i++) {
    const d = new Date(pickupAt.getTime() + i * 86_400_000);
    let kind: "full" | "tier" | "promo" | "super" = "full", pct = 0;
    const dk = nyDate(d);
    if (deal && dec.format(d) === "12" && deal.from <= dk && dk <= deal.to && deal.rate < rawDaily) { kind = "super"; superDealDays++; }
    else if (dec.format(d) !== "12") {
      const key = nyDate(d);
      const promo = Math.max(0, ...promos.filter((p) => p.starts_on <= key && key <= p.ends_on).map((p) => Math.min(100, Number(p.pct))));
      if (promo > durationPct) { kind = "promo"; pct = promo; } else if (durationPct > 0) { kind = "tier"; pct = durationPct; }
    }
    const k = `${kind}:${pct}`;
    const c = counts.get(k) ?? { rate: kind === "super" ? deal!.rate : effectiveDaily(rawDaily, pct), days: 0, kind, pct };
    c.days++; counts.set(k, c);
  }
  const groups = [...counts.values()];
  const rateGroups = groups.map((g) => ({ rate: g.rate, days: g.days })).sort((a, b) => a.rate - b.rate);
  const base = rawDaily != null ? round2(groups.reduce((a, g) => a + round2(g.rate * g.days), 0)) : null;
  const tierG = groups.find((g) => g.kind === "tier");
  const tierDays = tierG?.days ?? 0;
  const durationDiscount = rawDaily != null && tierG ? round2(rawDaily * tierDays - round2(tierG.rate * tierDays)) : 0;
  const promoDiscounts = rawDaily != null ? groups.filter((g) => g.kind === "promo").map((g) => ({ pct: g.pct, days: g.days, amount: round2(rawDaily * g.days - round2(g.rate * g.days)) })) : [];
  const promoDiscount = round2(promoDiscounts.reduce((a, p) => a + p.amount, 0));
  // A blended rate is never shown: with several rates the line uses the listed rate plus a split.
  const dailyRate = rawDaily != null ? (rateGroups.length === 1 ? rateGroups[0]!.rate : rawDaily) : null;
  const insurance = addons.insurance ? Number(s.addon_insurance_per_day) * days : 0;
  const hotelCheckin = addons.hotelCheckin ? Number(s.addon_hotel_checkin) : 0;
  const luggageCar = addons.luggageCar ? Number(s.addon_luggage_car) : 0;
  const babySeat = addons.babySeat ? Math.max(0, Number(s.addon_baby_seat) || 0) : 0;
  const coverage = addons.coverage ? Math.max(0, Number(s.addon_coverage) || 0) * days : 0;
  // Flat per-rental extras (never per day).
  const prepaidFuel = addons.prepaidFuel ? Math.max(0, Number(s.addon_prepaid_fuel) || 0) : 0;
  const vipDelivery = addons.vipDelivery ? Math.max(0, Number(s.addon_vip_delivery) || 0) : 0;
  const addonsTotal = insurance + hotelCheckin + luggageCar + babySeat + coverage + prepaidFuel + vipDelivery;
  // Itemized delivery fee (same-city delivery); 0 = none.
  const deliveryFee = round2(Math.max(0, Number(deliveryFeeUsd) || 0) + emb);
  const f = extra.fees ?? DEFAULT_FEES;
  const basicInsurance = extra.exotic ? 0 : round2(f.basic_insurance_per_day * days);
  const tolls = extra.exotic ? 0 : round2(f.toll_per_day * days);
  const solidWaste = solidWasteFee(days);
  const discount = Math.max(0, Number(extra.discount) || 0);
  const chosen = new Set(extra.chosenFees ?? []);
  const fees = (extra.customFees ?? []).filter((c) => c.mode === "mandatory" || chosen.has(c.id));
  const t = composeTotals({ base, basicInsurance, tolls, deliveryFee, addonsTotal, discount, solidWaste, taxRatePct: f.tax_rate_pct, customFees: fees, days });
  return {
    days, dailyRate, listedDaily: rawDaily, durationPct, durationDiscount, tierDays, promoDiscounts, promoDiscount, superDealDays, rateGroups, nonDecemberDays, decemberDays, discountedDaily, base: base != null ? round2(base) : null, insurance, hotelCheckin, luggageCar, babySeat, coverage, prepaidFuel, vipDelivery, addonsTotal, deliveryFee,
    basicInsurance, tolls, solidWaste, discount, taxRate: f.tax_rate_pct, ...t, ...(extra.deliveryPending ? { subtotal: null, tax: null, total: null } : {}),
    prereservation: prereservationAmount(rawDaily, v.prereservation_amount_usd, s),
  };
}

type DurQ = { days: number; durationPct: number; durationDiscount: number; nonDecemberDays: number; decemberDays: number; discountedDaily: number | null; dailyRate: number | null; listedDaily: number | null; tierDays?: number; superDealDays?: number; promoDiscounts?: { pct: number; days: number; amount: number }[]; rateGroups?: { rate: number; days: number }[] };
type DurCv = { dur2: string; dur3: string; durNonDec: string; decSplit: string; durTier?: string; promoLine?: string };
const sub = (t: string, m: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(m[k] ?? ""));
/** True when a duration discount applies to only part of the rental (December days at full price). */
export const isPartialDuration = (q: Pick<DurQ, "durationPct" | "decemberDays"> & { tierDays?: number; nonDecemberDays?: number }) => q.durationPct > 0 && (q.decemberDays > 0 || (q.tierDays != null && q.nonDecemberDays != null && q.tierDays < q.nonDecemberDays));
/** Promotion lines (one per %), only when a promo actually reduced the price. */
export function promoLabels(q: DurQ, cv: DurCv): { label: string; amount: number }[] {
  return (q.promoDiscounts ?? []).filter((p) => p.amount > 0).map((p) => ({ label: sub(cv.promoLine ?? "Promotion (-{pct}%, {n} days)", { pct: p.pct, n: p.days }), amount: p.amount }));
}
/** Discount line label; null when no discount line should render. */
export function durationLabel(q: DurQ, cv: DurCv): string | null {
  if (!(q.durationPct > 0 && q.durationDiscount > 0)) return null;
  if ((q.promoDiscounts ?? []).length && cv.durTier) return sub(cv.durTier, { pct: q.durationPct, n: q.tierDays ?? 0 });
  if (isPartialDuration(q)) return sub(cv.durNonDec, { pct: q.durationPct, n: q.nonDecemberDays });
  return q.durationPct === 5 ? cv.dur2 : cv.dur3;
}
/** Rate part of the rental line: "× $X/day", or the honest non-December/December split. */
export function rentalRateText(q: DurQ, perDay: string, cv: DurCv): string | null {
  if (q.dailyRate == null) return null;
  // With a promo, show the rate actually applied to each day group (rate × days = rental amount).
  const special = (q.promoDiscounts ?? []).length > 0 || (q.superDealDays ?? 0) > 0;
  if (special && (q.rateGroups ?? []).length > 1) return q.rateGroups!.map((g) => `${g.days} × ${usd2(g.rate)}`).join(" + ");
  if (special) return `${q.days} × ${usd2(q.dailyRate)}${perDay}`;
  if (isPartialDuration(q) && q.discountedDaily != null && q.listedDaily != null)
    return sub(cv.decSplit, { n: q.nonDecemberDays, amt: usd2(q.discountedDaily)!, d: q.decemberDays, full: usd2(q.listedDaily)! });
  return `${q.days} × ${usd2(q.dailyRate)}${perDay}`;
}

/** Cents-exact USD for itemized summaries (drops ".00"). */
export function usd2(n: number | null | undefined) {
  if (n == null) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);
}

export function usd(n: number | null | undefined) {
  if (n == null) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

/** A car is unavailable for a period if a blocked day falls between the pick-up and return days (inclusive)
 *  or an active pre-reservation overlaps the period. Day strings are YYYY-MM-DD. */
export function isUnavailable(
  blockedDates: string[],
  reservations: { pickup_at: string; return_at: string }[],
  pickupAt: string,
  returnAt: string,
) {
  const pDay = pickupAt.slice(0, 10), rDay = returnAt.slice(0, 10);
  if (blockedDates.some((d) => d >= pDay && d <= rDay)) return true;
  const p = new Date(pickupAt).getTime(), r = new Date(returnAt).getTime();
  return reservations.some((x) => new Date(x.pickup_at).getTime() < r && new Date(x.return_at).getTime() > p);
}

/** Booking statuses that occupy a car. A "checkout_hold" (instant full-payment checkout) only counts until its hold_until. */
export const BLOCKING_STATUSES = ["pending_approval", "substitute_offered", "approved", "confirmed", "paid_conflict", "amount_review"] as const;
/** Owner rule: an UNPAID checkout (checkout_hold / draft) holds the car for at most this many minutes after it was created. Drafts never block. */
export const UNPAID_HOLD_MINUTES = 5;
export const INSTANT_HOLD_MINUTES = UNPAID_HOLD_MINUTES;
/** Rows created before this instant can no longer hold a car while unpaid (evaluated live at every check). */
export function unpaidHoldCutoff(now = new Date()) { return new Date(now.getTime() - UNPAID_HOLD_MINUTES * 60000); }
/** PostgREST `or` filter for rows that block a car at `now`. */
export function blockingFilter(now = new Date()) {
  return `status.in.(${BLOCKING_STATUSES.join(",")}),and(status.eq.checkout_hold,hold_until.gt.${now.toISOString()},created_at.gt.${unpaidHoldCutoff(now).toISOString()})`;
}
/** Same rule in code (used by tests and in-memory checks). */
export function rowBlocks(r: { status: string; hold_until?: string | null; created_at?: string | null }, now = new Date()) {
  if ((BLOCKING_STATUSES as readonly string[]).includes(r.status)) return true;
  if (r.status !== "checkout_hold" || !r.hold_until || new Date(r.hold_until) <= now) return false;
  return !r.created_at || new Date(r.created_at) > unpaidHoldCutoff(now);
}
/** Full rental charge for instant bookings must be at least the booked total. */
export function paidEnough(paidUsd: number | null | undefined, totalUsd: number | null | undefined) {
  if (paidUsd == null || totalUsd == null) return false;
  return Math.round(paidUsd * 100) >= Math.round(totalUsd * 100);
}

// ---------- Delivery & supplemental insurance (owner rules; values come from settings.delivery_config) ----------
export type DeliveryTier = "standard" | "exotic";
export type DeliveryType = "pickup" | "airport" | "address";
export type AirportMode = "one_way" | "round_trip";
export interface DeliveryConfig {
  bases: Record<string, { address: string; lat: number; lng: number }>;
  airports: Record<string, { code: string; terminal: string; lat: number; lng: number }>;
  standard: { airport_one_way: number; airport_round_trip: number; address_threshold_mi: number; address_near: number; address_far: number };
  exotic: { a_mi: number; a_fee: number; b_mi: number; b_fee: number };
  insurance_by_category: Record<string, boolean>;
  fees: FeesConfig;
  custom_fees: CustomFee[];
  fixed_delivery: Record<"regular" | "sports" | "exotic", FixedDeliveryPrices>;
}
export type FixedDeliveryPrices = { ownCityAddress: number; otherBase: number; servedCity: number };
export type DeliveryCar = { city: string; body_category: string; delivery_tier_override?: string | null; delivery_pricing?: unknown; allows_one_way?: boolean };
export const addressCategory = (v: DeliveryCar) => deliveryTier(v) === "exotic" ? "exotic" : v.body_category === "sports" ? "sports" : "regular";
export const sameCityDeliveryOnly = (v: DeliveryCar) => v.body_category === "exotics" || deliveryTier(v) === "exotic";
/** Per-car overrides of the owner's table live under `delivery_pricing.v2`; older flat keys predate the table and are ignored. */
export const deliveryOverrides = (raw: unknown): Partial<FixedDeliveryPrices> => ((raw as { v2?: Partial<FixedDeliveryPrices> } | null)?.v2 ?? {});
export function effectiveDeliveryPrices(v: DeliveryCar, raw: unknown): FixedDeliveryPrices {
 const defaults = deliveryConfig(raw).fixed_delivery[addressCategory(v)];
 const overrides = deliveryOverrides(v.delivery_pricing);
 return Object.fromEntries(Object.entries(defaults).map(([k,value]) => [k, overrides[k as keyof FixedDeliveryPrices] ?? value])) as FixedDeliveryPrices;
}
export function addressLegPrice(v: DeliveryCar, miles: number | null, raw: unknown): DeliveryPrice {
 if ((miles == null || !Number.isFinite(miles) || miles < 0 || miles > 25)) return { status: "quote_pending", fee: null };
 return { status: "priced", fee: round2(effectiveDeliveryPrices(v, raw).ownCityAddress) };
}
export const DEFAULT_DELIVERY: DeliveryConfig = {
  bases: {
    orlando: { address: "5461 Hazeltine National Dr, Orlando, FL 32812", lat: 28.46466, lng: -81.3133 },
    miami: { address: "1000 Lincoln Rd, Miami Beach, FL 33139", lat: 25.79017, lng: -80.13906 },
  },
  airports: {
    orlando: { code: "MCO", terminal: "Orlando International Airport (MCO)", lat: 28.4312, lng: -81.3081 },
    tampa: { code: "TPA", terminal: "Tampa International Airport (TPA)", lat: 27.9755, lng: -82.5332 },
    miami: { code: "MIA", terminal: "Miami International Airport (MIA)", lat: 25.7959, lng: -80.287 },
    "fort-lauderdale": { code: "FLL", terminal: "Fort Lauderdale-Hollywood International Airport (FLL)", lat: 26.0726, lng: -80.1527 },
  },
  standard: { airport_one_way: 40, airport_round_trip: 60, address_threshold_mi: 15, address_near: 60, address_far: 80 },
  exotic: { a_mi: 7, a_fee: 120, b_mi: 15, b_fee: 150 },
  insurance_by_category: { suv: true, sedan: true, luxury: true, sports: false, exotics: false },
  fees: DEFAULT_FEES,
  custom_fees: [],
  // Owner table (per leg): own city airport/address $40 (exotic $120), served zone of own base $100, any other inter-city leg $180; base pickup free.
  fixed_delivery: { regular: { ownCityAddress: 40, otherBase: 180, servedCity: 100 }, sports: { ownCityAddress: 40, otherBase: 180, servedCity: 100 }, exotic: { ownCityAddress: 120, otherBase: 180, servedCity: 100 } },
};
export function deliveryConfig(raw: unknown): DeliveryConfig {
  const r = (raw ?? {}) as Partial<DeliveryConfig>;
  const v2 = (r as { fixed_delivery_v2?: Partial<DeliveryConfig["fixed_delivery"]> }).fixed_delivery_v2;
  return {
    bases: { ...DEFAULT_DELIVERY.bases, ...(r.bases ?? {}) },
    airports: { ...DEFAULT_DELIVERY.airports, ...(r.airports ?? {}) },
    standard: { ...DEFAULT_DELIVERY.standard, ...(r.standard ?? {}) },
    exotic: { ...DEFAULT_DELIVERY.exotic, ...(r.exotic ?? {}) },
    insurance_by_category: { ...DEFAULT_DELIVERY.insurance_by_category, ...(r.insurance_by_category ?? {}) },
    fees: feesConfig(r.fees),
    custom_fees: customFeesConfig(r.custom_fees),
    // Category defaults saved by admin live under `fixed_delivery_v2`; the older `fixed_delivery` key predates the owner table and is ignored.
    fixed_delivery: { regular: { ...DEFAULT_DELIVERY.fixed_delivery.regular, ...v2?.regular }, sports: { ...DEFAULT_DELIVERY.fixed_delivery.sports, ...v2?.sports }, exotic: { ...DEFAULT_DELIVERY.fixed_delivery.exotic, ...v2?.exotic } },
  };
}

/** Supplemental insurance exists for this car? Per-car override wins, else the primary-category switch. */
export function insuranceOffered(v: { body_category: string; insurance_override?: string | null }, cfg: DeliveryConfig = DEFAULT_DELIVERY) {
  if (v.insurance_override === "on") return true;
  if (v.insurance_override === "off") return false;
  return !!cfg.insurance_by_category[v.body_category];
}

/** Exotics category → exotic tier; everything else standard. Per-car override wins. */
export function deliveryTier(v: { body_category: string; delivery_tier_override?: string | null }): DeliveryTier {
  if (v.delivery_tier_override === "standard" || v.delivery_tier_override === "exotic") return v.delivery_tier_override;
  return v.body_category === "exotics" ? "exotic" : "standard";
}

export const roundMi = (mi: number) => Math.round(mi * 10) / 10;

export type DeliveryPrice = { status: "priced"; fee: number } | { status: "quote_pending"; fee: null };

/** Fee from the owner's table. distanceMi = driving miles base→destination (null when unknown). Boundaries inclusive. */
export function deliveryPrice(
  tier: DeliveryTier, type: DeliveryType, airportMode: AirportMode | null | undefined, distanceMi: number | null | undefined, cfg: DeliveryConfig = DEFAULT_DELIVERY,
): DeliveryPrice {
  if (type === "pickup") return { status: "priced", fee: 0 };
  const pending = { status: "quote_pending", fee: null } as const;
  const d = distanceMi == null || !isFinite(distanceMi) ? null : roundMi(distanceMi);
  if (tier === "standard") {
    if (type === "airport") return { status: "priced", fee: Number(airportMode === "one_way" ? cfg.standard.airport_one_way : cfg.standard.airport_round_trip) };
    if (d == null) return pending;
    return { status: "priced", fee: Number(d <= cfg.standard.address_threshold_mi ? cfg.standard.address_near : cfg.standard.address_far) };
  }
  if (d == null) return pending;
  if (d <= cfg.exotic.a_mi) return { status: "priced", fee: Number(cfg.exotic.a_fee) };
  if (d <= cfg.exotic.b_mi) return { status: "priced", fee: Number(cfg.exotic.b_fee) };
  return pending;
}

// ---------- Cross-city service (car from another city's fleet; fee EMBEDDED in the daily price) ----------
export type CrossMode = "delivery" | "collection" | "both";
export type CrossTier = "standard" | "sports" | "exotic";
/** One matrix cell. Fees null = "to be confirmed". oneWay=false → only "both" exists. */
export interface CrossCell { offered: boolean; oneWay: boolean; delivery: number | null; collection: number | null; both: number | null;
  /** Free pickup at the fleet base is also allowed. */ pickup?: boolean;
  /** Fee is a separate itemized "Delivery" line (normal daily rate), not embedded. */ itemized?: boolean;
  /** No delivery at all — pickup at the fleet base only (e.g. exotics in Fort Lauderdale). */ pickupOnly?: boolean }
export interface CrossConfig {
  matrix: Record<string, Record<string, Record<CrossTier, CrossCell>>>; // fleet → service → tier
  centers: Record<string, { lat: number; lng: number; address: string }>;
  radius_mi: number;
  reference_days: number;
}
const off: CrossCell = { offered: false, oneWay: false, delivery: null, collection: null, both: null };
const cell = (oneWay: boolean, d: number | null, c: number | null, b: number | null): CrossCell => ({ offered: true, oneWay, delivery: oneWay ? d : null, collection: oneWay ? c : null, both: b });
export const DEFAULT_CROSS: CrossConfig = {
  matrix: {
    orlando: {
      tampa: { standard: { ...cell(true, 100, 100, 200), pickup: true, itemized: true }, sports: cell(false, null, null, 200), exotic: { ...off, pickupOnly: true } },
      miami: { standard: cell(true, 180, 180, 360), sports: off, exotic: off },
      "fort-lauderdale": { standard: cell(true, 180, 180, 360), sports: off, exotic: off },
    },
    miami: {
      // Owner rule: Miami fleet in Fort Lauderdale — flat per leg as its own Delivery line (NOT embedded), free pickup at the Miami base; exotics pickup only.
      "fort-lauderdale": { standard: { ...cell(true, 100, 100, 200), pickup: true, itemized: true }, sports: off, exotic: { ...off, offered: true, pickup: true, pickupOnly: true } },
      orlando: { standard: cell(true, 180, 180, 360), sports: off, exotic: off },
      tampa: { standard: cell(true, 180, 180, 360), sports: off, exotic: off },
    },
  },
  centers: {
    tampa: { lat: 27.9506, lng: -82.4572, address: "Downtown Tampa, FL" },
    "fort-lauderdale": { lat: 26.1224, lng: -80.1373, address: "Downtown Fort Lauderdale, FL" },
    miami: { lat: 25.7743, lng: -80.1937, address: "Downtown Miami, FL" },
    orlando: { lat: 28.5384, lng: -81.3789, address: "Downtown Orlando, FL" },
  },
  radius_mi: 25,
  reference_days: 3,
};
export function crossConfig(raw: unknown): CrossConfig {
  const r = (raw ?? {}) as Partial<CrossConfig>;
  const matrix: CrossConfig["matrix"] = JSON.parse(JSON.stringify(DEFAULT_CROSS.matrix));
  for (const [f, row] of Object.entries(r.matrix ?? {})) for (const [s, tiers] of Object.entries(row ?? {})) {
    matrix[f] ??= {};
    matrix[f]![s] = { ...(matrix[f]![s] ?? { standard: off, sports: off, exotic: off }), ...(tiers ?? {}) } as Record<CrossTier, CrossCell>;
  }
  for (const row of Object.values(matrix)) for (const tiers of Object.values(row)) {
    tiers.standard = { ...tiers.standard, itemized: true };
  }
  return { matrix, centers: { ...DEFAULT_CROSS.centers, ...(r.centers ?? {}) }, radius_mi: Number(r.radius_mi ?? DEFAULT_CROSS.radius_mi), reference_days: Math.max(1, Number(r.reference_days ?? DEFAULT_CROSS.reference_days)) };
}
/** Matrix column for a car: exotic tier → exotic; everything else (SUV, Sedan, Luxury, Sports) → standard. The "sports" column is retired. */
/** Does this cell fold its fee into the daily price? (false for itemized or pickup-only cells) */
export const embedsFee = (_c: CrossCell | null | undefined): _c is CrossCell => false;
export function crossTier(v: { body_category: string; delivery_tier_override?: string | null }): CrossTier {
  return deliveryTier(v) === "exotic" ? "exotic" : "standard";
}
/** Cell for a car's fleet → service city; null = same city (normal delivery rules). */
export function crossCell(fleetCity: string, serviceCity: string, v: { body_category: string; delivery_tier_override?: string | null }, cfg: CrossConfig = DEFAULT_CROSS): CrossCell | null {
  if (fleetCity === serviceCity) return null;
  // Category restriction cannot be bypassed by the editable delivery-tier matrix.
  if (v.body_category === "exotics") return serviceCity === "fort-lauderdale" && fleetCity === "miami"
    ? { ...off, offered: true, pickup: true, pickupOnly: true } : { ...off, pickupOnly: true };
  const c = cfg.matrix[fleetCity]?.[serviceCity]?.[crossTier(v)] ?? off;
  return { ...c, itemized: true };
}
/** Can this car be booked in this service city at all? */
export const servesCity = (fleetCity: string, serviceCity: string, v: { body_category: string; delivery_tier_override?: string | null }, cfg: CrossConfig = DEFAULT_CROSS) =>
  fleetCity === serviceCity || !!crossCell(fleetCity, serviceCity, v, cfg)?.offered;

export type CrossPrice = { status: "priced"; fee: number } | { status: "quote_pending"; fee: null } | { status: "rejected"; fee: null };
export function crossPrice(c: CrossCell | null | undefined, mode: CrossMode): CrossPrice {
  if (!c || !c.offered || c.pickupOnly) return { status: "rejected", fee: null };
  if (mode !== "both" && !c.oneWay) return { status: "rejected", fee: null };
  const f = c[mode];
  return f == null ? { status: "quote_pending", fee: null } : { status: "priced", fee: Number(f) };
}
/** All-in daily price: Z = (N × base + fee) / N, rounded to the cent; total is exact (rounding cent lands on the total). */
export function allInPrice(baseDaily: number, days: number, fee: number) {
  const n = Math.max(1, days);
  const total = Math.round((n * baseDaily + fee) * 100) / 100;
  return { allInDaily: Math.round((total / n) * 100) / 100, total };
}
/** "From $Z/day" on cross-city pages with no dates: default mode (both) over the reference length. Null when not priced. */
export function crossFromDaily(baseDaily: number | null, c: CrossCell | null, cfg: CrossConfig = DEFAULT_CROSS): number | null {
  return baseDaily;
}

/** Difference for accepted substitutes or historical payment reconciliation; never a booking split. */
export function paymentDifference(total: number | null | undefined, signal: number) {
  if (total == null) return null;
  return Math.max(0, round2(total - signal));
}

// ---- Payment at booking: full total only (legacy settings cannot enable partial payment) ----
export type PayMode = "signal" | "full";
export const DEFAULT_PAY_MODES: Record<string, PayMode> = Object.fromEntries(["suv", "sedan", "luxury", "convertible", "sports", "exotics"].map(c => [c, "full"]));
export function payModes(_raw: unknown): Record<string, PayMode> { return { ...DEFAULT_PAY_MODES }; }
export function paymentMode(_v: { body_category: string; payment_mode?: string | null }, _raw: unknown): PayMode { return "full"; }
/** Unknown total never falls back to a partial hold; payment startup rejects it. */
export function dueAtBooking(q: { total: number | null; prereservation: number }, _mode: PayMode): { amount: number; mode: PayMode } {
  return { amount: q.total != null && q.total > 0 ? round2(q.total) : 0, mode: "full" };
}
/** Regular cars are charged now. Preserve the existing Sports/Exotics full-total authorization lifecycle. */
export const stripeBookingIsHold = (_category: string) => false;

// ---- Approve with substitute ----
/** Same-or-higher category check uses this rank. */
export const CATEGORY_RANK: Record<string, number> = { suv: 1, sedan: 1, luxury: 2, convertible: 3, sports: 3, exotics: 4 };
/** Substitute total = the substitute's own quote for the same booking (not capped). difference = new − original: >0 client pays extra, <0 refund. */
export function substitutePrice(origTotal: number, subTotal: number | null) {
  const newTotal = round2(subTotal ?? origTotal);
  const difference = round2(newTotal - origTotal);
  return { newTotal, difference, extra: Math.max(0, difference), refund: Math.max(0, round2(-difference)) };
}
/** Owner-facing label for the price difference. */
export const substituteDiffLabel = (difference: number) =>
  difference > 0 ? `client pays extra ${usd2(difference)}` : difference < 0 ? `client refund ${usd2(-difference)}` : "no difference";
/** On acceptance: capture from the existing hold up to the new total; anything above the hold is paid on-site as the balance, anything held above the new total is released/refunded. */
export function substituteCapture(holdUsd: number, newTotal: number) {
  const capture = round2(Math.min(holdUsd, newTotal));
  return { capture, release: round2(holdUsd - capture), balance: round2(Math.max(0, newTotal - capture)) };
}
/** Response deadline: offer + window; if pick-up comes first, the client must accept explicitly before pick-up. */
export function substituteDeadline(offeredAt: Date, pickup: Date, windowHours: number) {
  const d = new Date(offeredAt.getTime() + windowHours * 3600_000);
  return { deadline: pickup <= d ? pickup : d, explicit: true };
}

// ---- Minimum rental days (category default, optional per-car override) ----
/** Owner rule: Exotics 1 day, every other category 3 days. */
export const DEFAULT_MIN_DAYS: Record<string, number> = { suv: 3, sedan: 3, luxury: 3, convertible: 3, sports: 3, exotics: 1 };
export function minDaysMap(raw: unknown): Record<string, number> {
  const out = { ...DEFAULT_MIN_DAYS };
  if (raw && typeof raw === "object") for (const [k, n] of Object.entries(raw as Record<string, unknown>)) { const x = Math.floor(Number(n)); if (x >= 1) out[k] = x; }
  return out;
}
/** Effective minimum: per-car `min_days` when filled, else the category default. */
export function effectiveMinDays(v: { body_category: string; min_days?: number | null }, raw: unknown): { n: number; source: "car" | "category" } {
  if (v.min_days != null && Number(v.min_days) >= 1) return { n: Math.floor(Number(v.min_days)), source: "car" };
  return { n: minDaysMap(raw)[v.body_category] ?? 3, source: "category" };
}

/** Substitutes must be from the exact reserved category. */
export const sameSubstituteCategory = (original: string, substitute: string) => original === substitute;
/** Silence is never consent. */
export const substituteExpired = (now: Date, deadline: Date) => now >= deadline;

// Per-leg fixed prices are shared by preview and submission; stored bookings retain snapshots.
export type DeliveryLeg = { city: string; type: DeliveryType; address?: string | undefined; placeId?: string | undefined; flightAirline?: string | undefined; flightNumber?: string | undefined; sessionToken?: string | undefined };
export const bookingBase = (city: string) => city === "tampa" ? "orlando" : city === "fort-lauderdale" ? "miami" : city;
export const servedZone = (base: string) => base === "orlando" ? "tampa" : "fort-lauderdale";
/** Every city a car's fleet can serve: own base, its served zone, the other base and that base's served zone. */
export const deliveryCities = (base: string) => { const other = base === "miami" ? "orlando" : "miami"; return [base, servedZone(base), other, servedZone(other)]; };
export function deliveryLegPrice(v: DeliveryCar, leg: DeliveryLeg, direction: "pickup" | "return", miles: number | null, raw: unknown) {
  const prices = effectiveDeliveryPrices(v, raw);
  if (!deliveryCities(v.city).includes(leg.city)) throw new Error("DELIVERY_CITY");
  if (sameCityDeliveryOnly(v) && leg.city !== v.city) throw new Error("PICKUP_ONLY");
  const interCity = bookingBase(leg.city) !== v.city;
  if (direction === "return" && interCity && v.allows_one_way === false) throw new Error("ONE_WAY_DISABLED");
  if (leg.type === "pickup" && leg.city !== bookingBase(leg.city)) throw new Error("DELIVERY_CITY");
  if (leg.city !== v.city) {
    const fee = round2(interCity ? prices.otherBase : prices.servedCity);
    return { status: "priced" as const, fee, fixedFee: fee, localFee: 0, interCity };
  }
  // Pickup/return at the car's own base is always free, exotics included; the exotic fixed fee applies to delivery legs only.
  // Own-city airport uses the same fixed own-city fee as an address (one source); addresses beyond 25 mi are confirm-first.
  const local = leg.type === "pickup" ? { status: "priced" as const, fee: 0 } : leg.type === "address" ? addressLegPrice(v, miles, raw) : { status: "priced" as const, fee: round2(prices.ownCityAddress) };
  return { status: local.status, fee: local.fee, fixedFee: 0, localFee: local.fee, interCity: false };
}

/** Airport pair rule (Orlando MCO, Miami MIA): a car based in that city with BOTH pickup and return at its own airport pays no delivery at all. Any other trip prices each leg normally. */
export const AIRPORT_PAIR_FREE_CITIES = ["orlando", "miami"] as const;
export const mcoRoundTripFree = (carCity: string, a: { city: string; type: DeliveryType }, b: { city: string; type: DeliveryType }) =>
  (AIRPORT_PAIR_FREE_CITIES as readonly string[]).includes(carCity) && [a, b].every((l) => l.city === carCity && l.type === "airport");
/** Applies the pair rule to a priced pickup/return leg pair (same shape in, same shape out). */
export function applyMcoPair<L extends { city: string; type: DeliveryType; fee: number | null; localFee: number | null; status: "priced" | "quote_pending" }>(carCity: string, legs: L[]): L[] {
  if (legs.length !== 2 || !mcoRoundTripFree(carCity, legs[0]!, legs[1]!)) return legs;
  return legs.map((l) => ({ ...l, fee: 0, localFee: 0, status: "priced" as const }));
}

/** Per-leg fee from the car's own city to a service city (same fixed fields as checkout). Null for exotics outside their city. */
export function routeLegFee(v: DeliveryCar, serviceCity: string, raw: unknown): number | null {
  const p = effectiveDeliveryPrices(v, raw);
  if (serviceCity === v.city) return round2(p.ownCityAddress);
  if (sameCityDeliveryOnly(v)) return null;
  return round2(bookingBase(serviceCity) === v.city ? p.servedCity : p.otherBase);
}

/** New full-payment charges must succeed; manual capture is accepted only for historical sessions tagged hold. */
export const stripeBookingReady = (status: string, hold: boolean) => status === "succeeded" || (hold && status === "requires_capture");

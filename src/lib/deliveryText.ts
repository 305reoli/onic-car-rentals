// Delivery wording with figures taken from the admin "Delivery & add-ons" settings (never hard-coded).
import { crossConfig, deliveryConfig, deliveryTier, effectiveDeliveryPrices, feesConfig, routeLegFee, usd, type CrossCell, type DeliveryCar } from "./pricing";
import { insuranceExplanation, deliveryLegText, fmt, t, type Lang } from "./i18n";

const u = (n: number | null | undefined) => usd(n) ?? "";

/** One-line note under the price on every car page, by delivery tier (or "included" when a cross-city fee applies). */
export function carDeliveryNote(lang: Lang, rawCfg: unknown, v: { body_category: string; delivery_tier_override?: string | null; city?: string; delivery_pricing?: unknown }, cross: CrossCell | null, serviceCity: string) {
  const tr = t(lang).delivery, c = deliveryConfig(rawCfg);
  if (cross?.pickupOnly) return fmt(tr.exoticPickupOnly, { address: c.bases["miami"]?.address ?? "" });
  if (cross) {
    const leg = v.city ? routeLegFee(v as DeliveryCar, serviceCity, rawCfg) : null;
    const d = leg ?? Number(cross.delivery ?? 0);
    return fmt(tr.noteCross, { d: u(d), c: u(d), b: u(d * 2) });
  }
  if (deliveryTier(v) === "exotic") return fmt(tr.noteExotic, { a: u(c.exotic.a_fee), am: String(c.exotic.a_mi), b: u(c.exotic.b_fee), bm: String(c.exotic.b_mi) }) + (v.city === "orlando" ? " " + deliveryLegText[lang].mcoFree : v.city === "miami" ? " " + deliveryLegText[lang].miaFree : "") + " " + deliveryLegText[lang].exoticLuggage;
  return (v.city === "orlando" ? deliveryLegText[lang].mcoFree + " " : v.city === "miami" ? deliveryLegText[lang].miaFree + " " : "") + fmt(tr.noteStandard, { a: u(Math.min(c.standard.airport_one_way, c.standard.airport_round_trip)), n: u(c.standard.address_near), f: u(c.standard.address_far) });
}

/** The two "Delivery" FAQ entries (also used in the FAQPage JSON-LD). */
export function deliveryFaq(lang: Lang, rawCfg: unknown): [string, string][] {
  const tr = t(lang).delivery, c = deliveryConfig(rawCfg);
  crossConfig((rawCfg as { cross?: unknown } | null)?.cross);
  const codes = ["orlando", "tampa", "miami", "fort-lauderdale"].map((k) => c.airports[k]?.code).filter(Boolean) as string[];
  const list = codes.length > 1 ? `${codes.slice(0, -1).join(", ")} ${tr.orWord} ${codes[codes.length - 1]}` : codes.join("");
  return [
    [tr.faqHowQ, fmt(tr.faqHowA, { airports: list })],
    [tr.faqCostQ, fmt(tr.faqCostA, deliveryTable(rawCfg)) + " " + deliveryLegText[lang].mcoFree + " " + deliveryLegText[lang].miaFree + " " + deliveryLegText[lang].exoticLuggage],
  ];
}

/** Per-day charged fees (non-exotic) from settings. */
export function dailyCharges(rawCfg: unknown) {
  const f = feesConfig((rawCfg as { fees?: unknown } | null)?.fees);
  return { ins: u(f.basic_insurance_per_day), toll: u(f.toll_per_day), any: f.basic_insurance_per_day > 0 || f.toll_per_day > 0 };
}

/** General FAQ items with the toll/insurance answer filled in from settings. */
export function faqItems(lang: Lang, rawCfg: unknown): [string, string][] {
  const tr = t(lang), d = dailyCharges(rawCfg);
  const ans = fmt(tr.car.tollAnswerStd, { ins: d.ins, toll: d.toll }) + "\n\n" + insuranceExplanation(lang);
  return tr.faq.items.map(([q, a]) => [q, a === "{tollAnswer}" ? ans : a] as [string, string]);
}

/** Customer-facing route label for itemized logistics. */
export function interCityLabel(lang: Lang, from: string, to: string) {
 const name = (s: string) => s.split("-").map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(" ");
 return `${t(lang).delivery.interCity} (${name(from)} → ${name(to)})`;
}

/** Per-leg figures of the owner's delivery table, from the same fixed fields checkout charges. */
export function deliveryTable(rawCfg: unknown) {
  const std = effectiveDeliveryPrices({ city: "orlando", body_category: "suv" }, rawCfg), ex = effectiveDeliveryPrices({ city: "orlando", body_category: "exotics" }, rawCfg);
  return { own: u(std.ownCityAddress), served: u(std.servedCity), other: u(std.otherBase), exotic: u(ex.ownCityAddress) };
}

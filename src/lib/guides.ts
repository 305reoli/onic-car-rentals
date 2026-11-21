import { queryOptions } from "@tanstack/react-query";
import { getCities, getPublicSettings, getVehicles } from "@/services/catalog.functions";
import { guideCopy, guideUi } from "./i18n.guides";
import { fmt, globalPaysLabel, t } from "./i18n";
import { allMain, mainFaq, minimumDaysSentence, toPairs, type FaqItem } from "./faqContent";
import { discoveryGroups, lowestDaily, type CatalogCar } from "./discovery";
import { crossConfig, deliveryConfig, payModes } from "./pricing";
import { abs, faqJsonLd, seoHead, SITE, businessAddresses, addressLine } from "./seo";
import { publicPath } from "./publicRoutes";

export type GuideCar = CatalogCar & { seats: number | null; bags: number | null; min_days?: number | null };
export type GuideSettings = { delivery_config?: unknown; payment_modes?: unknown; min_days_by_category?: unknown; prereservation_min_usd?: number | string | null; gp_interest_free_installments?: number | null } | null;
export type GuideCity = { slug: string; name: string; fleet_from_city?: string | null };
export const guideSlugs = guideCopy.map((g) => g.slug);
export const guidePath = (slug?: string) => publicPath("pt", `guides${slug ? `/${slug}` : ""}`);
const dollars = (value: number) => `US$ ${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
export type PriceRow = { label: string; city: string; category: string; price: number; path: string; sources: { id: string; name: string; city: string; daily_price_usd: number }[] };
export function guidePriceRows(cars: GuideCar[], comparison = false): PriceRow[] {
  const active = cars.filter((c) => c.active).sort((a, b) => a.id.localeCompare(b.id));
  const groups = discoveryGroups(active);
  const selections = comparison ? groups.filter((g) => g.kind === "category" && ["exotics", "sports"].includes(g.key)) : groups.filter((g) => g.kind === "model" && g.city === "orlando" && active.some((v) => g.ids.includes(v.id) && v.body_category === "exotics"));
  return selections.flatMap((g) => {
    const units = active.filter((v) => g.ids.includes(v.id) && (comparison || v.body_category === "exotics"));
    const price = lowestDaily(units);
    if (price == null) return [];
    return [{ label: comparison ? t("pt").categories[g.key as "sports"] : g.label, city: g.city, category: comparison ? g.key : "exotics", price, path: g.path, sources: units.flatMap((v) => v.daily_price_usd == null ? [] : [{ id: v.id, name: v.name, city: v.city, daily_price_usd: Number(v.daily_price_usd) }]) }];
  });
}
export function buildGuide(slug: string, cars: GuideCar[], settings: GuideSettings, cities: GuideCity[]) {
  const copy = guideCopy.find((g) => g.slug === slug);
  if (!copy) return null;
  const active = cars.filter((v) => v.active).sort((a, b) => a.id.localeCompare(b.id)), scoped = slug.includes("orlando") && !slug.startsWith("miami-ou") ? active.filter((v) => v.city === "orlando") : active;
  const dc = deliveryConfig(settings?.delivery_config), cc = crossConfig((settings?.delivery_config as { cross?: unknown } | null)?.cross);
  const money = (n: number) => dollars(n);
  const cityName = (slug: string) => cities.find((c) => c.slug === slug)?.name ?? slug.charAt(0).toUpperCase() + slug.slice(1);
  const fees = fmt(guideUi.fees, { insurance: money(dc.fees.basic_insurance_per_day), tolls: money(dc.fees.toll_per_day), tax: dc.fees.tax_rate_pct });
  const full = ["sports", "exotics"].filter((c) => payModes(settings?.payment_modes)[c] === "full").map((c) => t("pt").categories[c as "sports"]).join(" e ");
  const payment = guideUi.payment;
  const gp = fmt(guideUi.gp, { label: globalPaysLabel("pt", settings?.gp_interest_free_installments ?? 6) });
  const minimum = minimumDaysSentence("pt", scoped, settings, true);
  const airport = fmt(guideUi.airportFees, { one: money(dc.fixed_delivery.regular.ownCityAddress), a: money(dc.fixed_delivery.exotic.ownCityAddress) });
  const addresses = businessAddresses((settings?.delivery_config as { bases?: Record<string, { address: string }> } | null)?.bases);
  const bases = (slug.startsWith("miami-ou") ? ["orlando", "miami"] : ["orlando"]).flatMap(city => {
    const address = addresses[city === "orlando" ? 0 : 1];
    if (!address) return [];
    return [city === "orlando" ? `Ponto de entrega/retirada de Orlando: ${addressLine(address)}. ${t("pt").search.orlandoMin}` : fmt(guideUi.base, { city: cityName(city), address: addressLine(address) })];
  });
  const priceRows = slug.startsWith("quanto-custa") ? guidePriceRows(active) : slug.startsWith("miami-ou") ? guidePriceRows(active, true) : [];
  const low = lowestDaily(active.filter((v) => v.city === "orlando" && v.body_category === "exotics"));
  const answer = (copy.answer ? fmt(copy.answer, { label: globalPaysLabel("pt", settings?.gp_interest_free_installments ?? 6) }) : "") || (low == null ? guideUi.priceUnavailable : fmt(guideUi.priceAnswer, { price: low }));
  const facts: Record<string, string[]> = { fees: [fees], payment: [payment], minimum: [minimum], gp: [gp], base: bases, airport: [airport], deposit: [guideUi.deposit], docs: [guideUi.docs], substitute: [guideUi.substitute] };
  const sections = copy.sections.map((s) => ({ ...s, paragraphs: [...(s.fact ? facts[s.fact] ?? [] : []), ...s.paragraphs] }));
  if (slug.startsWith("miami-ou")) {
    const airports = ["orlando", "miami"].map((city) => fmt(guideUi.airports, { city: cityName(city), code: dc.airports[city]?.code ?? "", service: cityName(city === "orlando" ? "tampa" : "fort-lauderdale"), serviceCode: dc.airports[city === "orlando" ? "tampa" : "fort-lauderdale"]?.code ?? "" }));
    sections[2]?.paragraphs.unshift(...airports);
    for (const [from, to] of [["orlando", "tampa"], ["miami", "fort-lauderdale"]]) {
      const cell = cc.matrix[from ?? ""]?.[to ?? ""]?.standard;
      sections[4]?.paragraphs.unshift(cell?.offered && cell.delivery != null && cell.collection != null && cell.both != null ? fmt(guideUi.crossFees, { from: cityName(from ?? ""), to: cityName(to ?? ""), delivery: money(cell.delivery), collection: money(cell.collection), both: money(cell.both) }) : fmt(guideUi.pendingCross, { from: cityName(from ?? ""), to: cityName(to ?? "") }));
    }
    sections[5]?.paragraphs.unshift(guideUi.fll);
  }
  const faqSource = allMain(mainFaq("pt", settings, cities, scoped));
  const topics = slug.startsWith("pid") ? ["docsQ", "minDaysQ", "bookQ", "payQ"] : slug.startsWith("caucao") ? ["depositQ", "payQ", "cancelQ", "minDaysQ"] : slug.startsWith("entrega") ? ["docsQ", "payQ", "minDaysQ"] : ["minDaysQ", "payQ", "pixQ", "approveQ"];
  const questionByKey: Record<string, string> = { docsQ: "Quais documentos preciso?", minDaysQ: "Qual é o mínimo de diárias?", bookQ: "Como funciona a reserva?", payQ: "Quanto pago ao reservar?", depositQ: "Existe caução?", cancelQ: "Qual é a política de cancelamento?", pixQ: "Posso pagar com Pix ou parcelado?", approveQ: "E se meu pedido for recusado?" };
  const faq: FaqItem[] = faqSource.filter((it) => topics.slice(0, 3).some((key) => questionByKey[key] === it.q));
  if (slug.startsWith("entrega")) faq.push({ q: "Quanto custa a entrega no MCO?", a: airport });
  faq.push({ q: t("pt").subst.faqQ, a: guideUi.substitute });
  const groups = discoveryGroups(scoped);
  const links = [ { label: "Orlando", path: "orlando" }, ...(!slug.includes("orlando") || slug.startsWith("miami-ou") ? [{ label: "Miami", path: "miami" }] : []), ...groups.filter((g) => g.kind === "category" && ["exotics", "sports"].includes(g.key)).map((g) => ({ label: `${t("pt").categories[g.key as "sports"]} em ${cityName(g.city)}`, path: g.path })), ...groups.filter((g) => g.kind === "brand").slice(0, 2).map((g) => ({ label: `${g.label} em ${cityName(g.city)}`, path: g.path })), ...groups.filter((g) => g.kind === "model" && scoped.some((v) => g.ids.includes(v.id) && v.body_category === "exotics")).slice(0, 2).map((g) => ({ label: `${g.label} em ${cityName(g.city)}`, path: g.path })), ...scoped.filter((v) => v.body_category === "exotics").slice(0, 2).map((v) => ({ label: `${v.name} em ${cityName(v.city)}`, path: `cars/${v.city}/${v.slug}` })), { label: "Perguntas frequentes", path: "faq" }, { label: "Cancelamento", path: "cancellation" }, { label: "Termos", path: "terms" } ];
  const counts = slug.startsWith("miami-ou") ? groups.filter((g) => g.kind === "category").map((g) => ({ city: cityName(g.city), category: t("pt").categories[g.key as "sports"], count: g.ids.length, models: [...new Set(scoped.filter((v) => g.ids.includes(v.id)).map((v) => v.name))].slice(0, 3).join(", "), path: g.path })) : [];
  return { ...copy, answer, sections, faq, priceRows, counts, links, path: `guides/${slug}`, image: scoped.find((v) => v.body_category === "exotics" && v.city === "orlando")?.id ?? null, closing: guideUi.brand };
}
export type GuideData = NonNullable<ReturnType<typeof buildGuide>>;
export const guidesQuery = () => queryOptions({ queryKey: ["guides-public"], queryFn: async () => { const [cars, settings, cities] = await Promise.all([getVehicles({ data: {} }), getPublicSettings(), getCities()]); return { cars, settings, cities }; } });
export const guideText = (g: GuideData) => [g.title, g.answer, ...g.sections.flatMap((s, i) => [`${i + 1}. ${s.title}`, ...s.paragraphs]), ...g.priceRows.map((r) => `${r.label} em ${r.city}: ${fmt(guideUi.from, { price: r.price })}`), ...g.counts.map((r) => `${r.city} — ${r.category}: ${r.count} unidades. ${r.models}`), g.closing, ...g.faq.flatMap((f) => [f.q, f.a])].join("\n\n");
export function guideHead(g: GuideData) {
  return seoHead({ lang: "pt", path: g.path, title: g.metaTitle, description: g.meta, type: "article", homeLabel: "Início", equivalents: { pt: g.path }, crumbs: [[guideUi.guides, "/guides"], [g.title, `/${g.path}`]], jsonLd: [faqJsonLd(toPairs(g.faq)), { "@context": "https://schema.org", "@type": "Article", headline: g.title, description: g.meta, inLanguage: "pt-BR", mainEntityOfPage: abs(guidePath(g.slug)), author: { "@type": "Organization", name: "Onic Car Rentals", "@id": `${SITE}/#organization` }, publisher: { "@id": `${SITE}/#organization` }, articleBody: guideText(g) }] });
}

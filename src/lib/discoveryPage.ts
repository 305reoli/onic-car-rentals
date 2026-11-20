import { queryOptions } from "@tanstack/react-query";
import { getCities, getPublicSettings, getVehicles } from "@/services/catalog.functions";
import { discoveryGroups, landingFleet, lowestDaily } from "./discovery";
import { aeoUi, fmt, ptDiscoveryText, t } from "./i18n";
import { landingFaq, toPairs } from "./faqContent";
import { abs, faqJsonLd, itemListJsonLd, seoHead } from "./seo";
import { publicPath } from "./publicRoutes";
import { photoUrl, type Vehicle } from "./vehicles";

export const discoveryPageQuery = (citySlug: string, key?: string, category = false) => queryOptions({
  queryKey: ["pt-discovery", citySlug, key ?? "city", category],
  queryFn: async () => {
    const [cities, allCars, rawSettings] = await Promise.all([getCities(), getVehicles({ data: {} }), getPublicSettings()]);
    const settings = rawSettings as typeof rawSettings & { delivery_config?: unknown; payment_modes?: unknown; min_days_by_category?: unknown };
    const city = cities.find((c) => c.slug === citySlug);
    if (!city) return null;
    const groups = discoveryGroups(allCars);
    const group = key ? groups.find((g) => g.city === citySlug && g.key === key && (category ? g.kind === "category" : g.kind === "brand")) ?? (category ? undefined : groups.find((g) => g.city === citySlug && g.key === key && g.kind === "model")) : undefined;
    if (key && !group) return null;
    const cars = group ? allCars.filter((v) => group.ids.includes(v.id)) : landingFleet(allCars, city, settings.delivery_config);
    if (!cars.length) return null;
    const label = group ? group.kind === "category" ? ptDiscoveryText.categoryNames[group.key] ?? group.label : group.label : "carros de luxo";
    const h1 = group ? fmt(ptDiscoveryText.title, { name: label, city: city.name }) : fmt(ptDiscoveryText.cityTitle, { city: city.name });
    const models = [...new Set(cars.map((v) => v.name))].slice(0, 3).join(", ");
    const categories = [...new Set(cars.map((v) => t("pt").categories[v.body_category as "suv"] ?? v.body_category))].join(", ");
    const kind = group?.kind ?? (citySlug === "tampa" || citySlug === "fort-lauderdale" ? citySlug : "city");
    const intro = fmt(ptDiscoveryText.intro[kind] ?? "", { city: city.name, name: label, models, categories });
    const path = group?.path ?? citySlug;
    const related = groups.filter((g) => g.city === citySlug && (group ? group.kind === "model" ? g.ids.some((id) => group.ids.includes(id)) && g.kind !== "model" : g.kind === "model" && g.ids.some((id) => group.ids.includes(id)) : g.kind !== "model"));
    const crumbs: [string, string][] = group ? [[city.name, `/${citySlug}`]] : [];
    if (group?.kind === "model") {
      const brand = groups.find((g) => g.kind === "brand" && g.city === citySlug && g.ids.some((id) => group.ids.includes(id)));
      if (brand) crumbs.push([brand.label, `/${brand.path}`]);
    }
    crumbs.push([group ? label : city.name, `/${path}`]);
    return { city, cars, settings, group: group ?? null, groups: related, h1, intro, path, label, lowest: lowestDaily(cars), faq: landingFaq(h1, cars, settings, citySlug, city.name, group?.kind === "model"), crumbs };
  },
});
export type DiscoveryData = NonNullable<Awaited<ReturnType<NonNullable<ReturnType<typeof discoveryPageQuery>["queryFn"]>>>>;

export function discoveryHead(data: DiscoveryData | null | undefined, fallbackPath: string) {
  if (!data) return seoHead({ lang: "pt", path: fallbackPath, title: "Página não encontrada — Sua Locadora", description: "Esta seleção não está disponível.", noindex: true, equivalents: { pt: fallbackPath } });
  const products = data.cars.map((v: Vehicle) => ({ "@context": "https://schema.org", "@type": "Product", name: v.name, description: v.description_pt, image: abs(photoUrl(v.photos[0])), url: abs(publicPath("pt", `cars/${v.city}/${v.slug}`)), ...(v.daily_price_usd == null ? {} : { offers: { "@type": "Offer", price: v.daily_price_usd, priceCurrency: "USD", unitText: "DAY", url: abs(publicPath("pt", `cars/${v.city}/${v.slug}`)), priceSpecification: { "@type": "UnitPriceSpecification", price: v.daily_price_usd, priceCurrency: "USD", referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitText: "DAY" } } } }) }));
  return seoHead({ lang: "pt", path: data.path, title: `${data.h1} | Sua Locadora`, description: fmt(aeoUi.pt.listingMeta, { category: data.label, city: data.city.name }), homeLabel: t("pt").seo.home, crumbs: data.crumbs, ...(data.group && data.group.kind !== "category" ? { equivalents: { pt: data.path } } : {}), jsonLd: [faqJsonLd(toPairs(data.faq)), itemListJsonLd(data.h1, data.cars.map((v) => ({ name: v.name, path: `/pt/cars/${v.city}/${v.slug}`, image: photoUrl(v.photos[0]) }))), ...products] });
}
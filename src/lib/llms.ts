// Plain-markdown summaries for AI assistants (/llms.txt and /llms-full.txt). Facts come from seo.ts BUSINESS.
import { allMain, faqText, mainFaq } from "@/lib/faqContent";
import { CALL_PHONE_DISPLAY, ownerText, LANGS } from "@/lib/i18n";
import { publicPath } from "@/lib/publicRoutes";
import { discoveryGroups } from "@/lib/discovery";
import { buildGuide, guidePath, guideText, type GuideSettings } from "@/lib/guides";
import { guideCopy } from "@/lib/i18n.guides";
import { blogPosts, blogPathKey } from "@/data/blog";
import { effectiveMinDays } from "@/lib/pricing";
import { addressLine, BUSINESS, businessAddresses, googleProfileUrl, SITE, type Postal } from "@/lib/seo";

type Car = { id: string; brand: string; model: string; active: boolean; name: string; city: string; slug: string; body_category: string; is_convertible: boolean; daily_price_usd: number | null; seats: number | null; bags: number | null; min_days?: number | null };
type St = GuideSettings;
type City = { slug: string; name: string; fleet_from_city: string };

const CAT = { suv: "SUV", sedan: "Sedan", luxury: "Luxury", convertible: "Convertible", sports: "Sports", exotics: "Exotics" } as Record<string, string>;

export function llmsText(cities: City[], cars: Car[] | null, addresses: Postal[] = businessAddresses(null), googleUrl: string | null = null, st: St = null, allCars: Car[] = cars ?? [], full = !!cars) {
  const cityName = (s: string) => cities.find((c) => c.slug === s)?.name ?? s;
  const lines = [
    "# Sua Locadora",
    "",
    "> Specialist sports & exotic car rental service for Brazilians in the USA — Orlando and Miami (the Orlando fleet also serves Tampa, the Miami fleet also serves Fort Lauderdale). Since 2022. Operated by Sua Empresa LLC. Service in Portuguese, English and Spanish.",
    "",
    "Sua Locadora rents exotic, luxury and premium cars (Ferrari, Lamborghini, Rolls-Royce, Mercedes-Benz G63, Cadillac Escalade, Porsche, luxury SUVs and convertibles) with concierge delivery.",
    "The multilingual Blog publishes sourced Ferrari, Lamborghini and Porsche news and model stories in Portuguese, English and Spanish.",
    "",
    `## ${faqText("en").whoTitle}`,
    ...faqText("en").who.map((x) => `- ${x}`),
    "",
    "## Services",
    "- Exotic, luxury and premium car rental.",
    "- Delivery and collection at MCO, MIA, FLL and TPA airports, hotels or any address.",
    "- Cross-city service (non-exotic cars).",
    "- Multilingual support (EN/PT/ES).",
    "",
    "## The Sua experience (concierge, arranged on request via WhatsApp)",
    "- No rental counter and no lines: the car is hand-delivered to the customer.",
    "- Airport reception: the team personally receives the customer at arrivals.",
    "- Private-jet delivery: the car can be delivered at the aircraft or FBO in the Orlando and Miami areas, arranged in advance case by case.",
    "- The customer receives the exact car they chose — never \"or similar\".",
    "- Portuguese-speaking, personal service (also English and Spanish); 24-hour concierge care.",
    "- On request: hotel escort and check-in help, a first grocery run for house stays in Orlando, and a WhatsApp city guide during the stay.",
    "",
    "## Cities and delivery",
    ...cities.map((c) => `- ${c.name}: ${c.fleet_from_city && c.fleet_from_city !== c.slug ? `served by the ${cityName(c.fleet_from_city)} fleet` : "own fleet"} — ${SITE}${publicPath("en", c.slug)}`),
    "- Delivery to airports MCO (Orlando), MIA (Miami), FLL (Fort Lauderdale) and TPA (Tampa), to hotels and resorts, or to any address.",
    "- Pricing: daily rate + basic insurance and toll coverage per day (non-exotic cars only) + delivery + add-ons + sales tax. Everything itemized before you pay — no hidden fees.",
    ...addresses.map((a) => `- Address: ${addressLine(a)}, USA`),
    `- ${ownerText.en.hours}`,
    "",
    "## Categories",
    "- SUV · Sedan · Luxury · Convertible · Sports · Exotics",
    "",
    "## How online booking works",
    "1. Choose a city, dates and a car, pickup/return locations and add-ons on the website.",
    "2. Enter driver details and upload driver's license (front and back) and passport (or a second government photo ID for US residents).",
    "3. Accept the Terms, then pay 100% of the rental total at booking through Stripe or Global Pays. All cars use full payment, with no partial payment or rental amount to pay later. The security deposit at pickup is separate.",
    "4. You'll receive your booking confirmation within minutes or up to 2 hours during business hours. After approval, sign the rental agreement; the rental is already paid in full. If not approved, the payment is refunded in full.",
    "- All prices are in US dollars (USD). Public prices are shown as \"From $X/day\".",
    "",
    "## Languages",
    `- English (${SITE}${publicPath("en")}), Português (${SITE}${publicPath("pt")}), Español (${SITE}${publicPath("es")})`,
    "",
    "## Contact",
    `- Call us: ${CALL_PHONE_DISPLAY}`,
    `- WhatsApp: ${BUSINESS.phoneDisplay} (https://wa.me/15551234567)`,
    `- Email: ${BUSINESS.email}`,
    `- Instagram: ${BUSINESS.instagram}`,
    ...(googleUrl ? [`- Google Business Profile: ${googleUrl}`] : []),
    "",
    "## Main pages",
    `- [Início em português](${SITE}${publicPath("pt")}): Sua Locadora desde 2022`,
    ...cities.map((c) => `- [Aluguel de carros em ${c.name}](${SITE}${publicPath("pt", c.slug)}): Catálogo e regras de entrega`),
    ...discoveryGroups(allCars).filter((g) => full || g.kind === "category").map((g) => `- [${g.label} em ${cityName(g.city)}](${SITE}${publicPath("pt", g.path)}): ${g.kind === "model" ? "Todas as unidades deste modelo na cidade" : "Carros do catálogo ativo"}`),
    `- [Home](${SITE}${publicPath("en")}): Exotic & luxury car rental in Florida`,
    ...cities.map((c) => `- [${c.name}](${SITE}${publicPath("en", c.slug)}): Exotic car rental in ${c.name}`),
    `- [Fleet](${SITE}${publicPath("en", "fleet")}): All cars`,
    `- [How it works](${SITE}${publicPath("en", "how-it-works")}): Booking steps`,
    `- [FAQ](${SITE}${publicPath("en", "faq")}): Pre-reservation, tolls, delivery, documents`,
    `- [Virtual catalog](${SITE}${publicPath("en", "catalog")}): Catalog by city and category`,
    "",
    "## Guias em português",
    `- [Guias](${SITE}${guidePath()}): Documentos, pagamento, caução e entrega na Flórida`,
    ...guideCopy.map((g) => `- [${g.title}](${SITE}${guidePath(g.slug)}): ${g.meta}`),
    "",
    "## Blog",
    ...LANGS.flatMap(lang => [
      `- [Blog (${lang.toUpperCase()})](${SITE}${publicPath(lang, "blog")}): Sourced automotive news and model stories`,
      ...blogPosts.map(p => `- [${p.translations[lang].title}](${SITE}${publicPath(lang, blogPathKey(p.slug))}): ${p.translations[lang].excerpt}`),
    ]),
    "",
    "## Optional",
    `- [Terms](${SITE}${publicPath("en", "terms")})`,
    `- [Privacy](${SITE}${publicPath("en", "privacy")})`,
    `- [Cancellation & refunds](${SITE}${publicPath("en", "cancellation")})`,
    `- [Legal & company information](${SITE}${publicPath("en", "legal")})`,
    `- [Full car list for AI](${SITE}/llms-full.txt)`,
  ];
  // FAQ: same strings as the visible accordion and the FAQPage JSON-LD.
  for (const lang of full ? LANGS : (["en"] as const)) {
    const f = allMain(mainFaq(lang, st as never, cities, allCars));
    lines.push("", `## FAQ (${lang.toUpperCase()}) — ${SITE}${publicPath(lang, "faq")}`);
    for (const it of f) lines.push("", `### ${it.q}`, it.a + (it.href ? ` (${SITE}${it.href})` : ""));
  }
  if (cars) {
    lines.push("", "## Full fleet (base city · category · from-price per day, USD · minimum rental)");
    for (const base of [...new Set(cars.map((c) => c.city))]) {
      const served = cities.filter((c) => (c.fleet_from_city || c.slug) === base).map((c) => c.name).join(", ");
      lines.push("", `### ${cityName(base)} fleet (available in: ${served})`);
      for (const c of cars.filter((x) => x.city === base)) {
        const cat = `${CAT[c.body_category] ?? c.body_category}${c.is_convertible ? " + Convertible" : ""}`;
        lines.push(`- [${c.name}](${SITE}${publicPath("en", `cars/${c.city}/${c.slug}`)}) · ${cat} · ${c.daily_price_usd != null ? `from $${c.daily_price_usd}/day` : "price on request"} · ${minTxt(effectiveMinDays(c, st?.min_days_by_category).n)}`);
      }
    }
  }
  if (full) for (const copy of guideCopy) {
    const guide = buildGuide(copy.slug, allCars, st, cities);
    if (guide) lines.push("", `## Guia — ${SITE}${guidePath(copy.slug)}`, guideText(guide));
  }
  if (full) for (const post of blogPosts) for (const lang of LANGS) {
    const copy = post.translations[lang];
    lines.push("", `## Blog — ${SITE}${publicPath(lang, blogPathKey(post.slug))}`, `${copy.title}\n\nSua Locadora · ${post.date}\n\n${copy.intro}\n\n${copy.sections.flatMap(s => [s.title, ...s.paragraphs]).join("\n\n")}\n\n${copy.cta}\n\nSources: ${post.sources.map(s => s.url ? `${s.name} (${s.url})` : s.name).join(" · ")}`);
  }
  return lines.join("\n") + "\n";
}

const minTxt = (n: number) => (n === 1 ? "minimum rental 1 day" : `minimum rental ${n} days`);

export async function llmsResponse(full: boolean) {
  const { publicClient } = await import("@/services/public-client.server");
  const { readActivePublicCars } = await import("@/services/public-catalog.server");
  const db = publicClient();
  const [{ data: cities, error: e1 }, cars, { data: st }] = await Promise.all([
    db.from("cities").select("slug, name, fleet_from_city").eq("active", true).order("sort_order"),
    readActivePublicCars().then((data) => ({ data, error: false })).catch(() => ({ data: [], error: true })),
    db.from("settings").select("delivery_config, google_business_url, payment_modes, prereservation_min_usd, min_days_by_category, gp_interest_free_installments").eq("id", 1).maybeSingle(),
  ]);
  if (e1 || cars.error) return new Response("Temporarily unavailable", { status: 503 });
  const allCars = (cars.data ?? []) as Car[];
  return new Response(llmsText(cities ?? [], full ? allCars : null, businessAddresses((st?.delivery_config as { bases?: Record<string, { address: string }> } | null)?.bases), googleProfileUrl((st as { google_business_url?: string } | null)?.google_business_url, process.env["GOOGLE_PLACE_ID"] || null), st as St, allCars, full), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

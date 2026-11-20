// Single source for public-page SEO: absolute canonical/og:url on the brand domain, hreflang
// (en/pt/es + x-default), OpenGraph/Twitter, robots, and JSON-LD (AutoRental org on every page,
// BreadcrumbList on inner pages, plus page-specific entities). Business facts live here once.
import { LANGS, aeoUi, fmt, t, type Lang } from "@/lib/i18n";
import { DEFAULT_DELIVERY } from "@/lib/pricing";
import { localizedPath, publicPath } from "@/lib/publicRoutes";
import { editorialMeta } from "@/lib/aeo";

export const SITE = "https://oniccarrentals.com";
export const abs = (p: string) => (/^https?:\/\//.test(p) ? p : `${SITE}${p.startsWith("/") ? "" : "/"}${p}`);
export const DEFAULT_IMAGE = abs("/brand/og-1200x630.jpg");
export const OG_IMAGE_ALT = "Onic Car Rentals";
export const LOGO = abs("/logo.png");
const OG_LOCALE: Record<Lang, string> = { en: "en_US", pt: "pt_BR", es: "es_ES" };

export const BUSINESS = {
  name: "Onic Car Rentals",
  legalName: "Reoli LLC",
  telephone: "+19542480903",
  phoneDisplay: "+1 (954) 248-0903",
  email: "info@oniccarrentals.com",
  foundingDate: "2014",
  priceRange: "$$",
  openingHours: "Mo-Su 08:00-19:45",
  instagram: "https://instagram.com/oniccarrentals",
  cities: ["Orlando", "Miami", "Fort Lauderdale", "Tampa"],
} as const;

export type Postal = { streetAddress: string; addressLocality: string; addressRegion: string; postalCode?: string; addressCountry: "US" };
export const addressLine = (a: Postal) =>
  `${a.streetAddress}, ${a.addressLocality}, ${a.addressRegion}${a.postalCode ? ` ${a.postalCode}` : ""}`;
/** "1000 Lincoln Rd, Miami Beach, FL 33139" → PostalAddress parts. */
export function postalFrom(address: string): Postal {
  const parts = address.split(",").map((x) => x.trim()).filter(Boolean);
  const m = /^([A-Z]{2})(?:\s+(\d{5}))?/.exec(parts[2] ?? "");
  return { streetAddress: parts[0] ?? address, addressLocality: parts[1] ?? "", addressRegion: m?.[1] ?? "FL", ...(m?.[2] ? { postalCode: m[2] } : {}), addressCountry: "US" };
}
/** Public business addresses = the owner-editable fleet bases (Settings → Delivery & add-ons), Orlando first. */
export function businessAddresses(bases: Record<string, { address: string }> | undefined | null): Postal[] {
  const b = { ...DEFAULT_DELIVERY.bases, ...(bases ?? {}) };
  return ["orlando", "miami"].filter((k) => b[k]?.address).map((k) => postalFrom(b[k]!.address));
}

export const KEYWORDS = "exotic car rental Florida, exotic car rental Orlando, exotic car rental Miami, exotic car rental Fort Lauderdale, exotic car rental Tampa, luxury car rental, rent Ferrari Orlando, rent Lamborghini Miami, aluguel de carros exóticos Florida, Onic Car Rentals";

/** Google Business Profile URL: owner setting first, else derived from the reviews Place ID. Never invented. */
export function googleProfileUrl(setting?: string | null, placeId?: string | null): string | null {
  const u = (setting ?? "").trim();
  if (/^https?:\/\//.test(u)) return u;
  return placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : null;
}

export function orgJsonLd(_addresses: Postal[], _description?: string, _googleUrl?: string | null) {
  return {
    "@context": "https://schema.org",
    "@type": ["AutoRental", "Organization"],
    name: BUSINESS.name,
    legalName: BUSINESS.legalName,
    url: SITE,
    telephone: BUSINESS.telephone,
    email: BUSINESS.email,
    sameAs: ["https://www.instagram.com/oniccarrentals", "https://search.google.com/local/writereview?placeid=ChIJNyybg_oR00wRh4n0-LvkXoU"],
    areaServed: ["Orlando", "Miami", "Tampa", "Fort Lauderdale"].map((name) => ({ "@type": "City", name, addressRegion: "FL", addressCountry: "US" })),
    location: [
      { "@type": "Place", address: { "@type": "PostalAddress", streetAddress: "789 Sua Rua", addressLocality: "Winter Garden", addressRegion: "FL", addressCountry: "US" } },
      { "@type": "Place", address: { "@type": "PostalAddress", streetAddress: "1000 Lincoln Rd", addressLocality: "Miami Beach", addressRegion: "FL", postalCode: "33139", addressCountry: "US" } },
    ],
    aggregateRating: { "@type": "AggregateRating", ratingValue: 5.0, reviewCount: 53 },
    priceRange: BUSINESS.priceRange,
  };
}

/** Car-page schema uses only the public name, gallery, canonical and displayed daily price. */
export type ProductReviewData = { rating?: number | null; total?: number | null; reviews?: { author?: string | null; rating?: number | null; text?: string | null }[] | null } | null | undefined;
export type ProductExtras = { description?: string | null; brand?: string | null; reviews?: ProductReviewData };

const posNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

export function productJsonLd(name: string, photos: string[], url: string, price: number | null | undefined, extras: ProductExtras = {}) {
  const desc = extras.description?.trim();
  const brand = extras.brand?.trim();
  const rv = extras.reviews;
  const agg = rv && posNum(rv.rating) && rv.rating <= 5 && posNum(rv.total) ? { "@type": "AggregateRating", ratingValue: rv.rating, reviewCount: rv.total } : null;
  const reviews = (rv?.reviews ?? [])
    .filter((r) => r && r.author?.trim() && r.text?.trim() && posNum(r.rating) && r.rating <= 5)
    .slice(0, 3)
    .map((r) => ({ "@type": "Review", author: { "@type": "Person", name: r.author!.trim() }, reviewRating: { "@type": "Rating", ratingValue: r.rating }, reviewBody: r.text!.trim() }));
  return {
    "@context": "https://schema.org", "@type": "Product", name, url,
    image: photos.map(abs),
    ...(desc ? { description: desc } : {}),
    ...(brand ? { brand: { "@type": "Brand", name: brand } } : {}),
    ...(price != null && Number.isFinite(price) && price > 0 ? { offers: { "@type": "Offer", price, priceCurrency: "USD", availability: "https://schema.org/InStock" } } : {}),
    ...(agg ? { aggregateRating: agg } : {}),
    ...(reviews.length ? { review: reviews } : {}),
  };
}

export const breadcrumbJsonLd = (crumbs: [string, string][]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: crumbs.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(localizedPath(path)) })),
});

export const itemListJsonLd = (name: string, items: { name: string; path: string; image?: string | undefined }[]) => ({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name,
  numberOfItems: items.length,
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, url: abs(localizedPath(it.path)), ...(it.image ? { image: abs(it.image) } : {}) })),
});

export const faqJsonLd = (items: readonly (readonly string[])[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
});

type SeoInput = {
  lang: Lang;
  /** Path after the language prefix, e.g. "" (home), "/miami", "/cars/miami/ferrari-portofino". */
  path: string;
  title: string;
  description: string;
  type?: "website" | "product" | "article";
  image?: string | null | undefined;
  noindex?: boolean;
  keywords?: string;
  /** Breadcrumbs AFTER Home: [label, path-after-lang]. Home is added automatically. */
  crumbs?: [string, string][];
  jsonLd?: object[];
  homeLabel?: string;
  equivalents?: Partial<Record<Lang, string>>;
};

export function seoHead(i: SeoInput) {
  const sourceDescription = /^\/?catalog\//.test(i.path) ? `${t(i.lang).seo.catalog}: ${i.description}` : /^\/?search$/.test(i.path) ? fmt(aeoUi[i.lang].listingMeta, { category: t(i.lang).fleet.all, city: "Florida" }) : i.description;
  const description = /^\/?(?:cars|checkout|booking|my-booking|terms|cancellation)(?:\/|$)/.test(i.path) || !sourceDescription ? sourceDescription : editorialMeta(sourceDescription, i.lang);
  const url = abs(publicPath(i.lang, i.path));
  // One brand share image for every page and language (owner decision).
  const image = DEFAULT_IMAGE;
  // AutoRental org JSON-LD is emitted once per page by the root route (addresses come from settings).
  const ld: object[] = [];
  if (i.crumbs?.length) ld.push(breadcrumbJsonLd([[i.homeLabel ?? "Home", `/${i.lang}`], ...i.crumbs.map(([n, p]) => [n, `/${i.lang}${p}`] as [string, string])]));
  ld.push(...(i.jsonLd ?? []));
  return {
    meta: [
      { title: i.title },
      { name: "description", content: description },
      ...(i.keywords ? [{ name: "keywords", content: i.keywords }] : []),
      { name: "robots", content: i.noindex ? "noindex, follow" : "index, follow" },
      { property: "og:title", content: i.title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:site_name", content: "Onic Car Rentals" },
      { property: "og:type", content: i.type ?? "website" },
      { property: "og:image", content: image },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: OG_IMAGE_ALT },
      { property: "og:locale", content: OG_LOCALE[i.lang] },
      ...LANGS.filter((l) => l !== i.lang).map((l) => ({ property: "og:locale:alternate", content: OG_LOCALE[l] })),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: i.title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
      { name: "twitter:image:alt", content: OG_IMAGE_ALT },
    ],
    links: [
      { rel: "canonical", href: url },
      ...LANGS.flatMap((l) => i.equivalents && i.equivalents[l] == null ? [] : [{ rel: "alternate", hrefLang: l, href: abs(publicPath(l, i.equivalents?.[l] ?? i.path)) }]),
      { rel: "alternate", hrefLang: "x-default", href: abs(publicPath("pt", i.path)) },
    ],
    scripts: ld.map((o) => ({ type: "application/ld+json", children: JSON.stringify(o) })),
  };
}

/** Static pages: title/description from the i18n meta table. */
export function pageHead(lang: Lang, key: keyof ReturnType<typeof t>["meta"], path: string, extra: Partial<SeoInput> = {}) {
  const tr = t(lang);
  const [title = "Onic Car Rentals", description = ""] = tr.meta[key];
  return seoHead({ lang, path, title, description, homeLabel: tr.seo.home, ...(path ? { crumbs: [[title.split(" — ")[0]!.split(" | ")[0]!, path]] as [string, string][] } : {}), ...extra });
}

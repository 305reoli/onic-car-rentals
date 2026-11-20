import type { Lang } from "@/lib/i18n";

// The router retains typed internal route IDs. Only public Portuguese content
// URLs are translated; transactional and operational URLs are never rewritten.
export const PT_SLUGS = {
  home: "", fleet: "frota", "how-it-works": "como-funciona", faq: "perguntas-frequentes",
  catalog: "catalogo", search: "buscar", terms: "termos", privacy: "privacidade",
  cancellation: "cancelamento", legal: "informacoes-legais", cars: "carros", guides: "guias", blog: "blog", about: "quem-somos", reviews: "depoimentos",
} as const;
const CITY_PREFIX = "aluguel-de-carros-de-luxo-em-";
export const PT_CATEGORY_SLUGS: Record<string, string> = { suv: "suv", sedan: "sedans", luxury: "premium", convertible: "conversiveis", sports: "esportivos", exotics: "exoticos" };
export const slugify = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const discoveryKey = (kind: "brand" | "model", city: string, key: string) => `discover/${kind}/${city}/${key}`;
const TRANSACTIONS = /^(checkout|booking|my-booking|payment|payments|callback|return)(\/|$)/;
const RESERVED = /^(admin|auth|api)(\/|$)|^[^/]+\.[^/]+$/;

export function publicPath(lang: Lang, page: string = ""): string {
  const rest = page.replace(/^\/+|\/+$/g, "");
  const hub = /^brand-hub\/([^/]+)\/([^/]+)$/.exec(rest);
  if (hub) return lang === "pt" ? `/${hub[2]}-em-${hub[1]}` : `/${lang}/${hub[2]}-${lang === "en" ? "in" : "en"}-${hub[1]}`;
  if (lang === "es" && rest === "about") return "/es/quienes-somos";
  if (lang === "es" && rest === "reviews") return "/es/testimonios";
  if (lang !== "pt" || TRANSACTIONS.test(rest)) return `/${lang}${rest ? `/${rest}` : ""}`;
  if (!rest) return "/";
  const [first = "", ...tail] = rest.split("/");
  if (first === "discover") return `/aluguel-de-${tail[2]}-em-${tail[1]}`;
  if ((first === "orlando" || first === "miami") && tail.length === 1 && tail[0] && PT_CATEGORY_SLUGS[tail[0]]) return `/aluguel-de-carros-${PT_CATEGORY_SLUGS[tail[0]]}-em-${first}`;
  const slug = PT_SLUGS[first as keyof typeof PT_SLUGS];
  return `/${slug ?? `${CITY_PREFIX}${first}`}${tail.length ? `/${tail.join("/")}` : ""}`;
}

export function internalPath(path: string): string {
  if (path === "/") return "/pt";
  if (path === "/es/quienes-somos") return "/es/about";
  if (path === "/es/testimonios") return "/es/reviews";
  const hub = /^(?:\/(en|es))?\/([a-z0-9-]+)-(em|in|en)-(orlando|miami|tampa|fort-lauderdale)$/.exec(path);
  if (hub && !hub[2]?.startsWith("aluguel-de-")) return `/${hub[1] ?? "pt"}/brand-hub/${hub[4]}/${hub[2]}`;
  const [first = "", ...tail] = path.replace(/^\//, "").split("/");
  const category = /^aluguel-de-carros-(.+)-em-(orlando|miami)$/.exec(first);
  if (category && !tail.length) {
    const key = Object.entries(PT_CATEGORY_SLUGS).find(([, slug]) => slug === category[1])?.[0];
    if (key) return `/pt/${category[2]}/${key}`;
  }
  const discovery = /^aluguel-de-(.+)-em-(orlando|miami)$/.exec(first);
  if (discovery && !tail.length && !first.startsWith(CITY_PREFIX)) return `/pt/discover/model/${discovery[2]}/${discovery[1]}`;
  if (first.startsWith(CITY_PREFIX)) return `/pt/${first.slice(CITY_PREFIX.length)}${tail.length ? `/${tail.join("/")}` : ""}`;
  const key = Object.entries(PT_SLUGS).find(([, slug]) => slug && slug === first)?.[0];
  return key ? `/pt/${key}${tail.length ? `/${tail.join("/")}` : ""}` : path;
}

export function localizedPath(path: string): string {
  const m = /^\/(en|pt|es)(?:\/(.*))?$/.exec(path);
  return m ? publicPath(m[1] as Lang, m[2] ?? "") : path;
}

export function equivalentPath(path: string, lang: Lang): string {
  const internal = internalPath(path);
  const m = /^\/(en|pt|es)(?:\/(.*))?$/.exec(internal);
  if (!m || RESERVED.test(m[2] ?? "")) return publicPath(lang);
  if (/^guides(?:\/|$)/.test(m[2] ?? "") && lang !== "pt") return publicPath(lang);
  if (m[2]?.startsWith("discover/") && lang !== "pt") return publicPath(lang, m[2].split("/")[2] ?? "");
  return publicPath(lang, m[2] ?? "");
}

export const publicUrlRewrite = {
  input: ({ url }: { url: URL }) => { url.pathname = internalPath(url.pathname); return url; },
  output: ({ url }: { url: URL }) => { url.pathname = localizedPath(url.pathname); return url; },
};

export function legacyPtRedirect(path: string): string | null {
  const oldCategory = /^\/aluguel-de-carros-de-luxo-em-(orlando|miami)\/([^/]+)$/.exec(path);
  if (oldCategory && oldCategory[1] && oldCategory[2] && PT_CATEGORY_SLUGS[oldCategory[2]]) return publicPath("pt", `${oldCategory[1]}/${oldCategory[2]}`);
  if (!/^\/pt(?:\/|$)/.test(path)) return null;
  const rest = path.replace(/^\/pt\/?/, "");
  if (TRANSACTIONS.test(rest) || RESERVED.test(rest)) return null;
  const next = publicPath("pt", rest);
  return next === path ? null : next;
}
// Old-site (pre-2026) URLs → live pages. `null` = no live equivalent → homepage. Keys verified against the live sitemap 2026-11-08.
const OLD_SITE_CARS: Record<string, string | null> = {
  "bentley-bentayga-s-black-brown": "miami/bentley-bentayga-s",
  "bmw-440i-convertible-black-black": null,
  "bmw-x2-orlando": null,
  "bmw-x5-orlando": null,
  "cadillac-escalade-600-black-black-2025": "miami/cadillac-new-escalade-2",
  "cadillac-escalade-new-orlando": "orlando/cadillac-new-escalade",
  "cadillac-escalade-orlando": "orlando/cadillac-escalade",
  "cadillac-xt4-orlando": null,
  "cadillac-xt6-orlando": null,
  "chevrolet-corvette-c8-convertible-yellow-black": "miami/chevrolet-corvette-c8-yellow",
  "chevrolet-corvette-c8-orlando": "orlando/chevrolet-corvette-c8",
  "chevrolet-corvette-convertible-blue-black": "miami/chevrolet-corvette-c8",
  "chevrolet-suburban-lt-dark-grey-black": null,
  "chevrolet-suburban-orlando": "orlando/chevrolet-suburban",
  "chevrolet-suburban-rst-duramax-black-black": "miami/chevrolet-suburban",
  "chevrolet-suburban-white-black": null,
  "chrysler-300c-black-cream": null,
  "chrysler-pacifica-orlando": "orlando/chrysler-pacifica",
  "dodge-challenger-orlando": "orlando/dodge-challenger-gt",
  "dodge-charger-orlando": "orlando/dodge-charger-gt",
  "ferrari-488-gtb-orlando": null,
  "ferrari-488-spider-rosso-corsa": null,
  "ferrari-f8-tributo-spider-rosso-corsa-brown": null,
  "ferrari-portofino-m-orlando": null,
  "ferrari-purosangue-rosso-corsa-brown": "miami/ferrari-purosangue",
  "ford-bronco-orlando": null,
  "ford-mustang-convertible-red-black": "miami/ford-new-mustang",
  "ford-mustang-new-orlando": "orlando/ford-new-mustang",
  "ford-mustang-orlando": null,
  "gmc-acadia-orlando": "orlando/gmc-acadia",
  "honda-cr-v-hybrid-sport-grey-black": "miami/honda-cr-v",
  "honda-pilot-grey-black": null,
  "hyundai-elantra-grey-grey": null,
  "hyundai-elantra-orlando": null,
  "hyundai-palisade-orlando": null,
  "jeep-compass-orlando": "orlando/jeep-compass",
  "jeep-wagoneer-black-black": "miami/jeep-grand-wagoneer",
  "jeep-wagoneer-orlando": "orlando/jeep-wagoneer",
  "jeep-wagoneer-white-black": "miami/jeep-wagoneer-l",
  "jeep-wrangler-jl-convertible-black-black": "miami/jeep-wrangler-rubicon",
  "kia-carnival-green-grey": "miami/kia-carnival",
  "kia-carnival-grey-brown": "miami/kia-carnival",
  "kia-carnival-orlando": "orlando/kia-carnival",
  "kia-sedona-orlando": null,
  "kia-sorento-grey-tan": null,
  "kia-sorento-orlando": null,
  "kia-soul-orlando": null,
  "kia-telluride-orlando": null,
  "kia-telluride-white-black": null,
  "lamborghini-huracan-evo-spyder-bianco-icarus-black": "miami/lamborghini-huracan-evo-spyder-2",
  "lamborghini-huracan-evo-spyder-le-mans-blue-black": null,
  "lamborghini-huracan-evo-spyder-orlando": "orlando/lamborghini-huracan-evo-spyder",
  "lamborghini-huracan-evo-spyder-rwd-rosso-mars-black": "miami/lamborghini-huracan-evo-spyder",
  "lamborghini-urus-arancio-borealis-black-orange": null,
  "lamborghini-urus-orlando": null,
  "lamborghini-urus-performante-arancio-borealis-black": null,
  "lamborghini-urus-se-black-red": "miami/lamborghini-urus-se",
  "land-rover-defender-white-grey": "miami/land-rover-defender",
  "land-rover-discovery-grey-black": null,
  "land-rover-range-rover-p400-black-black": null,
  "land-rover-range-rover-sport-p400-dynamic-grey-red": "miami/range-rover-sport-p400",
  "mclaren-570s-orlando": null,
  "mercedes-benz-c300-convertible-black-brown": "miami/mercedes-benz-c300-cabrio",
  "mercedes-benz-g63-amg-orlando": null,
  "mercedes-benz-g63-amg-white-red": "miami/mercedes-benz-g63-amg",
  "mercedes-benz-gle300-orlando": null,
  "mercedes-benz-gls450-black-brown": null,
  "mercedes-benz-maybach-gls600-champagne-black": null,
  "porsche-718-boxster-orlando": null,
  "porsche-911-carrera-convertible-slate-grey-black": "miami/porsche-911",
  "porsche-cayenne-coupe-white-black": "miami/porsche-cayenne-coupe",
  "porsche-cayenne-grey-black": null,
  "porsche-cayman-orlando": "orlando/porsche-718-cayman",
  "porsche-macan-black-black": "miami/porsche-macan",
  "porsche-macan-grey-black": "orlando/porsche-macan",
  "porsche-macan-orlando": "orlando/porsche-macan",
  "porsche-panamera-4-e-hybrid-white-black": "miami/porsche-panamera-hybrid",
  "rolls-royce-cullinan-black-brown": "miami/rolls-royce-cullinan",
  "tesla-cybertruck-awd": "miami/tesla-cybertruck",
  "tesla-cybertruck-orlando": "orlando/tesla-cybertruck",
  "tesla-model-x-orlando": "orlando/tesla-model-x",
  "tesla-model-y-dual-motor-white-white": null,
};
/** City-less old brand links use the brand's Orlando hub, else Miami; null = no live hub. */
export const OLD_SITE_BRANDS: Record<string, "orlando" | "miami" | null> = {
  bentley: "miami", bmw: "orlando", cadillac: "orlando", chevrolet: "orlando", chrysler: "orlando", dodge: "orlando",
  ferrari: "orlando", ford: "orlando", gmc: "orlando", honda: "miami", hyundai: "orlando", jeep: "orlando", kia: "orlando",
  lamborghini: "orlando", "land-rover": "orlando", mclaren: null, "mercedes-benz": "orlando", porsche: "orlando",
  "rolls-royce": "miami", tesla: "orlando",
};
/** Known broken short car links: live car page, else the fleet (no Tiguan in the fleet). */
const SHORT_CAR_LINKS: Record<string, string> = { "ferrari-portofino": "cars/miami/ferrari-portofino", "vw-tiguan": "fleet" };
const OLD_SITE_PAGES: Record<string, string> = { vehicles: "fleet", "rent-a-car/orlando": "orlando", "rent-a-car/miami": "miami", about: "about", contact: "about" };

/** 301 target for an old-site URL (English set or /pt-BR mirror), or null when the path is not an old-site URL. */
export function legacyOldSiteRedirect(path: string): string | null {
  const m = /^(\/pt-BR)?(?:\/(.*?))?\/?$/i.exec(path);
  if (!m) return null;
  const pt = Boolean(m[1]);
  const rest = m[2] ?? "";
  const lang: Lang = pt ? "pt" : "en";
  const home = publicPath(lang);
  if (pt && rest === "") return home;
  const short = /^(en|es)\/(vw-tiguan|ferrari-portofino)$/.exec(rest);
  if (short?.[1] && short[2]) return publicPath(short[1] as Lang, SHORT_CAR_LINKS[short[2]] ?? "fleet");
  if (pt && rest === "privacidade") return publicPath("pt", "privacy");
  const page = OLD_SITE_PAGES[rest];
  if (page) return publicPath(lang, page);
  const car = /^vehicles\/([^/]+)$/.exec(rest);
  if (car?.[1] && car[1] in OLD_SITE_CARS) { const t = OLD_SITE_CARS[car[1]]; return t ? publicPath(lang, `cars/${t}`) : home; }
  const brand = /^brands\/([^/]+)$/.exec(rest);
  if (brand?.[1] && brand[1] in OLD_SITE_BRANDS) { const c = OLD_SITE_BRANDS[brand[1]]; return c ? (pt ? `/${brand[1]}-em-${c}` : `/en/${brand[1]}-in-${c}`) : home; }
  return null;
}

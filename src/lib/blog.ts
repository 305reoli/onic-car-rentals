import { queryOptions } from "@tanstack/react-query";
import { blogPosts, blogPathKey, type BlogPost } from "@/data/blog";
import { vehiclesQuery } from "./queries";
import { discoveryGroups } from "./discovery";
import { publicPath } from "./publicRoutes";
import { blogUi, t, type Lang } from "./i18n";
import { abs, seoHead, SITE } from "./seo";
import { sizedPhoto, type Vehicle } from "./vehicles";

export const blogQuery = () => queryOptions({ ...vehiclesQuery(), staleTime: 60_000 });
const normalized = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function blogVehicles(post: BlogPost, cars: Vehicle[]) {
  return cars.filter(v => v.active && post.vehicles.some(ref => v.city === ref.city && normalized(v.name).startsWith(ref.match))).sort((a, b) => a.slug.localeCompare(b.slug));
}
export function blogCover(post: BlogPost, cars: Vehicle[]) {
  // A post about a car outside the fleet carries its own sourced photo.
  if (post.coverImage) return post.coverImage;
  return cars.find(v => v.active && v.city === post.cover.city && normalized(v.name) === post.cover.match && v.photos.length)?.photos[0] ?? null;
}
export function blogLinks(post: BlogPost, cars: Vehicle[], lang: Lang) {
  const units = blogVehicles(post, cars), ui = blogUi[lang];
  const groups = discoveryGroups(cars);
  return [
    ...units.map(v => ({ label: `${v.name} · ${v.city === "miami" ? "Miami" : "Orlando"}`, lang, path: `cars/${v.city}/${v.slug}` })),
    ...post.cities.flatMap(city => {
      const brand = groups.find(g => g.kind === "brand" && g.city === city && g.label.toLowerCase() === post.brand.toLowerCase());
      const cats = [...new Set(units.filter(v => v.city === city).map(v => v.body_category))];
      return [
        ...(brand ? [{ label: `${post.brand} · ${city === "miami" ? "Miami" : "Orlando"}${lang !== "pt" ? ` (${ui.portuguese})` : ""}`, lang: "pt" as const, path: brand.path }] : []),
        ...cats.map(cat => ({ label: `${t(lang).categories[cat as "exotics"] ?? cat} · ${city === "miami" ? "Miami" : "Orlando"}`, lang, path: `${city}/${cat}` })),
        { label: city === "miami" ? "Miami" : "Orlando", lang, path: city },
      ];
    }),
  ];
}
export const blogDate = (date: string, lang: Lang) => new Intl.DateTimeFormat(lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
export const blogText = (post: BlogPost, lang: Lang) => {
  const c = post.translations[lang];
  return [c.title, c.intro, ...c.sections.flatMap(s => [s.title, ...s.paragraphs]), c.cta].join("\n\n");
};
export function blogHead(lang: Lang, post?: BlogPost, cars: Vehicle[] = []) {
  const ui = blogUi[lang], copy = post?.translations[lang], path = blogPathKey(post?.slug), photo = post ? blogCover(post, cars) : null;
  const head = seoHead({ lang, path, title: copy ? `${copy.title} | Onic Car Rentals` : ui.metaTitle, description: (post?.description?.[lang]) ?? copy?.excerpt ?? ui.intro, type: post ? "article" : "website", homeLabel: t(lang).seo.home, crumbs: [[ui.title, "/blog"], ...(post && copy ? [[copy.title, `/${path}`] as [string, string]] : [])], jsonLd: post && copy ? [{
    "@context": "https://schema.org", "@type": "Article", headline: copy.title, description: post.description?.[lang] ?? copy.excerpt,
    datePublished: post.date, inLanguage: lang === "pt" ? "pt-BR" : lang,
    mainEntityOfPage: abs(publicPath(lang, path)), articleSection: ui.categories[post.category], articleBody: blogText(post, lang),
    author: { "@type": "Organization", name: "Onic Car Rentals", "@id": `${SITE}/#organization` }, publisher: { "@id": `${SITE}/#organization` },
    ...(photo ? { image: abs(sizedPhoto(photo, 1200)) } : {}), citation: post.sources.map(s => s.url ?? s.name),
  }] : [] });
  // Blog shares use the same real fleet cover shown in the article, at share size.
  if (photo) {
    const image = abs(`${sizedPhoto(photo, 1200)}${photo.startsWith("/__l5e/") ? "&h=630&fit=cover" : ""}`);
    head.meta = head.meta.map(m => "property" in m && m.property === "og:image" || "name" in m && m.name === "twitter:image" ? { ...m, content: image } : m);
  }
  return head;
}
export const findBlogPost = (slug: string) => blogPosts.find(p => p.slug === slug);
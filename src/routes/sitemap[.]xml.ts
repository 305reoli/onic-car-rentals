import { createFileRoute } from "@tanstack/react-router";
import { inCategory, PUBLIC_CATEGORIES } from "@/lib/vehicles";
import { SITE } from "@/lib/seo";
import { publicPath } from "@/lib/publicRoutes";
import { discoveryGroups } from "@/lib/discovery";
import { guideSlugs, guidePath } from "@/lib/guides";
import { blogPosts, blogPathKey } from "@/data/blog";
import { brandHubKey } from "@/lib/aeo";

const LANGS = ["en", "pt", "es"] as const;

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { publicClient } = await import("@/services/public-client.server");
        const { readActivePublicCars } = await import("@/services/public-catalog.server");
        const db = publicClient();
        const [catalog, { data: cities, error: e2 }] = await Promise.all([
          readActivePublicCars().then((cars) => ({ cars, error: false })).catch(() => ({ cars: [], error: true })),
          db.from("cities").select("slug, fleet_from_city").eq("active", true).order("sort_order"),
        ]);
        if (catalog.error || e2) return new Response("Sitemap temporarily unavailable", { status: 503 });
        const cars = catalog.cars;
        // lastmod only where we have a real per-page change time (car rows); omitted elsewhere.
        const entries: { path: string; lastmod?: string }[] = [
          { path: "/blog" }, ...blogPosts.map(p => ({ path: `/${blogPathKey(p.slug)}`, lastmod: p.date })),
          ...["", "/fleet", "/how-it-works", "/faq", "/catalog", "/search", "/terms", "/privacy", "/cancellation", "/legal", "/about", "/reviews"].map((path) => ({ path })),
          ...(cities ?? []).filter(c => !c.fleet_from_city || c.fleet_from_city === c.slug).flatMap(c => [...new Set(cars.filter(v => v.city === c.slug).map(v => v.brand))].filter(Boolean).map(brand => ({ path: brandHubKey(c.slug, brand) }))),
          ...(cities ?? []).flatMap((c) => {
            const fleet = (cars ?? []).filter((v) => v.city === (c.fleet_from_city || c.slug));
            const cats = PUBLIC_CATEGORIES.filter((cat) => fleet.some((v) => inCategory(v, cat)));
            return [`/${c.slug}`, `/catalog/${c.slug}`, ...cats.flatMap((cat) => [`/${c.slug}/${cat}`, `/catalog/${c.slug}/${cat}`])].map((path) => ({ path }));
          }),
          ...(cars ?? []).map((c) => ({ path: `/cars/${c.city}/${c.slug}`, lastmod: c.updated_at.slice(0, 10) })),
        ];
        const alt = (path: string) =>
          LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${SITE}${publicPath(l, path)}"/>`).join("") +
          `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${publicPath("pt", path)}"/>`;
        const urls = LANGS.flatMap((l) => entries.map((e) => `<url><loc>${SITE}${publicPath(l, e.path)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}${alt(e.path)}</url>`));
        for (const group of discoveryGroups(cars ?? []).filter((g) => g.kind !== "category")) {
          const url = `${SITE}${publicPath("pt", group.path)}`;
          urls.push(`<url><loc>${url}</loc><xhtml:link rel="alternate" hreflang="pt" href="${url}"/><xhtml:link rel="alternate" hreflang="x-default" href="${url}"/></url>`);
        }
        for (const path of [guidePath(), ...guideSlugs.map((slug) => guidePath(slug))]) {
          const url = `${SITE}${path}`;
          urls.push(`<url><loc>${url}</loc><xhtml:link rel="alternate" hreflang="pt" href="${url}"/><xhtml:link rel="alternate" hreflang="x-default" href="${url}"/></url>`);
        }
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join("")}</urlset>`,
          { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } },
        );
      },
    },
  },
});

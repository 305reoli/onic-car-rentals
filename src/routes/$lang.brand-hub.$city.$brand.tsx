import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { citiesQuery, vehiclesQuery } from "@/lib/queries";
import { brandHubs, brandHubKey, editorialMeta } from "@/lib/aeo";
import { aeoUi, fmt, t, type Lang } from "@/lib/i18n";
import { seoHead, itemListJsonLd } from "@/lib/seo";
import { photoUrl } from "@/lib/vehicles";
import { Container, PageError } from "@/components/site/Sections";
import { NotFoundPage } from "@/components/site/NotFoundPage";
import { CarCard } from "@/components/site/CarCard";
import { useLang } from "@/hooks/use-lang";

export const Route = createFileRoute("/$lang/brand-hub/$city/$brand")({
  loader: async ({ context, params }) => {
    const [cars, cities] = await Promise.all([context.queryClient.ensureQueryData(vehiclesQuery()), context.queryClient.ensureQueryData(citiesQuery())]);
    const hub = brandHubs(cars, cities).find(h => h.city.slug === params.city && h.key === params.brand);
    if (!hub) throw notFound();
    return hub;
  },
  head: ({ params, loaderData: h }) => {
    const lang = params.lang as Lang, ui = aeoUi[lang], path = brandHubKey(params.city, params.brand);
    if (!h) return seoHead({ lang, path, title: "Unavailable | Onic Car Rentals", description: "", noindex: true });
    const title = fmt(ui.brandH1, { brand: h.brand, city: h.city.name });
    return seoHead({ lang, path, title: `${title} | Onic Car Rentals`, description: editorialMeta(fmt(ui.listingMeta, { category: h.brand, city: h.city.name }), lang), homeLabel: t(lang).seo.home, crumbs: [[h.city.name, `/${h.city.slug}`], [h.brand, `/${path}`]], jsonLd: [itemListJsonLd(title, h.cars.map(v => ({ name: v.name, path: `/${lang}/cars/${v.city}/${v.slug}`, image: photoUrl(v.photos[0]) })))] });
  },
  component: BrandHub,
  errorComponent: PageError,
  notFoundComponent: NotFoundPage,
});
function BrandHub() {
  const h = Route.useLoaderData(), { lang, tr } = useLang(), ui = aeoUi[lang];
  return <Container className="pb-24 pt-10 md:pt-14">
    <nav className="mb-6 text-sm text-muted-foreground"><Link to="/$lang" params={{ lang }}>{tr.seo.home}</Link> / <Link to="/$lang/$city" params={{ lang, city: h.city.slug }}>{h.city.name}</Link> / {h.brand}</nav>
    <h1 className="font-display max-w-5xl text-4xl md:text-6xl">{fmt(ui.brandH1, { brand: h.brand, city: h.city.name })}</h1>
    <p className="mb-10 mt-5 max-w-4xl leading-relaxed text-muted-foreground">{fmt(ui.brandIntro, { brand: h.brand, city: h.city.name, models: [...new Set(h.cars.map(v => v.name))].join(", ") })}</p>
    <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{h.cars.map(v => <CarCard key={v.id} v={v} serviceCity={h.city.slug} />)}</section>
  </Container>;
}
import { seoHead, itemListJsonLd } from "@/lib/seo";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { citiesQuery, unavailableQuery, vehiclesQuery } from "@/lib/queries";
import { fmt, t, type Lang } from "@/lib/i18n";
import { dedupeCrossFleet, byPriceDesc, inCategory, isPublicCategory, photoUrl } from "@/lib/vehicles";
import { useCities } from "@/hooks/use-cities";
import { PageError } from "@/components/site/Sections";
import { CategoryCars } from "@/components/site/Drill";
import { bookingSearch } from "@/lib/search";
import { discoveryPageQuery, discoveryHead } from "@/lib/discoveryPage";
import { DiscoveryPage } from "@/components/site/DiscoveryPage";
import { useSuspenseQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/$lang/$city_/$category")({
  validateSearch: bookingSearch,
  loaderDeps: ({ search }) => ({ pickup: search.pickup, ret: search.ret }),
  loader: async ({ context, params, deps }) => {
    if (!isPublicCategory(params.category)) throw notFound();
    const cities = await context.queryClient.ensureQueryData(citiesQuery());
    const city = cities.find((c) => c.slug === params.city);
    if (!city) throw notFound();
    const [cars, unavailable] = await Promise.all([
      context.queryClient.ensureQueryData(vehiclesQuery(city.slug)),
      deps.pickup && deps.ret ? context.queryClient.ensureQueryData(unavailableQuery(city.slug, deps.pickup, deps.ret)) : null,
    ]);
    const landing = params.lang === "pt" && ["orlando", "miami"].includes(params.city) ? await context.queryClient.ensureQueryData(discoveryPageQuery(city.slug, params.category, true)) : null;
    if (params.lang === "pt" && ["orlando", "miami"].includes(params.city) && !landing) throw notFound();
    return { landing, name: city.name, cars: dedupeCrossFleet(unavailable ? cars.filter((v) => !unavailable.includes(v.id)) : cars, unavailable ?? [], city.fleet_from_city || city.slug).filter((v) => inCategory(v, params.category)).sort(byPriceDesc).map((v) => ({ name: v.name, city: v.city, slug: v.slug, image: v.photos[0] ? photoUrl(v.photos[0]) : null })) };
  },
  head: ({ params, loaderData }) => {
    const lang = params.lang as Lang;
    if (lang === "pt" && ["orlando", "miami"].includes(params.city)) return discoveryHead(loaderData?.landing, `${params.city}/${params.category}`);
    const tr = t(lang);
    const cat = isPublicCategory(params.category) ? params.category : "luxury";
    const name = loaderData?.name ?? params.city;
    const h1 = `${tr.seo.catTitle[cat]} ${tr.seo.in} ${name}`;
    return seoHead({
      lang, path: `/${params.city}/${params.category}`, homeLabel: tr.seo.home, noindex: !loaderData, image: loaderData?.cars[0]?.image,
      title: loaderData ? `${h1} | Sua Locadora` : "Unavailable — Sua Locadora",
      description: fmt(tr.seo.catDesc, { cat: tr.seo.catTitle[cat], city: name, n: loaderData?.cars.length ?? 0 }),
      crumbs: [[name, `/${params.city}`], [tr.categories[cat], `/${params.city}/${params.category}`]],
      jsonLd: loaderData ? [itemListJsonLd(h1, loaderData.cars.map((v) => ({ name: v.name, path: `/${lang}/cars/${v.city}/${v.slug}`, image: v.image ?? undefined })))] : [],
    });
  },
  component: CategoryRoute,
  errorComponent: PageError,
  notFoundComponent: () => <PageError error={new Error("Not found")} />,
});

function CategoryRoute() {
  const { city, category, lang } = Route.useParams();
  const search = Route.useSearch();
  const c = useCities().find((x) => x.slug === city);
  if (lang === "pt" && ["orlando", "miami"].includes(city)) return <PortugueseCategory city={city} category={category} />;
  if (!c) return null;
  return <CategoryCars city={c} category={category} mode="city" search={search} />;
}
function PortugueseCategory({ city, category }: { city: string; category: string }) {
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(discoveryPageQuery(city, category, true));
  return data ? <DiscoveryPage data={data} search={search} /> : null;
}

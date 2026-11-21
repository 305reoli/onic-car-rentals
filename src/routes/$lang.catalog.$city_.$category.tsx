import { NotFoundPage } from "@/components/site/NotFoundPage";
import { seoHead, itemListJsonLd } from "@/lib/seo";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { citiesQuery, unavailableQuery, vehiclesQuery } from "@/lib/queries";
import { fmt, t, type Lang } from "@/lib/i18n";
import { dedupeCrossFleet, byPriceDesc, inCategory, isPublicCategory, photoUrl } from "@/lib/vehicles";
import { useCities } from "@/hooks/use-cities";
import { PageError } from "@/components/site/Sections";
import { CategoryCars } from "@/components/site/Drill";
import { bookingSearch } from "@/lib/search";
import { similarModels } from "@/lib/similarModels";

export const Route = createFileRoute("/$lang/catalog/$city_/$category")({
  validateSearch: bookingSearch,
  loaderDeps: ({ search }) => ({ pickup: search.pickup, ret: search.ret, similarTo: search.similarTo }),
  loader: async ({ context, params, deps }) => {
    if (!isPublicCategory(params.category)) throw notFound();
    const cities = await context.queryClient.ensureQueryData(citiesQuery());
    const city = cities.find((c) => c.slug === params.city);
    if (!city) throw notFound();
    const [cars, unavailable] = await Promise.all([
      context.queryClient.ensureQueryData(vehiclesQuery(city.slug)),
      deps.pickup && deps.ret ? context.queryClient.ensureQueryData(unavailableQuery(city.slug, deps.pickup, deps.ret)) : null,
    ]);
    const original = deps.similarTo ? cars.find(v => v.id === deps.similarTo) : undefined;
    const selected = deps.similarTo ? (original && unavailable ? similarModels(cars, original, unavailable) : []) : dedupeCrossFleet(unavailable ? cars.filter((v) => !unavailable.includes(v.id)) : cars, unavailable ?? [], city.fleet_from_city || city.slug);
    return { name: city.name, cars: selected.filter((v) => inCategory(v, params.category)).sort(byPriceDesc).map((v) => ({ name: v.name, city: v.city, slug: v.slug, image: v.photos[0] ? photoUrl(v.photos[0]) : null })) };
  },
  head: ({ params, loaderData }) => {
    const lang = params.lang as Lang;
    const tr = t(lang);
    const cat = isPublicCategory(params.category) ? params.category : "luxury";
    const name = loaderData?.name ?? params.city;
    const h1 = `${tr.seo.catTitle[cat]} ${tr.seo.in} ${name}`;
    return seoHead({
      lang, path: `/catalog/${params.city}/${params.category}`, homeLabel: tr.seo.home, noindex: !loaderData, image: loaderData?.cars[0]?.image,
      title: loaderData ? `${h1} · ${tr.seo.catalog} | Onic Car Rentals` : "Unavailable — Onic Car Rentals",
      description: fmt(tr.seo.catDesc, { cat: tr.seo.catTitle[cat], city: name, n: loaderData?.cars.length ?? 0 }),
      crumbs: [[tr.seo.catalog, "/catalog"], [name, `/catalog/${params.city}`], [tr.categories[cat], `/catalog/${params.city}/${params.category}`]],
      jsonLd: loaderData ? [itemListJsonLd(h1, loaderData.cars.map((v) => ({ name: v.name, path: `/${lang}/cars/${v.city}/${v.slug}`, image: v.image ?? undefined })))] : [],
    });
  },
  component: CategoryRoute,
  errorComponent: PageError,
  notFoundComponent: NotFoundPage,
});

function CategoryRoute() {
  const { city, category } = Route.useParams();
  const c = useCities().find((x) => x.slug === city)!;
  return <CategoryCars city={c} category={category} mode="catalog" search={Route.useSearch()} />;
}

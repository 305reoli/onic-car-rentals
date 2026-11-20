import { seoHead, itemListJsonLd } from "@/lib/seo";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { citiesQuery, unavailableQuery, vehiclesQuery } from "@/lib/queries";
import { fmt, t, type Lang } from "@/lib/i18n";
import { cityDescription, inCategory, PUBLIC_CATEGORIES } from "@/lib/vehicles";
import { useCities } from "@/hooks/use-cities";
import { CityPage } from "@/components/site/CityPage";
import { PageError } from "@/components/site/Sections";
import { bookingSearch } from "@/lib/search";
import { discoveryPageQuery, discoveryHead } from "@/lib/discoveryPage";
import { DiscoveryPage } from "@/components/site/DiscoveryPage";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FleetBase } from "@/components/site/FleetBase";
import { TypeResults } from "@/components/site/TypeResults";

export const Route = createFileRoute("/$lang/$city")({
  validateSearch: bookingSearch,
  loaderDeps: ({ search }) => ({ pickup: search.pickup, ret: search.ret }),
  loader: async ({ context, params, deps }) => {
    const cities = await context.queryClient.ensureQueryData(citiesQuery());
    const city = cities.find((c) => c.slug === params.city);
    if (!city) throw notFound();
    const [cars] = await Promise.all([
      context.queryClient.ensureQueryData(vehiclesQuery(city.slug)),
      deps.pickup && deps.ret ? context.queryClient.ensureQueryData(unavailableQuery(city.slug, deps.pickup, deps.ret)) : null,
    ]);
    await context.queryClient.ensureQueryData(vehiclesQuery());
    const landing = params.lang === "pt" ? await context.queryClient.ensureQueryData(discoveryPageQuery(city.slug)) : null;
    if (params.lang === "pt" && !landing) throw notFound();
    return { landing, name: city.name, desc: cityDescription(city, params.lang as Lang), image: city.hero_photo || null, cats: PUBLIC_CATEGORIES.filter((c) => cars.some((v) => inCategory(v, c))) };
  },
  head: ({ params, loaderData }) => {
    const lang = params.lang as Lang;
    if (lang === "pt") return discoveryHead(loaderData?.landing, params.city);
    const tr = t(lang);
    const name = loaderData?.name ?? params.city;
    return seoHead({
      lang, path: `/${params.city}`, homeLabel: tr.seo.home, noindex: !loaderData, image: loaderData?.image,
      title: loaderData ? `${fmt(tr.seo.cityTitle, { city: name })} | Onic Car Rentals` : "Unavailable — Onic Car Rentals",
      description: fmt(tr.seo.cityDesc, { city: name }),
      crumbs: [[name, `/${params.city}`]],
      jsonLd: loaderData ? [itemListJsonLd(fmt(tr.seo.cityTitle, { city: name }), loaderData.cats.map((c) => ({ name: `${tr.seo.catTitle[c]} ${tr.seo.in} ${name}`, path: `/${lang}/${params.city}/${c}` })))] : [],
    });
  },
  component: CityRoute,
  errorComponent: PageError,
  notFoundComponent: () => <PageError error={new Error("Not found")} />,
});

function CityRoute() {
  const { city, lang } = Route.useParams();
  const search = Route.useSearch();
  const cities = useCities();
  const c = cities.find((x) => x.slug === city);
  if (search.type !== undefined && c) return <TypeResults city={city} name={c.name} search={search} />;
  if (lang === "pt") return <><PortugueseCity city={city} /><div className="mx-auto max-w-7xl px-5 py-5"><FleetBase city={city} lang="pt" /></div></>;
  if (!c) return null;
  return <><CityPage city={c} search={search} /><div className="mx-auto max-w-7xl px-5 py-5"><FleetBase city={city} lang={lang as Lang} /></div></>;
}
function PortugueseCity({ city }: { city: string }) {
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(discoveryPageQuery(city));
  return data ? <DiscoveryPage data={data} search={search} /> : null;
}


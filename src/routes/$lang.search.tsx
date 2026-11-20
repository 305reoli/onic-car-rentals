import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { citiesQuery, settingsQuery, unavailableQuery, vehiclesQuery } from "@/lib/queries";
import { meetsResultMinimum } from "@/lib/resultPricing";
import { ResultsControls, useResultFilters } from "@/components/site/ResultsControls";
import { fmt, t, type Lang } from "@/lib/i18n";
import { searchCars, suggestCategory } from "@/lib/carsearch";
import { byPriceDesc, fleetCityOf, PRIMARY_CATEGORIES, type Vehicle } from "@/lib/vehicles";
import { seoHead } from "@/lib/seo";
import { useLang } from "@/hooks/use-lang";
import { CarCard } from "@/components/site/CarCard";
import { Container, PageError } from "@/components/site/Sections";
import { ResultsPriceNote } from "@/components/site/Conversion";

type S = { q?: string | undefined; city?: string | undefined; pickup?: string | undefined; ret?: string | undefined; loc?: string | undefined };
const str = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 80) : undefined);

export const Route = createFileRoute("/$lang/search")({
  validateSearch: (s: Record<string, unknown>): S => ({ q: str(s["q"]), city: str(s["city"]), pickup: str(s["pickup"]), ret: str(s["ret"]), loc: str(s["loc"]) }),
  loaderDeps: ({ search }) => ({ city: search.city, pickup: search.pickup, ret: search.ret }),
  loader: async ({ context, deps }) => {
    const [, cities] = await Promise.all([context.queryClient.ensureQueryData(vehiclesQuery()), context.queryClient.ensureQueryData(citiesQuery())]);
    if (deps.pickup && deps.ret) {
      const shown = deps.city ? cities.filter((c) => c.slug === deps.city) : cities;
      await Promise.all(shown.map((c) => context.queryClient.ensureQueryData(unavailableQuery(c.slug, deps.pickup!, deps.ret!))));
    }
  },
  head: ({ params, match }) => {
    const lang = params.lang as Lang;
    const tr = t(lang);
    const q = (match.search as S).q;
    const title = q ? fmt(tr.sbar.results, { q }) : tr.seo.searchTitle;
    // Result pages vary by query: keep them out of the index, but crawlable.
    return seoHead({ lang, path: "/search", homeLabel: tr.seo.home, title: `${title} | Sua Locadora`, description: tr.meta.home[1] ?? "", noindex: true, crumbs: [[tr.seo.searchTitle, "/search"]] });
  },
  component: SearchPage,
  errorComponent: PageError,
});

function SearchPage() {
  const { lang, tr } = useLang();
  const search = Route.useSearch();
  const { data: all } = useSuspenseQuery(vehiclesQuery());
  const { data: cities } = useSuspenseQuery(citiesQuery());
  const { data: settings } = useSuspenseQuery(settingsQuery());
  const hasDates = !!(search.pickup && search.ret);
  const shown = search.city ? cities.filter((c) => c.slug === search.city) : cities;
  const matches = (search.q ? searchCars(all, search.q) : all).filter(v => meetsResultMinimum(v, { pickup: search.pickup, ret: search.ret, settings }));
  const dateSearch = { pickup: search.pickup, ret: search.ret, loc: search.loc };

  const groups = shown.map((c) => ({ city: c, cars: matches.filter((v) => v.city === fleetCityOf(c)) }));
  // One card per city listing: the counter equals the cards shown.
  const total = groups.reduce((n, g) => n + g.cars.length, 0);
  const sugg = suggestCategory(search.q ?? "");
  const suggCity = shown[0]?.slug ?? cities[0]?.slug ?? "orlando";

  return (
    <Container className="py-10">
      <h1 className="font-display text-3xl md:text-5xl">{search.q ? fmt(tr.sbar.results, { q: search.q }) : tr.sbar.resultsAll}</h1>
      {total > 0 && !hasDates && <p className="mt-3 text-muted-foreground">{fmt(tr.sbar.found, { n: total })}</p>}
      {total > 0 && <ResultsPriceNote compact className="mt-4" />}
      {total === 0 && (
        <div className="surface mt-8 p-6">
          <p className="mb-3">{fmt(tr.sbar.noResults, { q: search.q ?? "" })}</p>
          <Link to="/$lang/$city/$category" params={{ lang, city: suggCity, category: sugg }} search={dateSearch} className="font-semibold text-primary">
            {fmt(tr.sbar.tryCat, { cat: tr.categories[sugg as keyof typeof tr.categories], city: cities.find((c) => c.slug === suggCity)?.name ?? suggCity })} →
          </Link>
        </div>
      )}
      {groups.map(({ city, cars }) => cars.length > 0 && (
        <CityGroup key={city.slug} citySlug={city.slug} cityName={city.name} cars={cars} hasDates={hasDates} search={dateSearch} />
      ))}
    </Container>
  );
}

function CityGroup({ citySlug, cityName, cars, hasDates, search }: { citySlug: string; cityName: string; cars: Vehicle[]; hasDates: boolean; search: { pickup?: string | undefined; ret?: string | undefined; loc?: string | undefined } }) {
  const { lang, tr } = useLang();
  const { data: unavailable = [] } = useQuery({ ...unavailableQuery(citySlug, search.pickup ?? "", search.ret ?? ""), enabled: hasDates });
  const { data: settings } = useSuspenseQuery(settingsQuery());
  const rf = useResultFilters("desc", { ...search, settings, serviceCity: citySlug });
  const list = rf.apply(hasDates ? cars.filter((v) => !unavailable.includes(v.id)) : cars);
  return (
    <section className="mt-12" aria-labelledby={`g-${citySlug}`}>
      <h2 id={`g-${citySlug}`} className="font-display text-2xl md:text-4xl">
        <Link to="/$lang/$city" params={{ lang, city: citySlug }} search={search} className="hover:text-primary">{cityName}</Link>
      </h2>
      {hasDates && <p className="mt-2 text-sm text-primary">{fmt(tr.drill.available, { n: list.length })}</p>}
      <div className="mt-6"><ResultsControls {...rf} /></div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((v) => <CarCard key={v.id} v={v} search={search} serviceCity={citySlug} />)}
      </div>
    </section>
  );
}

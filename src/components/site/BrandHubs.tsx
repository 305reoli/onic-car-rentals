import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { citiesQuery, vehiclesQuery } from "@/lib/queries";
import { brandHubs } from "@/lib/aeo";
import { aeoUi, fmt } from "@/lib/i18n";
import { useLang } from "@/hooks/use-lang";

export function BrandHubLinks({ city }: { city: string }) {
  const { lang } = useLang();
  const { data: cars } = useSuspenseQuery(vehiclesQuery());
  const { data: cities } = useSuspenseQuery(citiesQuery());
  const hubs = brandHubs(cars, cities).filter(h => h.city.slug === city);
  if (!hubs.length) return null;
  return <section className="my-10 border-y border-border py-6">
    <h2 className="font-display mb-4 text-2xl">{fmt(aeoUi[lang].brands, { city: hubs[0]?.city.name ?? city })}</h2>
    <nav className="flex flex-wrap gap-x-6 gap-y-3">{hubs.map(h => <Link key={h.path} to="/$lang/brand-hub/$city/$brand" params={{ lang, city, brand: h.key }} className="text-sm text-primary hover:underline">{h.brand}</Link>)}</nav>
  </section>;
}
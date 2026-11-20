import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { vehiclesQuery, unavailableQuery, settingsQuery } from "@/lib/queries";
import { matchesVehicleType, vehicleType, VEHICLE_TYPES } from "@/lib/vehicleTypes";
import { vehicleTypeText, type Lang } from "@/lib/i18n";
import type { BookingSearch } from "@/lib/search";
import { useLang } from "@/hooks/use-lang";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CarCard } from "./CarCard";
import { Container } from "./Sections";
import { DatesBar } from "./Drill";
import { ResultsControls, useResultFilters } from "./ResultsControls";
import { useWaContext } from "@/lib/waContext";
import { waMessage } from "@/lib/i18n";
import { ResultsPriceNote } from "./Conversion";

export function TypeResults({ city, name, search }: { city: string; name: string; search: BookingSearch }) {
  const { lang, tr } = useLang();
  const { data: all } = useSuspenseQuery(vehiclesQuery());
  const { data: settings } = useSuspenseQuery(settingsQuery());
  const dated = !!(search.pickup && search.ret);
  const { data: unavailable } = useQuery({ ...unavailableQuery(city, search.pickup ?? "", search.ret ?? ""), enabled: dated });
  const selected = vehicleType(search.type);
  const rf = useResultFilters("asc", { pickup: search.pickup, ret: search.ret, settings, serviceCity: city });
  useWaContext(waMessage(lang, { kind: "results", city: name, pickup: search.pickup, ret: search.ret }));
  const cars = rf.apply(all.filter(v => v.city === city && matchesVehicleType(v, selected) && (!dated || !unavailable?.includes(v.id))));
  return <Container className="pb-24 pt-8">
    <h1 className="font-display mb-4 text-3xl">{name} · {vehicleTypeText[lang][selected]}</h1>
    <div className="mb-4 flex flex-wrap gap-2">
      {VEHICLE_TYPES.map(type => <Button asChild key={type} variant={type === selected ? "default" : "outline"} className="h-11 min-h-11 px-3 text-xs"><Link to="/$lang/$city" params={{ lang: lang as Lang, city }} search={{ ...search, type }}>{vehicleTypeText[lang][type]}</Link></Button>)}
    </div>
    <DatesBar count={cars.length} hasDates={dated && !!unavailable} search={search} />
    {cars.length > 0 && <ResultsPriceNote compact className="mb-4" />}
    <ResultsControls {...rf} />
    {cars.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="type-results">{cars.map(v => <div key={v.id} data-vehicle-id={v.id}><CarCard v={v} search={search} /></div>)}</div> : <p>{tr.fleet.empty}</p>}
  </Container>;
}
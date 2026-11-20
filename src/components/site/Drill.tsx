import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Users, Briefcase, Gauge } from "lucide-react";
import { useLang } from "@/hooks/use-lang";
import { settingsQuery, unavailableQuery, vehiclesQuery } from "@/lib/queries";
import { meetsResultMinimum } from "@/lib/resultPricing";
import { fmt, waLink, waMessage } from "@/lib/i18n";
import { useWaContext } from "@/lib/waContext";
import { ResultsControls, useResultFilters } from "./ResultsControls";
import { dedupeCrossFleet, categoryCover, cityName, inCategory, photoSrcSet, sizedPhoto, CARD_SIZES, PUBLIC_CATEGORIES, type CityRow, type Vehicle } from "@/lib/vehicles";
import { CarCard, PriceTag } from "./CarCard";
import { Container } from "./Sections";
import { DateTimeField } from "./DateTimeField";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCities } from "@/hooks/use-cities";
import { similarModels } from "@/lib/similarModels";
import { ResultsPriceNote } from "./Conversion";

export type DrillSearch = Record<string, string | undefined>;
type Mode = "city" | "catalog";

/** A city's fleet, narrowed to cars available for the searched dates when both dates are set. */
export function useFleet(city: string, search: DrillSearch) {
  const { data: fleet } = useSuspenseQuery(vehiclesQuery(city));
  const { data: settings } = useSuspenseQuery(settingsQuery());
  const hasDates = !!(search["pickup"] && search["ret"]);
  const { data: unavailable } = useQuery({ ...unavailableQuery(city, search["pickup"] ?? "", search["ret"] ?? ""), enabled: hasDates });
  const avail = hasDates && unavailable ? fleet.filter((v) => !unavailable.includes(v.id)) : fleet;
  const cityRow = useCities().find((c) => c.slug === city);
  const original = search["similarTo"] ? fleet.find(v => v.id === search["similarTo"]) : undefined;
  const cars = search["similarTo"] ? (original && hasDates ? similarModels(fleet, original, unavailable) : []) : dedupeCrossFleet(avail, hasDates && unavailable ? unavailable : [], cityRow ? cityRow.fleet_from_city || cityRow.slug : undefined);
  return { cars: cars.filter(v => meetsResultMinimum(v, { pickup: search["pickup"], ret: search["ret"], settings })), hasDates: hasDates && !!unavailable };
}

const dateSearch = (s: DrillSearch) => ({ ...s });

/** "X cars available for your dates" + inline change/choose dates control (dates live in the URL). */
export function DatesBar({ count, hasDates, search }: { count: number; hasDates: boolean; search: DrillSearch }) {
  const { lang, tr } = useLang();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [p, setP] = useState(search["pickup"] ?? "");
  const [r, setR] = useState(search["ret"] ?? "");
  const go = (pickup?: string, ret?: string) => {
    setOpen(false);
    navigate({ to: ".", search: (prev: DrillSearch) => ({ ...prev, pickup: pickup || undefined, ret: ret || undefined }) } as never);
  };
  return (
    <div className="mb-8 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {hasDates && <p className="text-sm font-semibold text-primary" data-testid="available-count">{fmt(tr.fleet.available, { n: count })}</p>}
        <Button variant="outline" className="h-11 min-h-11" onClick={() => setOpen((o) => !o)}><CalendarDays />{hasDates ? tr.drill.change : tr.drill.choose}</Button>
        {hasDates && <Button variant="ghost" className="h-11 min-h-11 text-sm text-muted-foreground" onClick={() => go()}>{tr.drill.clear}</Button>}
      </div>
      {open && (
        <form className="surface grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); if (p && r) go(p, r); }}>
          <div className="text-xs text-muted-foreground">{tr.search.pickup}<DateTimeField lang={lang} label={tr.search.pickup} value={p} onChange={setP} /></div>
          <div className="text-xs text-muted-foreground">{tr.search.ret}<DateTimeField lang={lang} label={tr.search.ret} value={r} min={p || undefined} onChange={setR} /></div>
          <Button type="submit" className="self-end">{tr.drill.apply}</Button>
        </form>
      )}
    </div>
  );
}

/** Six category tiles in fixed order (empty ones hidden), each with one cover photo and a car count. */
export function CategoryTiles({ city, mode, search }: { city: CityRow; mode: Mode; search: DrillSearch }) {
  const { lang, tr } = useLang();
  useWaContext(waMessage(lang, { kind: "results", city: city.name, pickup: search["pickup"], ret: search["ret"] }));
  const { cars, hasDates } = useFleet(city.slug, search);
  const tiles = PUBLIC_CATEGORIES.map((c) => ({ c, n: cars.filter((v) => inCategory(v, c)).length, cover: categoryCover(city, cars, c) })).filter((t) => t.n > 0);
  const to = mode === "city" ? "/$lang/$city/$category" : "/$lang/catalog/$city/$category";
  return (
    <>
      <DatesBar count={cars.length} hasDates={hasDates} search={search} />
      <h2 className="font-display mb-6 text-2xl md:text-3xl">{tr.drill.chooseCategory}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="category-tiles">
        {tiles.map(({ c, n, cover }) => (
          <Link key={c} to={to} params={{ lang, city: city.slug, category: c }} search={dateSearch(search)} data-testid={`tile-${c}`}
            data-reveal className="surface lift group relative block aspect-[3/2] overflow-hidden">
            <img src={sizedPhoto(cover, 800)} srcSet={photoSrcSet(cover, [480, 800, 1200])} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" decoding="async" alt={`${tr.seo.catTitle[c]} ${tr.seo.in} ${city.name}`} loading="lazy" width={1200} height={800} className="kenburns absolute inset-0 size-full object-cover" />
            <div className="hero-overlay absolute inset-0" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
              <h3 className="font-display text-3xl">{tr.categories[c]}</h3>
              <span className="tile-count rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-semibold">
                {hasDates ? fmt(tr.drill.available, { n }) : n === 1 ? tr.drill.car1 : fmt(tr.drill.cars, { n })}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

/** One category's cars for a city: back link, category chips, dates bar, sort toggle, compact grid. */
export function CategoryCars({ city, category, mode, search }: { city: CityRow; category: string; mode: Mode; search: DrillSearch }) {
  const { lang, tr } = useLang();
  const { cars, hasDates } = useFleet(city.slug, search);
  const { data: settings } = useSuspenseQuery(settingsQuery());
  const rf = useResultFilters("desc", { pickup: search["pickup"], ret: search["ret"], settings, serviceCity: city.slug });
  useWaContext(waMessage(lang, { kind: "results", city: city.name, pickup: search["pickup"], ret: search["ret"] }));
  const list = rf.apply(cars.filter((v) => inCategory(v, category)));
  const cats = PUBLIC_CATEGORIES.map((c) => ({ c, n: cars.filter((v) => inCategory(v, c)).length })).filter((x) => x.n > 0);
  const base = mode === "city" ? "/$lang/$city" : "/$lang/catalog/$city";
  const to = mode === "city" ? "/$lang/$city/$category" : "/$lang/catalog/$city/$category";
  return (
    <Container className={cn("pb-24 pt-8", mode === "catalog" && "max-w-3xl")}>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
        <Link to={base} params={{ lang, city: city.slug }} search={dateSearch(search)} className="hover:text-primary">{city.name}</Link>
        <span className="mx-2">›</span><span className="text-foreground">{tr.categories[category as "suv"]}</span>
      </nav>
      <Link to={base} params={{ lang, city: city.slug }} search={dateSearch(search)} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary"><ArrowLeft className="size-4" />{tr.drill.back}</Link>
      <h1 className="font-display mb-5 text-4xl md:text-6xl">{tr.seo.catTitle[category as "suv"]} {tr.seo.in} {city.name}</h1>
      <div className="no-scrollbar -mx-5 mb-6 flex gap-2 overflow-x-auto px-5">
        {cats.map(({ c, n }) => (
          <Link key={c} to={to} params={{ lang, city: city.slug, category: c }} search={dateSearch(search)}
            className={cn("shrink-0 rounded-full border px-4 py-1.5 text-sm", c === category ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
            {tr.categories[c]} <span className="opacity-60">{n}</span>
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <DatesBar count={list.length} hasDates={hasDates} search={search} />
      </div>
      <ResultsControls {...rf} />
      {list.length > 0 && <ResultsPriceNote className="mb-5" />}
      {list.length === 0 ? <p className="text-muted-foreground">{tr.fleet.empty}</p> : mode === "city" ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="category-cars">
          {list.map((v) => <CarCard key={v.id} v={v} search={dateSearch(search)} serviceCity={city.slug} />)}
        </div>
      ) : (
        <div className="flex flex-col gap-10" data-testid="category-cars">{list.map((v) => <CatalogItem key={v.id} v={v} city={city.slug} search={search} />)}</div>
      )}
    </Container>
  );
}

function CatalogItem({ v, city, search }: { v: Vehicle; city: string; search: DrillSearch }) {
  const { lang, tr } = useLang();
  const cName = cityName(useCities(), city);
  return (
    <article data-reveal>
      <div className="surface ph lift group relative aspect-[3/2] overflow-hidden">
        <img src={sizedPhoto(v.photos[0], 640)} srcSet={photoSrcSet(v.photos[0], [400, 640, 960])} sizes={CARD_SIZES} decoding="async" alt={fmt(tr.seo.alt, { car: v.name, city: cName })} loading="lazy" width={1600} height={1068} className="fade size-full object-cover transition-[transform,opacity] duration-500 group-hover:scale-105" />
      </div>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-2xl md:text-3xl">{v.name}</h3>
          <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="size-4" />{v.seats}</span>
            <span className="flex items-center gap-1"><Briefcase className="size-4" />{v.bags}</span>
            {v.hp && <span className="flex items-center gap-1"><Gauge className="size-4" />{v.hp} {tr.fleet.hp}</span>}
          </div>
        </div>
        <PriceTag v={v} search={search} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button asChild><Link to="/$lang/cars/$city/$slug" params={{ lang, city: v.city, slug: v.slug }} search={{ ...dateSearch(search), city: city !== v.city ? city : undefined }}>{tr.catalog.bookOnline}</Link></Button>
        <Button asChild variant="whatsapp"><a href={waLink(waMessage(lang, { kind: "car", car: v.name, city: cName, pickup: search["pickup"], ret: search["ret"] }))} target="_blank" rel="noreferrer">{tr.catalog.whatsapp}</a></Button>
      </div>
    </article>
  );
}

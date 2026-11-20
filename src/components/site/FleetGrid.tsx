import { useMemo, useState, type ReactNode } from "react";
import { useLang } from "@/hooks/use-lang";
import { filterFleet, type Vehicle } from "@/lib/vehicles";
import { convText } from "@/lib/i18n";
import { CategorySections } from "./CategorySections";
import { CarCard } from "./CarCard";

export function FleetGrid({ vehicles, search, title, serviceCity, order, header, h1 = false }: { h1?: boolean; header?: ReactNode; order?: readonly string[] | undefined; serviceCity?: string | undefined; vehicles: Vehicle[]; search?: Record<string, string | undefined> | undefined; title?: string | undefined }) {
  const { tr, lang } = useLang();
  const cv = convText[lang];
  const [seats, setSeats] = useState("");
  const H = h1 ? "h1" : "h2";
  const [sort, setSort] = useState<"default" | "asc" | "desc">("default");
  const list = useMemo(() => filterFleet(vehicles, seats, sort), [vehicles, seats, sort]);

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><H className="font-display text-3xl md:text-5xl">{title ?? tr.fleet.title}</H>{header}</div>
        <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">{cv.seats}<select aria-label={cv.seats} value={seats} onChange={e => setSeats(e.target.value)} className="h-11 rounded-full border border-border bg-card px-4"><option value="">{cv.any}</option>{[...new Set(vehicles.map(v => v.seats).filter((n): n is number => n != null))].sort((a,b)=>a-b).map(n => <option key={n} value={n}>{n}+</option>)}</select></label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="h-10 cursor-pointer rounded-full border border-border bg-card px-4 text-sm"
          aria-label={cv.sort}
        >
          <option value="default">—</option>
          <option value="asc">{tr.fleet.sortAsc}</option>
          <option value="desc">{tr.fleet.sortDesc}</option>
        </select>
        </div>
      </div>
      {list.length === 0 ? <p className="text-muted-foreground">{tr.fleet.empty}</p> : (
        <CategorySections vehicles={list} order={order} render={(cars) => (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {cars.map((v) => <CarCard key={v.id} v={v} search={search} serviceCity={serviceCity} />)}
          </div>
        )} />
      )}
    </div>
  );
}

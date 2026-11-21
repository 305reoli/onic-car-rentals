import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/hooks/use-lang";
import { convText } from "@/lib/i18n";
import type { Vehicle } from "@/lib/vehicles";
import { meetsResultMinimum, sortResultPrices, type ResultPriceContext } from "@/lib/resultPricing";

export type ResultFilters = { sort: "asc" | "desc"; min: string; max: string; seats: number; bags: number };
const DEFAULT: ResultFilters = { sort: "desc", min: "", max: "", seats: 0, bags: 0 };

/** Price sorting uses dated card totals; daily price range/seats/bags filters are unchanged. */
export function useResultFilters(initialSort: "asc" | "desc" = "desc", context: ResultPriceContext = {}) {
  const [f, setF] = useState<ResultFilters>({ ...DEFAULT, sort: initialSort });
  const apply = (cars: Vehicle[]) => {
    const min = Number(f.min) || 0, max = Number(f.max) || Infinity;
    const out = cars.filter((v) => {
      if (!meetsResultMinimum(v, context)) return false;
      const p = v.daily_price_usd;
      if ((f.min || f.max) && (p == null || p < min || p > max)) return false;
      return v.seats >= f.seats && v.bags >= f.bags;
    });
    return sortResultPrices(out, f.sort, context);
  };
  return { f, setF, apply, reset: () => setF({ ...DEFAULT, sort: f.sort }) };
}

export function ResultsControls({ f, setF, reset }: ReturnType<typeof useResultFilters>) {
  const { lang } = useLang();
  const t = convText[lang];
  const [open, setOpen] = useState(false);
  const cls = "h-10 min-w-0 cursor-pointer rounded-full border border-border bg-card px-3 text-sm text-foreground [color-scheme:dark] focus:border-primary focus:outline-none";
  const active = f.min || f.max || f.seats || f.bags;
  const change = (next: ResultFilters) => {
    setF(next);
    window.__lovableEvents?.track?.("project.fleet_filter", {});
    (window.dataLayer ??= []).push({ event: "fleet_filter" });
  };
  return (
    <div className="mb-4 sm:mb-6">
      <Button type="button" variant="outline" className="mb-2 grid min-h-11 w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-2 text-left sm:hidden" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="results-filter-toggle">
        <SlidersHorizontal aria-hidden="true" /><span className="min-w-0 whitespace-normal">{t.filters} · {t.sort}{active ? " •" : ""}</span><ChevronDown aria-hidden="true" className={open ? "rotate-180" : ""} />
      </Button>
    <div className={`results-controls-grid ${open ? "grid" : "hidden"} grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap`} data-testid="results-controls" role="group" aria-label={t.filters}>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t.sort}
        <select className={cls} value={f.sort} onChange={(e) => change({ ...f, sort: e.target.value as "asc" | "desc" })} data-testid="sort"><option value="asc">{t.sortAsc}</option><option value="desc">{t.sortDesc}</option></select></label>
      <label className="flex w-24 flex-col gap-1 text-xs text-muted-foreground">{t.priceMin}
        <input inputMode="numeric" className={cls} placeholder="$" value={f.min} onChange={(e) => change({ ...f, min: e.target.value.replace(/\D/g, "") })} data-testid="price-min" /></label>
      <label className="flex w-24 flex-col gap-1 text-xs text-muted-foreground">{t.priceMax}
        <input inputMode="numeric" className={cls} placeholder="$" value={f.max} onChange={(e) => change({ ...f, max: e.target.value.replace(/\D/g, "") })} data-testid="price-max" /></label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t.seats}
        <select className={cls} value={f.seats} onChange={(e) => change({ ...f, seats: Number(e.target.value) })} data-testid="seats"><option value={0}>{t.any}</option>{[2, 4, 5, 7, 8].map((n) => <option key={n} value={n}>{n}+</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t.bags}
        <select className={cls} value={f.bags} onChange={(e) => change({ ...f, bags: Number(e.target.value) })} data-testid="bags"><option value={0}>{t.any}</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}+</option>)}</select></label>
      {active ? <Button type="button" variant="ghost" onClick={reset} className="h-11 px-2 text-sm">{t.clear}</Button> : null}
    </div>
    </div>
  );
}

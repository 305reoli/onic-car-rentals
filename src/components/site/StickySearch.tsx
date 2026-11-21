import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useLang } from "@/hooks/use-lang";
import { useBookingCities } from "@/hooks/use-cities";
import { vehiclesQuery } from "@/lib/queries";
import { searchCars } from "@/lib/carsearch";
import { photoUrl } from "@/lib/vehicles";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { publicPath } from "@/lib/publicRoutes";
import { DateTimeField } from "@/components/site/DateTimeField";
import { useHomeSearch } from "@/hooks/use-home-search";

const inputCls = "h-10 w-full rounded-full border border-border bg-background px-4 text-sm text-foreground [color-scheme:dark] focus:border-primary focus:outline-none";

/** Compact search (city · dates · model) pinned under the header across the public flow; values live in the URL. */
export function StickySearch() {
  const { lang, tr } = useLang();
  const cities = useBookingCities();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const params = useParams({ strict: false }) as { city?: string };
  const sp = useSearch({ strict: false }) as { city?: string; pickup?: string; ret?: string; q?: string };

  // On car pages the path city is the base city; ?city= is the service city.
  const urlCity = sp.city || (cities.some((c) => c.slug === params.city) ? params.city : "") || "";
  const shared = useHomeSearch();
  const [localCity, setCity] = useState(urlCity);
  const [localPickup, setPickup] = useState(sp.pickup ?? "");
  const [localRet, setRet] = useState(sp.ret ?? "");
  const city = shared?.city ?? localCity;
  const pickup = shared?.pickup ?? localPickup;
  const ret = shared?.ret ?? localRet;
  const changeCity = shared?.setCity ?? setCity;
  const changePickup = shared?.setPickup ?? setPickup;
  const changeRet = shared?.setRet ?? setRet;
  const [q, setQ] = useState(sp.q ?? "");
  const [open, setOpen] = useState(false);
  useEffect(() => { setCity(urlCity); setPickup(sp.pickup ?? ""); setRet(sp.ret ?? ""); setQ(sp.q ?? ""); }, [urlCity, sp.pickup, sp.ret, sp.q]);

  if (/\/(checkout|booking|my-booking)(\/|$)/.test(pathname)) return null;

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setOpen(false);
    window.__lovableEvents?.track?.("project.fleet_filter", {});
    (window.dataLayer ??= []).push({ event: "fleet_filter" });
    const dates = { pickup: pickup || undefined, ret: ret || undefined, ...(shared ? { loc: shared.loc || undefined } : {}) };
    if (q.trim()) return void navigate({ to: "/$lang/search", params: { lang }, search: { q: q.trim(), city: city || undefined, ...dates } });
    if (city) return void navigate({ to: "/$lang/$city", params: { lang, city }, search: dates });
    navigate({ to: "/$lang/search", params: { lang }, search: dates });
  };

  const cityName = cities.find((c) => c.slug === (shared ? city : urlCity))?.name;
  const fmtD = (s?: string) => (s ? new Date(s).toLocaleDateString(lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US", { month: "short", day: "numeric" }) : "");
  const pillPickup = shared ? pickup : sp.pickup, pillRet = shared ? ret : sp.ret;
  const pill = [sp.q ? `“${sp.q}”` : null, cityName, pillPickup && pillRet ? `${fmtD(pillPickup)}–${fmtD(pillRet)}` : null].filter(Boolean).join(" · ") || tr.sbar.edit;

  const fields = (stack: boolean) => (
    <form action={publicPath(lang, "search")} method="get" onSubmit={submit} className={cn("gap-2", stack ? "flex flex-col gap-3" : "grid grid-cols-[0.9fr_1.5fr_1.5fr_1.3fr_auto] items-center")} role="search">
      <label className="text-xs text-muted-foreground"><span className={cn(!stack && "sr-only")}>{tr.sbar.city}</span>
        <select name="city" aria-label={tr.sbar.city} value={city} onChange={(e) => changeCity(e.target.value)} className={cn(inputCls, "cursor-pointer", stack && "mt-1 h-12")}>
          <option value="">{tr.sbar.allCities}</option>
          {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      </label>
      <div className="text-xs text-muted-foreground"><span className={cn(!stack && "sr-only")}>{tr.search.pickup}</span>
        <DateTimeField lang={lang} label={tr.search.pickup} name="pickup" value={pickup} onChange={changePickup} compact={!stack} className={cn(!stack && "mt-0")} />
      </div>
      <div className="text-xs text-muted-foreground"><span className={cn(!stack && "sr-only")}>{tr.search.ret}</span>
        <DateTimeField lang={lang} label={tr.search.ret} name="ret" value={ret} min={pickup || undefined} onChange={changeRet} compact={!stack} className={cn(!stack && "mt-0")} />
      </div>
      <ModelInput value={q} onChange={setQ} stack={stack} onPick={() => setOpen(false)} serviceCity={city} dates={{ pickup, ret }} />
      <Button type="submit" size={stack ? "lg" : "sm"} className={cn(!stack && "h-10")}><Search className="size-4" />{tr.sbar.go}</Button>
    </form>
  );

  return (
    <div className="border-t border-border/60" data-testid="sticky-search">
      <div className="mx-auto hidden max-w-7xl px-5 py-2 md:block">{fields(false)}</div>
      <div className="px-4 py-2 md:hidden">
        <button type="button" onClick={() => setOpen(true)} className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 text-left text-sm" aria-label={tr.sbar.edit}>
          <Search className="size-4 shrink-0 text-primary" /><span className="truncate">{pill}</span>
        </button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="rounded-t-3xl bg-background pb-8">
            <SheetTitle className="font-display mb-4">{tr.sbar.edit}</SheetTitle>
            {fields(true)}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

function ModelInput({ value, onChange, stack, onPick, serviceCity, dates }: { value: string; onChange: (v: string) => void; stack: boolean; onPick: () => void; serviceCity: string; dates: { pickup: string; ret: string } }) {
  const { lang, tr } = useLang();
  const cities = useBookingCities();
  const [focus, setFocus] = useState(false);
  const { data: all = [] } = useQuery({ ...vehiclesQuery(), enabled: focus || value.length > 0 });
  const blurT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hits = useMemo(() => (value.trim().length >= 2 ? searchCars(all, value).slice(0, 8) : []), [all, value]);
  const svc = cities.find((c) => c.slug === serviceCity);
  return (
    <div className="relative">
      <label className="text-xs text-muted-foreground"><span className={cn(!stack && "sr-only")}>{tr.sbar.model}</span>
        <input name="q" aria-label={tr.sbar.model} type="search" value={value} placeholder={tr.sbar.model} autoComplete="off"
          onFocus={() => { clearTimeout(blurT.current); setFocus(true); }} onBlur={() => { blurT.current = setTimeout(() => setFocus(false), 150); }}
          onChange={(e) => onChange(e.target.value)} className={cn(inputCls, stack && "mt-1 h-12")} />
      </label>
      {focus && hits.length > 0 && (
        <ul role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-2xl border border-border bg-card p-1 shadow-xl">
          {hits.map((v) => {
            const sc = svc && (svc.fleet_from_city || svc.slug) === v.city && svc.slug !== v.city ? svc.slug : undefined;
            return (
              <li key={v.id}>
                <Link to="/$lang/cars/$city/$slug" params={{ lang, city: v.city, slug: v.slug }} search={{ city: sc, pickup: dates.pickup || undefined, ret: dates.ret || undefined }}
                  onClick={onPick} className="flex items-center gap-3 rounded-xl p-2 hover:bg-secondary">
                  <img src={photoUrl(v.photos[0])} alt="" aria-hidden="true" className="aspect-[3/2] w-14 shrink-0 rounded-lg object-cover" />
                  <span className="flex-1 text-sm">{v.name}</span>
                  <span className="text-xs text-muted-foreground">{cities.find((c) => c.slug === v.city)?.name ?? v.city}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {value && stack && <button type="button" aria-label="Clear" onClick={() => onChange("")} className="absolute right-3 top-[34px] text-muted-foreground"><X className="size-4" /></button>}
    </div>
  );
}

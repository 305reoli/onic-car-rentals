import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLang } from "@/hooks/use-lang";
import { useBookingCities } from "@/hooks/use-cities";
import { cityLocations } from "@/lib/vehicles";
import { orlandoTooShort } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VEHICLE_TYPES, type VehicleType } from "@/lib/vehicleTypes";
import { vehicleTypeText } from "@/lib/i18n";
import { DateTimeField } from "@/components/site/DateTimeField";
import { useHomeSearch } from "@/hooks/use-home-search";

export const fieldCls = "h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground [color-scheme:light] focus:border-primary focus:outline-none";

export function SearchBox({ initialCity }: { initialCity?: string }) {
  const { lang, tr } = useLang();
  const cities = useBookingCities();
  const navigate = useNavigate();
  const shared = useHomeSearch();
  const [localCity, setLocalCity] = useState<string>((initialCity === "tampa" ? "orlando" : initialCity === "fort-lauderdale" ? "miami" : initialCity) ?? cities[0]?.slug ?? "miami");
  const city = shared?.city ?? localCity;
  const setCity = shared?.setCity ?? setLocalCity;
  const current = cities.find((c) => c.slug === city);
  const [localLoc, setLocalLoc] = useState<string>(cityLocations(current)[0]?.key ?? "");
  const [localPickup, setLocalPickup] = useState("");
  const [localRet, setLocalRet] = useState("");
  const loc = shared?.loc ?? localLoc, setLoc = shared?.setLoc ?? setLocalLoc;
  const pickup = shared?.pickup ?? localPickup, setPickup = shared?.setPickup ?? setLocalPickup;
  const ret = shared?.ret ?? localRet, setRet = shared?.setRet ?? setLocalRet;
  const [type, setType] = useState<VehicleType>("all");

  const orlandoShort = !!(pickup && ret && orlandoTooShort(city, new Date(pickup), new Date(ret)));
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const picked = (new FormData(e.currentTarget).get("type") as VehicleType | null) ?? type;
    const pu = pickup || (e.currentTarget.elements.namedItem("pickup") as HTMLInputElement | null)?.value || "";
    const rt = ret || (e.currentTarget.elements.namedItem("ret") as HTMLInputElement | null)?.value || "";
    if (pu && rt && orlandoTooShort(city, new Date(pu), new Date(rt))) return;
    window.__lovableEvents?.track?.("project.fleet_filter", { city, category: picked });
    (window.dataLayer ??= []).push({ event: "fleet_filter", city, category: picked });
    navigate({ to: "/$lang/$city", params: { lang, city }, search: { loc, pickup: pu || undefined, ret: rt || undefined, type: picked } });
  };

  return (
    <form action={`/${lang === "pt" ? "" : lang + "/"}${city}`} method="get" onSubmit={submit} data-testid="hero-search" className="surface w-full max-w-4xl p-3 md:p-5">
      <div className="mb-2 flex max-w-full gap-2 md:inline-flex">
        {cities.map((c) => (
          <Button
            type="button"
            key={c.slug}
            onClick={() => { setCity(c.slug); setLoc(cityLocations(c)[0]?.key ?? ""); }}
            variant={city === c.slug ? "default" : "outline"}
            aria-pressed={city === c.slug}
            className="h-11 min-h-11 flex-1 px-4 text-sm md:flex-none"
          >
            {c.name}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-[1.3fr_1fr_1fr]">
        <label className="col-span-2 text-xs text-muted-foreground md:col-span-1">
          {tr.search.location}
          <select value={loc} onChange={(e) => setLoc(e.target.value)} className={cn(fieldCls, "mt-1 cursor-pointer")}>
            {cityLocations(current).map((l) => <option key={l.key} value={l.key}>{l[lang]}</option>)}
          </select>
        </label>
        <div className="col-span-2 text-xs text-muted-foreground sm:col-span-1">
          {tr.search.pickup}
          <DateTimeField lang={lang} label={tr.search.pickup} name="pickup" value={pickup} onChange={setPickup} />
        </div>
        <div className="col-span-2 text-xs text-muted-foreground sm:col-span-1">
          {tr.search.ret}
          <DateTimeField lang={lang} label={tr.search.ret} name="ret" value={ret} min={pickup || undefined} onChange={setRet} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2" data-testid="hero-types">
        {VEHICLE_TYPES.map(value => (
          <label key={value} className="inline-flex h-11 min-h-11 cursor-pointer select-none items-center rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
            <input type="radio" name="type" value={value} checked={type === value} onChange={() => setType(value)} className="sr-only" />
            {vehicleTypeText[lang][value]}
          </label>
        ))}
      </div>
      {orlandoShort && <p role="alert" data-testid="orlando-min" className="mt-2 text-sm font-medium text-destructive">{tr.search.orlandoMin}</p>}
      <Button type="submit" disabled={orlandoShort} className="mt-2 h-12 w-full">{tr.search.show}</Button>
    </form>
  );
}

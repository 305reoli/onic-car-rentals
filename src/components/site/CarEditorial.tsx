import { Link } from "@tanstack/react-router";
import { useLang } from "@/hooks/use-lang";
import { aeoUi, carColorText, fmt } from "@/lib/i18n";
import { slugify } from "@/lib/publicRoutes";
import { officialEngines } from "@/data/modelContent";
import { carSpecs, type Vehicle } from "@/lib/vehicles";

export function CarEditorial({ vehicle, cityName }: { vehicle: Vehicle; cityName: string }) {
  const { lang } = useLang(), ui = aeoUi[lang];
  const engine = officialEngines[`${vehicle.brand} ${vehicle.model}`];
  const transmission = vehicle.transmission === "Automatic" ? (lang === "pt" ? "Automática" : lang === "es" ? "Automática" : "Automatic") : vehicle.transmission;
  const colorKey = vehicle.color?.trim().toLowerCase();
  const color = colorKey === "gray" || colorKey === "grey" ? carColorText[lang][colorKey] : vehicle.color;
  const rows: [string, string | number][] = [
    ...(engine ? [[ui.engine, engine[lang]] as [string, string]] : []),
    ...carSpecs({ ...vehicle, transmission, color }, lang),
    ...(vehicle.seats != null ? [[ui.seats, vehicle.seats] as [string, number]] : []),
    ...(vehicle.bags != null ? [[ui.bags, vehicle.bags] as [string, number]] : []),
  ];
  return <>
    <section className="mt-10" data-testid="car-specs">
      <h2 className="font-display mb-4 text-2xl">{ui.specs}</h2>
      <dl className="grid gap-x-8 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-5 border-b border-border py-3"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-sm font-medium">{value}</dd></div>)}</dl>
      {engine && <a href={engine.source} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-primary hover:underline">{vehicle.brand}</a>}
    </section>
    <section className="mt-10" data-testid="car-brand">
      <h2 className="font-display mb-3 text-2xl">{fmt(ui.brand, { brand: vehicle.brand })}</h2>
      <p className="leading-relaxed text-muted-foreground">{fmt(ui.brandBlock, { brand: vehicle.brand, city: cityName })}</p>
      <Link to="/$lang/brand-hub/$city/$brand" params={{ lang, city: vehicle.city, brand: slugify(vehicle.brand) }} className="mt-4 inline-block text-sm text-primary hover:underline">{fmt(ui.brandH1, { brand: vehicle.brand, city: cityName })} →</Link>
    </section>
  </>;
}
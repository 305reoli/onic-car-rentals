import { Link } from "@tanstack/react-router";
import { Users, Briefcase, Gauge } from "lucide-react";
import { useLang } from "@/hooks/use-lang";
import { fmt } from "@/lib/i18n";
import { cityName, photoSrcSet, sizedPhoto, CARD_SIZES, type Vehicle } from "@/lib/vehicles";
import { useCities } from "@/hooks/use-cities";
import { allInPrice, effectiveMinDays, rentalDays, usd } from "@/lib/pricing";
import { useQuery } from "@tanstack/react-query";
import { settingsQuery } from "@/lib/queries";
import { crossCell, crossConfig } from "@/lib/pricing";
import { carDeliveryNote } from "@/lib/deliveryText";
import { Button } from "@/components/ui/button";
import { convText } from "@/lib/i18n";
import { datedTotal, locFee } from "@/lib/searchLocation";
import { usd2, superDealFor } from "@/lib/pricing";
import { superDealText } from "@/lib/i18n";
import { locationLabel, hasDailyPrice } from "@/lib/vehicles";
import { PricelessWhatsApp } from "@/components/site/PriceOnRequest";

/** Daily price. In a city served from another fleet the delivery & collection fee is embedded (all-in daily):
 *  exact for the searched dates, otherwise "from" over the reference length. */
export function PriceTag({ v, size = "md", search }: { v: Vehicle; size?: "md" | "lg"; search?: Record<string, string | undefined> | undefined }) {
  const { tr, lang } = useLang();
  const cls = size === "lg" ? "text-2xl" : "text-lg";
  if (!hasDailyPrice(v)) return <span className={`font-display ${cls} text-primary`}>{tr.fleet.priceOnRequest}</span>;
  const p = search?.["pickup"], r = search?.["ret"];
  const deal = superDealFor(v.id);
  if (deal) {
    const t = superDealText[lang];
    return (
      <span className="flex flex-col gap-1" data-testid="super-deal">
        <span className={`font-display inline-flex flex-wrap items-baseline gap-x-1.5 ${cls}`}>
          <span className="rounded-full bg-primary px-2 py-0.5 font-sans text-[11px] font-semibold tracking-wide text-primary-foreground">{t.badge}</span>
          <span className="whitespace-nowrap">{usd2(deal.rate)}<span className="text-sm font-normal text-muted-foreground">{tr.fleet.perDay}</span></span>
          <s className="text-sm font-normal text-muted-foreground" aria-label={`${t.was} ${usd2(v.daily_price_usd)}`}>{usd2(v.daily_price_usd)}</s>
        </span>
        <span className="text-xs leading-snug text-muted-foreground">{t.note}</span>
      </span>
    );
  }
  // Cards never show a discounted rate or -% badge (except an owner SUPER_DEALS unit); discounts appear only in the dated summary.
  return (
    <span className={`font-display inline-flex flex-wrap items-baseline gap-x-1.5 ${cls}`}>
      <span className="text-sm font-normal text-muted-foreground">{tr.fleet.from}{" "}</span><span className="whitespace-nowrap">{usd2(v.daily_price_usd)}<span className="text-sm font-normal text-muted-foreground">{tr.fleet.perDay}</span></span>
    </span>
  );
}

export function CarCard({ v, search, serviceCity }: { v: Vehicle; search?: Record<string, string | undefined> | undefined; serviceCity?: string | undefined }) {
  const { lang, tr } = useLang();
  const cities = useCities();
  const { data: st } = useQuery(settingsQuery());
  const minN = effectiveMinDays(v, (st as { min_days_by_category?: unknown } | undefined)?.min_days_by_category).n;
  // Dates shorter than this car's minimum: show "Minimum X days" instead of booking for those dates.
  const short = !!(search?.["pickup"] && search?.["ret"] && rentalDays(new Date(search["pickup"]), new Date(search["ret"])) < minN);
  const link = { to: "/$lang/cars/$city/$slug", params: { lang, city: v.city, slug: v.slug }, search: { ...(search ?? {}), city: serviceCity && serviceCity !== v.city ? serviceCity : undefined } } as const;
  return (
    <article data-reveal className="surface lift group flex min-w-0 flex-col overflow-hidden">
      <Link {...link} className="ph relative block aspect-[3/2] overflow-hidden">
        <img src={sizedPhoto(v.photos[0], 640)} srcSet={photoSrcSet(v.photos[0], [400, 640, 960])} sizes={CARD_SIZES} decoding="async" alt={fmt(tr.seo.alt, { car: v.name, city: cityName(cities, serviceCity || v.city) })} loading="lazy" width={1200} height={800} className="fade size-full object-cover transition-[transform,opacity] duration-500 group-hover:scale-105" />
        {v.is_sample && <span className="absolute right-4 top-4 rounded-full bg-background/80 px-2 py-1 text-[10px] font-bold tracking-widest text-muted-foreground">{tr.fleet.sample}</span>}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:gap-3 sm:p-5">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground sm:text-xs">
          {cityName(cities, serviceCity ?? v.city)} · {tr.categories[v.body_category as "suv"] ?? ""}
        </div>
        <Link {...link} className="min-w-0"><h3 className="font-display break-words text-lg leading-tight sm:text-xl">{v.name}</h3></Link>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground sm:text-sm">
          <span className="flex items-center gap-1"><Users className="size-4" />{v.seats}</span>
          <span className="flex items-center gap-1"><Briefcase className="size-4" />{v.bags}</span>
          {v.hp && <span className="flex items-center gap-1"><Gauge className="size-4" />{v.hp} {tr.fleet.hp}</span>}
        </div>
        {serviceCity && serviceCity !== v.city && <p className="text-xs text-muted-foreground">{carDeliveryNote(lang, (st as { delivery_config?: unknown } | undefined)?.delivery_config, v, crossCell(v.city, serviceCity, v, crossConfig(((st as { delivery_config?: { cross?: unknown } } | undefined)?.delivery_config)?.cross)), serviceCity)}</p>}
        {(() => {
          const cv = convText[lang];
          const dated = !short && hasDailyPrice(v) ? datedTotal(v, search?.["pickup"], search?.["ret"], st, serviceCity ?? v.city) : null;
          const loc = search?.["loc"];
          const lf = loc ? locFee(v, loc, (st as { delivery_config?: unknown } | undefined)?.delivery_config) : null;
          const place = loc ? locationLabel(cities.find((c) => c.slug === (serviceCity ?? v.city)), loc, lang) : "";
          return <>
            {dated && <div className="border-t border-border py-1.5 sm:rounded-xl sm:border sm:px-3 sm:py-2" data-testid="card-total"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"><span className="min-w-0 text-xs text-muted-foreground">{fmt(cv.totalFor, { n: dated.days })}</span><span className="font-display shrink-0 text-lg">{usd2(dated.total)}</span></div></div>}
            {loc && (lf != null || (serviceCity ?? v.city) === v.city) && <p className="text-xs text-muted-foreground" data-testid="card-loc-fee">{lf == null ? fmt(cv.locNA, { place }) : lf.type === "pickup" && lf.fee === 0 ? cv.locBase : lf.fee === 0 ? fmt(cv.locFree, { place }) : fmt(lf.upTo25 ? cv.locAddress : cv.locFee, { place, fee: usd2(lf.fee)! })}</p>}
          </>;
        })()}
        <div className="mt-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pt-1 sm:flex sm:justify-between sm:pt-2">
          <div className="min-w-0"><PriceTag v={v} search={search} /></div>
          {!hasDailyPrice(v)
            ? <PricelessWhatsApp lang={lang} car={v.name} city={cityName(cities, serviceCity ?? v.city)} size="sm" />
            : short
            ? <span data-testid="min-badge" className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">{fmt(tr.car.minDaysBadge, { n: minN })}</span>
            : <Button asChild size="sm"><Link {...link}>{tr.fleet.book}</Link></Button>}
        </div>
      </div>
    </article>
  );
}

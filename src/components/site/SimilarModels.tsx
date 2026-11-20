import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { vehiclesQuery, unavailableQuery } from "@/lib/queries";
import { similarModels, similarCardLink, similarFleetLink, showSimilarModels } from "@/lib/similarModels";
import { similarModelsText, t, fmt, convText, type Lang } from "@/lib/i18n";
import { datedTotal } from "@/lib/searchLocation";
import { usd2 } from "@/lib/pricing";
import { photoSrcSet, sizedPhoto, type Vehicle } from "@/lib/vehicles";
import type { BookingSearch } from "@/lib/search";
import { PriceTag } from "./CarCard";

/** Gate on explicit selection, not suggested defaults or successful URL navigation. */
export function SelectedDateSimilarModels({ datesSelected, bookedIssue, ...props }: Parameters<typeof SimilarModels>[0] & { datesSelected: boolean; bookedIssue: boolean }) {
  if (!datesSelected || !showSimilarModels(props.search.pickup, props.search.ret, bookedIssue)) return null;
  return <SimilarModels {...props} />;
}

export function SimilarModels({ current, search, lang, settings }: { current: Vehicle; search: BookingSearch; lang: Lang; settings: unknown }) {
  const { data: fleet, isError: fleetError } = useQuery(vehiclesQuery(current.city));
  const { data: unavailable, isError: availabilityError } = useQuery(unavailableQuery(current.city, search.pickup ?? "", search.ret ?? ""));
  const copy = similarModelsText[lang];
  const ready = !!fleet && !!unavailable && !fleetError && !availabilityError;
  const cars = ready ? similarModels(fleet, current, unavailable).slice(0, 4) : [];
  return <section className="mt-6 border-t border-border pt-5" aria-labelledby="similar-models-title" data-testid="similar-models">
    <h2 id="similar-models-title" className="font-display mb-4 text-2xl">{copy.heading}</h2>
    {!ready ? <p className="text-sm text-muted-foreground">{fleetError || availabilityError ? copy.error : convText[lang].calculating}</p> : !cars.length ? <p className="text-sm text-muted-foreground" data-testid="similar-empty">{copy.empty}</p> : <div className="grid grid-cols-2 gap-3">
      {cars.map(v => {
        const total = datedTotal(v, search.pickup, search.ret, settings, search.city ?? v.city);
        return <article key={v.id} className="surface overflow-hidden" data-testid="similar-card">
          <Link {...similarCardLink(lang, v, search)}>
            <img src={sizedPhoto(v.photos[0], 400)} srcSet={photoSrcSet(v.photos[0], [240, 400, 640])} sizes="200px" width={600} height={400} loading="lazy" alt={v.name} className="aspect-[3/2] w-full object-cover" />
            <div className="flex flex-col gap-2 p-3"><h3 className="font-display text-lg leading-tight">{v.name}</h3><PriceTag v={v} search={search} />
              <div className="text-xs text-muted-foreground">{total ? fmt(convText[lang].totalFor, { n: total.days }) : t(lang).car.total}<span className="mt-1 block text-sm font-semibold text-foreground">{total ? usd2(total.total) : t(lang).car.toBeConfirmed}</span></div>
              {total && <p className="text-xs text-muted-foreground">{convText[lang].totalNote}</p>}
            </div>
          </Link>
        </article>;
      })}
    </div>}
    <Button asChild variant="outline" className="mt-4 w-full"><Link {...similarFleetLink(lang, current, search)}>{copy.button}<ArrowRight className="size-4" /></Link></Button>
  </section>;
}
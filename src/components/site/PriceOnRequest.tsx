import type { ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, waLink, waMessage, type Lang } from "@/lib/i18n";

/** WhatsApp-only call to action for a car without a daily price — no dates, extras, totals or payment. */
export function PricelessWhatsApp({ lang, car, city, size = "lg" }: { lang: Lang; car: string; city: string; size?: "sm" | "lg" }) {
  return (
    <Button asChild variant="whatsapp" size={size} data-testid="priceless-whatsapp">
      <a href={waLink(waMessage(lang, { kind: "car", car, city }))} target="_blank" rel="noreferrer"><MessageCircle className="size-4" />{t(lang).cta.whatsapp}</a>
    </Button>
  );
}

export function PriceOnRequestPanel({ lang, car, city, children }: { lang: Lang; car: string; city: string; children?: ReactNode }) {
  const tr = t(lang);
  return (
    <div className="surface flex flex-col gap-4 p-5" data-testid="price-on-request">
      <p className="font-display text-3xl text-primary">{tr.fleet.priceOnRequest}</p>
      <p className="text-sm text-muted-foreground">{tr.fleet.priceOnRequestNote}</p>
      <PricelessWhatsApp lang={lang} car={car} city={city} />
      {children}
    </div>
  );
}

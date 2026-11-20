import { Link } from "@tanstack/react-router";
import { useLang } from "@/hooks/use-lang";
import { superDealText } from "@/lib/i18n";
import { superDealFor, SUPER_DEALS } from "@/lib/pricing";

/** Small scrolling strip at the bottom of the home hero: the owner's super deal, linking to its car page.
 *  Hidden once the booking window closes. CSS-only marquee, static under reduced motion. */
export function PromoTicker() {
  const { lang } = useLang();
  const deal = SUPER_DEALS[0];
  if (!deal || !superDealFor(deal.vehicle_id)) return null;
  const text = superDealText[lang].ticker;
  const item = (hidden?: boolean) => (
    <Link to="/$lang/cars/$city/$slug" params={{ lang, city: "orlando", slug: "lamborghini-huracan-evo-spyder" }} aria-hidden={hidden || undefined} tabIndex={hidden ? -1 : undefined}
      className="inline-flex min-h-[44px] items-center px-8 text-sm font-medium hover:underline">{text}</Link>
  );
  return (
    <div className="promo-ticker absolute inset-x-0 bottom-0 z-10 overflow-hidden border-t border-border bg-background/80 backdrop-blur" data-testid="promo-ticker">
      <div className="promo-ticker-track flex w-max whitespace-nowrap">{item()}{item(true)}{item(true)}{item(true)}</div>
    </div>
  );
}

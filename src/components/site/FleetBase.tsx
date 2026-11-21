import { useQuery } from "@tanstack/react-query";
import { settingsQuery } from "@/lib/queries";
import { bookingBase, deliveryConfig } from "@/lib/pricing";
import { deliveryRowText, type Lang } from "@/lib/i18n";
import { directionsUrl, launchText } from "@/lib/launch";

export function FleetBase({ city, lang }: { city: string; lang: Lang }) {
  const { data } = useQuery(settingsQuery());
  const raw = (data as { delivery_config?: unknown } | undefined)?.delivery_config;
  const address = deliveryConfig(raw).bases[bookingBase(city)]?.address;
  return address ? <p className="text-sm text-muted-foreground" data-testid="fleet-base-address">{deliveryRowText[lang].base} — {address} · <a href={directionsUrl(address)} target="_blank" rel="noreferrer" className="text-primary hover:underline">{launchText[lang].directions} ↗</a></p> : null;
}
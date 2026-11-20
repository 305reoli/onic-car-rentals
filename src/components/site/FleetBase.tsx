import { useQuery } from "@tanstack/react-query";
import { settingsQuery } from "@/lib/queries";
import { bookingBase, deliveryConfig } from "@/lib/pricing";
import { deliveryRowText, type Lang } from "@/lib/i18n";

export function FleetBase({ city, lang }: { city: string; lang: Lang }) {
  const { data } = useQuery(settingsQuery());
  const raw = (data as { delivery_config?: unknown } | undefined)?.delivery_config;
  const address = deliveryConfig(raw).bases[bookingBase(city)]?.address;
  return address ? <p className="text-sm text-muted-foreground" data-testid="fleet-base-address">{deliveryRowText[lang].base} — {address}</p> : null;
}
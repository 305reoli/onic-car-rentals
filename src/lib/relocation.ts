import { fmt, relocationText, type Lang } from "./i18n";
import type { DeliveryLeg } from "./pricing";

export const deliveryCityName = (city: string) => city === "fort-lauderdale" ? "Fort Lauderdale" : city === "orlando" ? "Orlando" : city === "miami" ? "Miami" : city === "tampa" ? "Tampa" : city;
export function relocationNotice(base: string, leg: DeliveryLeg & { direction: "pickup" | "return"; fee: number | null }, lang: Lang) {
  if (leg.city === base || leg.fee == null) return null;
  return fmt(relocationText[lang][leg.direction], { base: deliveryCityName(base), city: deliveryCityName(leg.city), fee: `US$ ${leg.fee.toLocaleString("en-US", { maximumFractionDigits: 2 })}` });
}
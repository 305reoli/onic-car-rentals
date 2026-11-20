import { useLang } from "@/hooks/use-lang";
import { checkoutPackageText } from "@/lib/i18n";
import { fullyPaidConfirmed } from "@/lib/bookingPerk";
import { Button } from "@/components/ui/button";
export function BookingPerk({ booking }: { booking: Parameters<typeof fullyPaidConfirmed>[0] }) {
  const { lang } = useLang();
  const t = checkoutPackageText[lang];
  if (!fullyPaidConfirmed(booking)) return null;
  return <section className="mt-8 border-y border-border py-6" data-testid="lojaparceira-perk"><h2 className="font-display text-2xl">{t.perk}</h2><p className="my-3 text-sm text-muted-foreground">{t.perkText}</p><div className="flex flex-wrap items-center gap-4"><code className="text-xl font-semibold">BENRENTAL10</code><Button asChild><a href="https://lojaparceira.com" target="_blank" rel="noreferrer">{t.visit}</a></Button></div></section>;
}
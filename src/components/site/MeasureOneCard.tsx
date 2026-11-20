import { Button } from "@/components/ui/button";
import { insuranceText, type Lang } from "@/lib/i18n";
import { measureOneCardUrl } from "@/lib/insurance";
import { rentalCoverPaid, type RentalCoverBooking } from "@/lib/rentalcover";

export type MeasureOneBooking = RentalCoverBooking & { insurance_us_flow?: string | null; insurance_choice?: string | null };

/** Post-payment MeasureOne step: renders nothing unless paid, US own-insurance pending, and the owner link is set. */
export function MeasureOneCard({ lang, link, booking }: { lang: Lang; link?: string | null; booking: MeasureOneBooking }) {
  const url = measureOneCardUrl(link, booking, rentalCoverPaid(booking));
  if (!url) return null;
  const t = insuranceText[lang];
  return (
    <section className="surface mt-6 p-5 sm:p-6" data-testid="measureone-card">
      <h2 className="font-display text-2xl">{t.m1Title}</h2>
      <p className="mb-4 mt-2 text-sm text-muted-foreground">{t.m1Body}</p>
      <Button asChild className="w-full sm:w-auto"><a href={url} target="_blank" rel="noopener noreferrer">{t.m1Button}</a></Button>
    </section>
  );
}

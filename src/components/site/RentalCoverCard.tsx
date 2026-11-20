import { Button } from "@/components/ui/button";
import { rentalCoverText, type Lang } from "@/lib/i18n";
import { rentalCoverCardUrl, type RentalCoverBooking, type RentalCoverCar } from "@/lib/rentalcover";

export function RentalCoverCard({ lang, link, car, booking }: { lang: Lang; link?: string | null; car?: RentalCoverCar | null; booking: RentalCoverBooking }) {
  const url = rentalCoverCardUrl(link, car, booking);
  if (!url) return null;
  const t = rentalCoverText[lang];
  return (
    <section className="surface mt-6 p-5 sm:p-6" data-testid="rentalcover-card">
      <h2 className="font-display text-2xl">{t.heading}</h2>
      <p className="mb-4 mt-2 text-sm text-muted-foreground">{t.body}</p>
      <Button asChild className="w-full sm:w-auto"><a href={url} target="_blank" rel="noopener noreferrer">{t.button}</a></Button>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t.disclosure}</p>
    </section>
  );
}
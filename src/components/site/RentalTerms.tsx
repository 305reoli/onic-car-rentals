import type { Lang } from "@/lib/i18n";
import { rentalTermsText } from "@/lib/i18n";
import { rentalTermsSections } from "@/lib/rentalTerms";

export function RentalTerms({ lang, cancellationOnly = false }: { lang: Lang; cancellationOnly?: boolean }) {
  return (
    <div data-testid="rental-terms" className="space-y-5 text-sm leading-relaxed text-muted-foreground">
      {!cancellationOnly && <p className="font-semibold text-foreground">{rentalTermsText[lang].agreement}</p>}
      {rentalTermsSections(lang, cancellationOnly).map(section => (
        <section key={section.number}>
          <h2 className="mb-2 text-base font-semibold text-foreground">{section.number}. {section.title}</h2>
          <p className="whitespace-pre-line">{section.body}</p>
        </section>
      ))}
    </div>
  );
}
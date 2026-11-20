import { bookingNextStepsText, type Lang } from "@/lib/i18n";

export function BookingNextSteps({ lang }: { lang: Lang }) {
 const t = bookingNextStepsText[lang];
 return <section className="my-6 border-y border-border py-5 text-left" data-testid="booking-next-steps"><h2 className="font-display mb-3 text-xl">{t.title}</h2><ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">{t.lines.map(line => <li key={line}>{line}</li>)}</ol></section>;
}
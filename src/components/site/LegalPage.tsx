import { useLang } from "@/hooks/use-lang";
import { Container } from "./Sections";
import { RentalTerms } from "./RentalTerms";
import { rentalTermsText } from "@/lib/i18n";

export function LegalPage({ kind }: { kind: "terms" | "cancellation" }) {
  const { lang, tr } = useLang();
  return (
    <Container className="max-w-3xl py-20">
      <h1 className="font-display mb-8 text-3xl md:text-5xl">{kind === "terms" ? rentalTermsText[lang].title : tr.legal.cancellation}</h1>
      <div className="text-muted-foreground">
        <RentalTerms lang={lang} cancellationOnly={kind === "cancellation"} />
        <p className="mt-4 text-xs">Sua Empresa LLC · Sua Locadora</p>
      </div>
    </Container>
  );
}

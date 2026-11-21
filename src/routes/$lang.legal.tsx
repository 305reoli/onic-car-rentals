import { seoHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ownerText, CALL_PHONE, CALL_PHONE_DISPLAY, t, waLink, waMessage, type Lang } from "@/lib/i18n";
import { useLang } from "@/hooks/use-lang";
import { settingsQuery } from "@/lib/queries";
import { Container, PageError } from "@/components/site/Sections";
import { NotFoundPage } from "@/components/site/NotFoundPage";
import { useCompany } from "@/components/site/Footer";

export const Route = createFileRoute("/$lang/legal")({
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQuery()),
  head: ({ params }) => {
    const lang = params.lang as Lang;
    const tr = t(lang);
    const title = tr.legal.legalTitle;
    return seoHead({ lang, path: "/legal", homeLabel: tr.seo.home, title: `${title} | Onic Car Rentals`, description: tr.legal.legalDesc, crumbs: [[title, "/legal"]] });
  },
  component: LegalInfo,
  errorComponent: PageError,
  notFoundComponent: NotFoundPage,
});

function LegalInfo() {
  const { lang, tr } = useLang();
  const { zip, email, str } = useCompany();
  const operator = str(`legal_operator_${lang}`) || str("legal_operator_en");
  const payments = str(`legal_payments_${lang}`) || str("legal_payments_en");
  const payAddr = str("payment_company_address");
  const H = ({ children }: { children: React.ReactNode }) => <h2 className="font-display mb-3 mt-10 text-xl text-foreground first:mt-0">{children}</h2>;
  return (
    <Container className="max-w-3xl py-20">
      <h1 className="font-display mb-8 text-4xl md:text-6xl">{tr.legal.legalTitle}</h1>
      <div className="surface p-8 text-muted-foreground">
        <H>{tr.legal.operatorTitle}</H>
        <p>{operator}</p>
        <p className="mt-3">1000 Lincoln Rd, Miami Beach, FL 33139 · +1 (954) 248-0903{email ? ` · ${email}` : ""}</p>
        <H>{tr.legal.paymentsTitle}</H>
        <p>{payments}</p>
        <p className="mt-3">{ownerText[lang].prereserve}</p>
        {payAddr && <p className="mt-2 text-sm">{payAddr}</p>}
        <H>{tr.legal.documentsTitle}</H>
        <ul className="flex flex-col gap-2 [&_a]:text-primary">
          <li><Link to="/$lang/terms" params={{ lang }}>{tr.legal.terms}</Link></li>
          <li><Link to="/$lang/privacy" params={{ lang }}>{tr.legal.privacy}</Link></li>
          <li><Link to="/$lang/cancellation" params={{ lang }}>{tr.legal.cancellation}</Link></li>
        </ul>
        <H>{tr.legal.supportTitle}</H>
        <p className="mb-2"><a href={`tel:${CALL_PHONE}`} className="text-primary">{ownerText[lang].call} {CALL_PHONE_DISPLAY}</a></p>
        <p className="mb-2">{ownerText[lang].hours}</p>
        <p className="[&_a]:text-primary"><a href={waLink(waMessage(lang, { kind: "general" }))} target="_blank" rel="noreferrer">WhatsApp +55 (65) 98404-6666</a>{email && <> · <a href={`mailto:${email}`}>{email}</a></>}</p>
      </div>
    </Container>
  );
}

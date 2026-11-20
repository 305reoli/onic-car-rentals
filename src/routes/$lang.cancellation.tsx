import { seoHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { t, rentalTermsText, type Lang } from "@/lib/i18n";
import { LegalPage } from "@/components/site/LegalPage";

export const Route = createFileRoute("/$lang/cancellation")({
  head: ({ params }) => {
    const lang = params.lang as Lang;
    const tr = t(lang);
    const title = tr.legal.cancellation;
    return seoHead({ lang, path: "/cancellation", homeLabel: tr.seo.home, title: `${title} | Onic Car Rentals`, description: rentalTermsText[lang].cancellationDescription, crumbs: [[title, "/cancellation"]] });
  },
  component: () => <LegalPage kind="cancellation" />,
});

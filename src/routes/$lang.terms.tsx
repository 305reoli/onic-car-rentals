import { seoHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { t, rentalTermsText, type Lang } from "@/lib/i18n";
import { LegalPage } from "@/components/site/LegalPage";

export const Route = createFileRoute("/$lang/terms")({
  head: ({ params }) => {
    const lang = params.lang as Lang;
    const tr = t(lang);
    const title = rentalTermsText[lang].title;
    return seoHead({ lang, path: "/terms", homeLabel: tr.seo.home, title: `${title} | Sua Locadora`, description: rentalTermsText[lang].description, crumbs: [[title, "/terms"]] });
  },
  component: () => <LegalPage kind="terms" />,
});

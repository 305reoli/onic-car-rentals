import { seoHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { aeoUi, t, type Lang } from "@/lib/i18n";
import { editorialMeta } from "@/lib/aeo";
import { PrivacyPolicy } from "@/components/site/PrivacyPolicy";

export const Route = createFileRoute("/$lang/privacy")({
  head: ({ params }) => {
    const lang = params.lang as Lang;
    const tr = t(lang);
    const title = tr.footer.privacyPolicy;
    return seoHead({ lang, path: "/privacy", homeLabel: tr.seo.home, title: `${title} | Onic Car Rentals`, description: editorialMeta(aeoUi[lang].privacyMeta, lang), crumbs: [[title, "/privacy"]] });
  },
  component: () => <PrivacyPolicy />,
});

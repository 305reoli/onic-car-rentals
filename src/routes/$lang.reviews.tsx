import { createFileRoute } from "@tanstack/react-router";
import { aeoUi, t, type Lang } from "@/lib/i18n";
import { seoHead } from "@/lib/seo";
import { editorialMeta } from "@/lib/aeo";
import { Reviews, googleReviewsQuery, PageError } from "@/components/site/Sections";
import { NotFoundPage } from "@/components/site/NotFoundPage";

export const Route = createFileRoute("/$lang/reviews")({
  loader: ({ context }) => context.queryClient.ensureQueryData(googleReviewsQuery()),
  head: ({ params }) => {
    const lang = params.lang as Lang, ui = aeoUi[lang];
    return seoHead({ lang, path: "reviews", title: `${ui.reviews} | Onic Car Rentals`, description: editorialMeta(ui.reviewsMeta, lang), homeLabel: t(lang).seo.home, crumbs: [[ui.reviews, "/reviews"]] });
  },
  component: () => <Reviews page />,
  errorComponent: PageError,
  notFoundComponent: NotFoundPage,
});
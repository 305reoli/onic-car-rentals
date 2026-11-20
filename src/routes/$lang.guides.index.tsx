import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { guidesQuery } from "@/lib/guides";
import { guideUi } from "@/lib/i18n.guides";
import { seoHead } from "@/lib/seo";
import { GuideIndex } from "@/components/site/GuidePage";
export const Route = createFileRoute("/$lang/guides/")({
  loader: ({ context, params }) => { if (params.lang !== "pt") throw notFound(); return context.queryClient.ensureQueryData(guidesQuery()); },
  head: () => seoHead({ lang: "pt", path: "guides", title: guideUi.metaTitle, description: guideUi.meta, homeLabel: "Início", crumbs: [["Guias", "/guides"]], equivalents: { pt: "guides" } }),
  component: Guides,
});
function Guides() { const { data } = useSuspenseQuery(guidesQuery()); return <GuideIndex cars={data.cars} />; }

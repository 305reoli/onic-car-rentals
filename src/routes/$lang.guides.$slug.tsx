import { createFileRoute, notFound } from "@tanstack/react-router";
import { buildGuide, guideHead, guidesQuery } from "@/lib/guides";
import { seoHead } from "@/lib/seo";
import { GuidePage } from "@/components/site/GuidePage";
import { PageError } from "@/components/site/Sections";
import { NotFoundPage } from "@/components/site/NotFoundPage";
export const Route = createFileRoute("/$lang/guides/$slug")({
  loader: async ({ context, params }) => { if (params.lang !== "pt") throw notFound(); const data = await context.queryClient.ensureQueryData(guidesQuery()); const g = buildGuide(params.slug, data.cars, data.settings, data.cities); if (!g) throw notFound(); return g; },
  head: ({ loaderData }) => loaderData ? guideHead(loaderData) : seoHead({ lang: "pt", path: "guides", title: "Guia não encontrado | Onic Car Rentals", description: "Este guia não está disponível.", noindex: true, equivalents: { pt: "guides" } }),
  component: Guide,
  errorComponent: PageError,
  notFoundComponent: NotFoundPage,
});
function Guide() { const g = Route.useLoaderData(); return <GuidePage guide={g} />; }

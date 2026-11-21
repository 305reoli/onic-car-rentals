import { NotFoundPage } from "@/components/site/NotFoundPage";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { discoveryPageQuery, discoveryHead } from "@/lib/discoveryPage";
import { DiscoveryPage } from "@/components/site/DiscoveryPage";
import { PageError } from "@/components/site/Sections";
import { bookingSearch } from "@/lib/search";

export const Route = createFileRoute("/$lang/discover/$kind/$city/$key")({
  validateSearch: bookingSearch,
  loader: async ({ context, params }) => {
    if (params.lang !== "pt" || !["brand", "model"].includes(params.kind)) throw notFound();
    const data = await context.queryClient.ensureQueryData(discoveryPageQuery(params.city, params.key));
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData, params }) => discoveryHead(loaderData, `discover/${params.kind}/${params.city}/${params.key}`),
  component: DiscoveryRoute,
  errorComponent: PageError,
  notFoundComponent: NotFoundPage,
});
function DiscoveryRoute() {
  const { city, key } = Route.useParams();
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(discoveryPageQuery(city, key));
  return data ? <DiscoveryPage data={data} search={search} /> : null;
}
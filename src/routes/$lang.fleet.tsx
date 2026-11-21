import { NotFoundPage } from "@/components/site/NotFoundPage";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { vehiclesQuery } from "@/lib/queries";
import { type Lang } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";
import { FleetGrid } from "@/components/site/FleetGrid";
import { Container, PageError } from "@/components/site/Sections";

export const Route = createFileRoute("/$lang/fleet")({
  loader: ({ context }) => context.queryClient.ensureQueryData(vehiclesQuery()),
  head: ({ params }) => pageHead(params.lang as Lang, "fleet", "/fleet"),
  component: () => {
    const { data } = useSuspenseQuery(vehiclesQuery());
    return <Container className="py-16 md:py-24"><FleetGrid h1 vehicles={data} /></Container>;
  },
  errorComponent: PageError,
  notFoundComponent: NotFoundPage,
});

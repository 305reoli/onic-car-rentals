import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getBooking } from "@/services/booking.functions";
import { useLang } from "@/hooks/use-lang";
import { type Lang } from "@/lib/i18n";
import { seoHead } from "@/lib/seo";
import { launchText, submittedBooking } from "@/lib/launch";
import { Container, PageError } from "@/components/site/Sections";
import { NotFoundPage } from "@/components/site/NotFoundPage";
import { BookingNextSteps } from "@/components/site/BookingNextSteps";
import { Button } from "@/components/ui/button";
import { trackPurchase } from "@/lib/funnel";
import { useEffect } from "react";
import { CheckCircle } from "lucide-react";

const confirmationQuery = (token: string) => queryOptions({ queryKey: ["booking", token], queryFn: () => getBooking({ data: { token } }) });
export const Route = createFileRoute("/$lang/thank-you/$token")({
  loader: async ({ context, params }) => {
    if (params.token.length < 20 || params.token.length > 100) throw notFound();
    const booking = await context.queryClient.ensureQueryData(confirmationQuery(params.token));
    if (!booking || !submittedBooking(booking.status)) throw notFound();
  },
  head: ({ params, match }) => {
    const lang = params.lang as Lang, ui = launchText[lang];
    return seoHead({ lang, path: `/thank-you/${params.token}`, title: `${match.status === "notFound" ? ui.notFound : ui.thankYou} — Onic Car Rentals`, description: match.status === "notFound" ? ui.missing : ui.thankMeta, noindex: true });
  },
  component: ThankYouPage,
  errorComponent: PageError,
  notFoundComponent: NotFoundPage,
});
function ThankYouPage() {
  const { token } = Route.useParams();
  const { lang, tr } = useLang();
  const { data: booking } = useSuspenseQuery(confirmationQuery(token));
  useEffect(() => { if (booking?.purchase) trackPurchase(booking.purchase); }, [booking?.purchase]);
  if (!booking) return null;
  return <Container className="max-w-2xl py-16">
    <CheckCircle className="mb-6 size-14 text-primary" />
    <h1 className="font-display mb-4 text-3xl md:text-5xl">{launchText[lang].thankYou}</h1>
    <p className="text-muted-foreground">{booking.vehicle_name}</p>
    <p className="mt-4 font-semibold">{tr.booking.ref}: {booking.ref}</p>
    <p className="mt-2 text-primary">{tr.booking.status[booking.status as keyof typeof tr.booking.status] ?? booking.status}</p>
    {booking.status === "pending_approval" && <BookingNextSteps lang={lang} />}
    <Button asChild className="mt-6"><Link to="/$lang/booking/$token" params={{ lang, token }}>{tr.checkout.viewBooking}</Link></Button>
  </Container>;
}
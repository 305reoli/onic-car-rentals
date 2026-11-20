import { createFileRoute, redirect } from "@tanstack/react-router";
import { MyBookingLookup } from "./$lang.my-booking";
import { pageHead } from "@/lib/seo";
import { t } from "@/lib/i18n";

// Old "My booking" URL → lookup page.
export const Route = createFileRoute("/$lang/booking/")({
  beforeLoad: ({ params }) => { if (params.lang !== "pt") throw redirect({ to: "/$lang/my-booking", params: { lang: params.lang }, statusCode: 301 }); },
  head: () => pageHead("pt", "home", "/booking", { title: `${t("pt").booking.title} — Sua Locadora`, description: t("pt").booking.find, noindex: true }),
  component: MyBookingLookup,
});

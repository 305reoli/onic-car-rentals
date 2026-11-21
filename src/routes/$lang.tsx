import { createFileRoute, notFound, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { isLang, rememberLang } from "@/lib/i18n";
import { citiesQuery } from "@/lib/queries";
import { Header, TopBar } from "@/components/site/Header";
import { Footer, WhatsAppFab } from "@/components/site/Footer";
import { CheckoutHeader, CheckoutFooter } from "@/components/site/CheckoutChrome";
import { HomeSearchProvider } from "@/hooks/use-home-search";
import { PageTrail } from "@/components/site/PageTrail";
import { NotFoundPage } from "@/components/site/NotFoundPage";
import { PageError } from "@/components/site/Sections";

export const Route = createFileRoute("/$lang")({
  beforeLoad: ({ params }) => {
    if (!isLang(params.lang)) throw notFound();
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(citiesQuery()),
  component: LangLayout,
  errorComponent: PageError,
  notFoundComponent: NotFoundPage,
});

function LangLayout() {
  const { lang } = Route.useParams();
  const checkout = useRouterState({ select: s => s.matches.some(m => m.routeId === "/$lang/checkout/$city/$slug") });
  const carDetail = useRouterState({ select: s => s.matches.some(m => m.routeId === "/$lang/cars/$city/$slug") });
  useEffect(() => {
    if (isLang(lang)) {
      rememberLang(lang);
      document.documentElement.lang = lang === "pt" ? "pt-BR" : lang;
    }
  }, [lang]);
  return (
    <HomeSearchProvider>
    <div className={checkout ? "checkout-shell mobile-touch flex min-h-screen flex-col" : `mobile-touch flex min-h-screen flex-col${carDetail ? " car-detail-shell" : ""}`}>
      {checkout ? <CheckoutHeader /> : <><TopBar /><Header /></>}
      <main className="flex-1">{!checkout && <PageTrail />}<Outlet /></main>
      {checkout ? <CheckoutFooter /> : <><Footer /><WhatsAppFab /></>}
    </div>
    </HomeSearchProvider>
  );
}

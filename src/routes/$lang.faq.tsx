import { createFileRoute } from "@tanstack/react-router";
import { type Lang } from "@/lib/i18n";
import { faqJsonLd, pageHead } from "@/lib/seo";
import { citiesQuery, settingsQuery, vehiclesQuery } from "@/lib/queries";
import { allMain, mainFaq, toPairs } from "@/lib/faqContent";
import { Faq, FinalCta } from "@/components/site/Sections";

export const Route = createFileRoute("/$lang/faq")({
  loader: async ({ context }) => {
    const [settings, cities, cars] = await Promise.all([
      context.queryClient.ensureQueryData(settingsQuery()), context.queryClient.ensureQueryData(citiesQuery()), context.queryClient.ensureQueryData(vehiclesQuery()),
    ]);
    return { settings, cities, cars };
  },
  head: ({ params, loaderData }) => {
    const lang = params.lang as Lang;
    const faq = loaderData ? toPairs(allMain(mainFaq(lang, loaderData.settings as never, loaderData.cities, loaderData.cars))) : [];
    return pageHead(lang, "faq", "/faq", { jsonLd: [faqJsonLd(faq)] });
  },
  component: () => (<><Faq h1 /><FinalCta /></>),
});

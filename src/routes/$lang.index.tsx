import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { citiesQuery, vehiclesQuery } from "@/lib/queries";
import { pickFeatured } from "@/lib/vehicles";
import { CarCard } from "@/components/site/CarCard";
import heroDesktop from "@/assets/hero/portofino-hero-desktop.jpg.asset.json";
import heroMobile from "@/assets/hero/portofino-hero-mobile.jpg.asset.json";
import { fmt, ptDiscoveryText, t, type Lang } from "@/lib/i18n";
import { lowestDaily } from "@/lib/discovery";
import { faqJsonLd, KEYWORDS, pageHead } from "@/lib/seo";
import { allMain, mainFaq, toPairs } from "@/lib/faqContent";
import { settingsQuery } from "@/lib/queries";
import { bookingSearch } from "@/lib/search";
import { useLang } from "@/hooks/use-lang";
import { HeroVideo } from "@/components/site/Motion";
import { PromoTicker } from "@/components/site/PromoTicker";
import { SearchBox } from "@/components/site/SearchBox";
import { GoogleRatingBadge, InstagramStrip } from "@/components/site/Conversion";
import { ConciergeSection } from "@/components/site/Concierge";
import { googleReviewsQuery } from "@/components/site/Sections";
import { About, CityCards, Container, Faq, HowItWorks, PageError, Reviews } from "@/components/site/Sections";

// Hero poster = LCP. The asset CDN resizes on ?w= and negotiates AVIF/WebP; never larger than the source (mobile 900w, desktop 1920w).
const HERO_MOBILE_SET = [420, 600, 900].map((w) => `${heroMobile.url}?w=${w}&q=70 ${w}w`).join(", ");
const HERO_DESKTOP_SET = [1024, 1280, 1600, 1920].map((w) => `${heroDesktop.url}?w=${w}&q=75 ${w}w`).join(", ");

export const Route = createFileRoute("/$lang/")({
  validateSearch: bookingSearch,
  // Random on every load; done in the loader so server and browser render the same selection.
  loader: async ({ context }) => {
    const [all, cities, settings] = await Promise.all([context.queryClient.ensureQueryData(vehiclesQuery()), context.queryClient.ensureQueryData(citiesQuery()), context.queryClient.ensureQueryData(settingsQuery()), typeof window === "undefined" ? context.queryClient.ensureQueryData(googleReviewsQuery()).catch(() => null) : void context.queryClient.prefetchQuery(googleReviewsQuery())]);
    const featured = pickFeatured(all);
    return { featuredLowest: lowestDaily(featured), featuredIds: featured.map((v) => v.id), faq: { settings, cities, cars: all } };
  },
  staleTime: 0,
  shouldReload: true,
  head: ({ params, loaderData }) => {
    const lang = params.lang as Lang;
    const h = pageHead(lang, "home", "", { ...(lang === "pt" ? { description: "Carros esportivos, exóticos e premium na Flórida. Atendimento em português para brasileiros desde 2014. Taxas discriminadas antes de pagar." } : {}), keywords: KEYWORDS, jsonLd: [faqJsonLd(loaderData ? toPairs(allMain(mainFaq(lang, loaderData.faq.settings as never, loaderData.faq.cities, loaderData.faq.cars))) : [])] });
    return {
      ...h,
      links: [...h.links, { rel: "preload", as: "image", href: `${heroDesktop.url}?w=1280&q=75`, imageSrcSet: HERO_DESKTOP_SET, imageSizes: "100vw", fetchPriority: "high", media: "(min-width: 768px)" }, { rel: "preload", as: "image", href: `${heroMobile.url}?w=600&q=70`, imageSrcSet: HERO_MOBILE_SET, imageSizes: "100vw", fetchPriority: "high", media: "(max-width: 767px)" }],
    };
  },
  component: Home,
  errorComponent: PageError,
  notFoundComponent: () => <PageError error={new Error("Not found")} />,
});

function Home() {
  const { tr, lang } = useLang();
  const { data } = useSuspenseQuery(vehiclesQuery());
  const { featuredIds, featuredLowest } = Route.useLoaderData();
  const featured = featuredIds.map((id) => data.find((v) => v.id === id)).filter((v) => !!v);
  return (
    <>
      <section className="relative flex min-h-[calc(100svh-11rem)] items-center overflow-hidden">
        <div data-parallax className="absolute inset-0 will-change-transform">
        <picture className="absolute inset-0 block">
          <source media="(max-width: 767px)" srcSet={HERO_MOBILE_SET} sizes="100vw" width={900} height={1350} />
          <img src={`${heroDesktop.url}?w=1280&q=75`} srcSet={HERO_DESKTOP_SET} sizes="100vw" alt="Ferrari Portofino" width={1920} height={1282} loading="eager" fetchPriority="high" decoding="async" className="absolute inset-0 size-full object-cover" />
        </picture>
        <HeroVideo />
        </div>
        <div className="hero-overlay absolute inset-0" />
        <Container className="relative w-full pb-16 pt-6 md:pb-20 md:pt-12">
          <h1 className="font-display max-w-4xl text-3xl leading-[1.1] md:text-8xl">{tr.hero.title}</h1>
          <p className="mb-3 mt-3 max-w-2xl text-sm text-muted-foreground md:mb-4 md:mt-6 md:text-lg">{tr.hero.sub}</p>
          <GoogleRatingBadge className="mb-4 md:mb-8" />
          <SearchBox />
        </Container>
        <PromoTicker />
      </section>
      <section className="pb-16" aria-labelledby="featured-title">
        <Container>
          <h2 id="featured-title" className="font-display text-2xl md:text-3xl">{tr.fleet.featured}</h2>
          <p className="mb-5 mt-2 text-sm text-muted-foreground">{tr.fleet.featuredSub}</p>
          {lang === "pt" && <p data-testid="landing-from" className="font-display mb-5 text-xl">{featuredLowest == null ? tr.fleet.priceOnRequest : fmt(ptDiscoveryText.from, { price: featuredLowest })}</p>}
          <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-2" data-testid="featured">
            {featured.map((v) => <div key={v.id} className="w-[78%] shrink-0 snap-start sm:w-[calc((100%-1rem)/2.2)] lg:w-[calc((100%-3rem)/4)]"><CarCard v={v} /></div>)}
            {/* End spacer: some browsers drop trailing padding in scroll containers, which cut the last card. */}
            <div aria-hidden="true" className="w-1 shrink-0" />
          </div>
        </Container>
      </section>
      <section className="pb-6 pt-16 md:pt-20" aria-labelledby="cities-title">
        <Container>
          <h2 id="cities-title" className="font-display text-3xl md:text-5xl">{tr.drill.chooseCity}</h2>
          <p className="mt-3 text-muted-foreground">{tr.drill.chooseCitySub}</p>
        </Container>
      </section>
      <CityCards />
      <Reviews />
      <HowItWorks />
      <About />
      <ConciergeSection />
      <Faq />
      <InstagramStrip />
    </>
  );
}

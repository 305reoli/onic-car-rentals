import { deliveryLegText } from "@/lib/i18n";
import { fmt } from "@/lib/i18n";
import { faqText } from "@/lib/faqContent";
import { useLang } from "@/hooks/use-lang";
import { cityDescription, type CityRow } from "@/lib/vehicles";
import { Container } from "./Sections";
import { CityCoverImg } from "./CityCover";
import { photoUrl } from "@/lib/vehicles";
import { CategoryTiles, type DrillSearch } from "./Drill";
import { BrandHubLinks } from "./BrandHubs";

/** Short city header + category tiles (no car list here). */
export function CityPage({ city, search }: { city: CityRow; search: DrillSearch }) {
  const { lang } = useLang();
  return (
    <Container className="pb-24 pt-10 md:pt-14">
      <header className="surface relative mb-8 flex aspect-[3/2] items-end overflow-hidden md:aspect-[16/7]">
        <CityCoverImg slug={city.slug} lang={lang} fallback={photoUrl(city.hero_photo)} fallbackAlt={city.name} eager sizes="(min-width: 1280px) 1200px, 100vw" />
        <div className="hero-overlay absolute inset-0" />
        <div className="relative p-6 md:p-10">
          <div className="eyebrow mb-2">Sua Locadora</div>
          <h1 className="font-display mb-3 text-5xl md:text-7xl">{city.name}</h1>
          {["orlando", "miami"].includes(city.slug) && <p className="mb-3 text-xs text-muted-foreground">{city.slug === "orlando" ? deliveryLegText[lang].tampa : deliveryLegText[lang].fll}</p>}
          <p className="max-w-2xl text-muted-foreground">{cityDescription(city, lang)}</p>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{fmt(faqText(lang).cityLine, { city: city.name })}</p>
        </div>
      </header>
      <CategoryTiles city={city} mode="city" search={search} />
      <BrandHubLinks city={city.slug} />
    </Container>
  );
}

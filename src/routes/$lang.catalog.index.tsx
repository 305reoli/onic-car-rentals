import { deliveryLegText } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type Lang } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";
import { useLang } from "@/hooks/use-lang";
import { useCities } from "@/hooks/use-cities";
import { photoUrl } from "@/lib/vehicles";
import { Container } from "@/components/site/Sections";

export const Route = createFileRoute("/$lang/catalog/")({
  head: ({ params }) => pageHead(params.lang as Lang, "catalog", "/catalog"),
  component: CatalogChoose,
});

function CatalogChoose() {
  const { lang, tr } = useLang();
  const cities = useCities().filter(c => c.slug === "orlando" || c.slug === "miami");
  return (
    <Container className="max-w-3xl py-14">
      <div className="eyebrow mb-3">{tr.catalog.title}</div>
      <h1 className="font-display mb-10 text-4xl md:text-6xl">{tr.catalog.choose}</h1>
      <div className="grid gap-5 sm:grid-cols-2">
        {cities.map((c) => (
          <Link key={c.slug} to="/$lang/catalog/$city" params={{ lang, city: c.slug }} className="surface group relative block aspect-[4/3] overflow-hidden">
            <img src={photoUrl(c.hero_photo)} alt={c.name} width={1280} height={960} loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105" />
            <div className="hero-overlay absolute inset-0" />
            <div className="absolute bottom-0 p-6">
              <h2 className="font-display text-3xl md:text-4xl">{c.name}</h2><p className="mt-2 text-xs text-muted-foreground">{c.slug === "orlando" ? deliveryLegText[lang].tampa : deliveryLegText[lang].fll}</p>
              <span className="text-sm font-semibold text-primary">{tr.catalog.open} →</span>
            </div>
          </Link>
        ))}
      </div>
    </Container>
  );
}

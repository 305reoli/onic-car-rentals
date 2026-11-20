import { deliveryLegText } from "@/lib/i18n";
import { Link } from "@tanstack/react-router";
import { fmt, ptDiscoveryText, t } from "@/lib/i18n";
import { internalPath, publicPath } from "@/lib/publicRoutes";
import type { DiscoveryData } from "@/lib/discoveryPage";
import { Container, FaqList } from "./Sections";
import { CarCard } from "./CarCard";
import { BrandHubLinks } from "./BrandHubs";

export function DiscoveryPage({ data, search }: { data: DiscoveryData; search?: Record<string, string | undefined> }) {
  return <Container className="pb-24 pt-10 md:pt-14">
    <nav aria-label="Breadcrumb" className="mb-7 flex flex-wrap gap-2 text-sm text-muted-foreground">
      <Link to="/$lang" params={{ lang: "pt" }}>{t("pt").seo.home}</Link>
      {data.crumbs.map(([name, path]) => <span key={path}> / <Link to={internalPath(publicPath("pt", path))}>{name}</Link></span>)}
    </nav>
    <header className="mb-10">
      <div className="eyebrow mb-3">Onic Car Rentals</div>
      <h1 className="font-display max-w-5xl text-4xl md:text-6xl">{data.h1}</h1>
      {!data.group && ["orlando", "miami"].includes(data.city.slug) && <p className="mt-3 text-xs text-muted-foreground">{data.city.slug === "orlando" ? deliveryLegText.pt.tampa : deliveryLegText.pt.fll}</p>}
      <p className="mt-5 max-w-4xl text-muted-foreground">{data.intro}</p>
      <p data-testid="landing-from" className="font-display mt-5 text-2xl">{data.lowest == null ? t("pt").fleet.priceOnRequest : fmt(ptDiscoveryText.from, { price: data.lowest })}</p>
    </header>
    {!data.group && <BrandHubLinks city={data.city.slug} />}
    {data.groups.length > 0 && <section className="mb-10 space-y-5 border-y border-border py-5">
      {(["category", "brand", "model"] as const).map((kind) => {
        const groups = data.groups.filter((g) => g.kind === kind);
        if (!groups.length) return null;
        return <div key={kind}>
          <h2 className="font-display mb-3 text-2xl">{fmt(kind === "category" ? ptDiscoveryText.categories : kind === "brand" ? ptDiscoveryText.brands : ptDiscoveryText.models, { city: data.city.name })}</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {groups.map((g) => <Link key={g.path} to={internalPath(publicPath("pt", g.path))} search={search ?? {}} className="text-sm text-primary underline-offset-4 hover:underline">{g.kind === "category" ? ptDiscoveryText.categoryNames[g.key] : g.label}</Link>)}
          </div>
        </div>;
      })}
    </section>}
    <section aria-label={fmt(ptDiscoveryText.cars, { city: data.city.name })} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {data.cars.map((v) => <CarCard key={v.id} v={v} serviceCity={data.city.slug} search={search} />)}
    </section>
    <section className="mt-16 max-w-4xl" data-testid="landing-faq">
      <h2 className="font-display mb-6 text-3xl">{t("pt").faq.title}</h2>
      <FaqList items={data.faq} />
    </section>
  </Container>;
}
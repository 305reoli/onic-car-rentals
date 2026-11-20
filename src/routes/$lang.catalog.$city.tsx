import { createFileRoute, notFound } from "@tanstack/react-router";
import { toast } from "sonner";
import { Share2 } from "lucide-react";
import { citiesQuery, unavailableQuery, vehiclesQuery } from "@/lib/queries";
import { bookingSearch } from "@/lib/search";
import { CategoryTiles } from "@/components/site/Drill";
import { useCities } from "@/hooks/use-cities";
import { fmt, t, type Lang } from "@/lib/i18n";
import { inCategory, PUBLIC_CATEGORIES } from "@/lib/vehicles";
import { seoHead, itemListJsonLd } from "@/lib/seo";
import { useLang } from "@/hooks/use-lang";
import { Container, PageError } from "@/components/site/Sections";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/$lang/catalog/$city")({
  validateSearch: bookingSearch,
  loaderDeps: ({ search }) => ({ pickup: search.pickup, ret: search.ret }),
  loader: async ({ context, params, deps }) => {
    const cities = await context.queryClient.ensureQueryData(citiesQuery());
    const c = cities.find((x) => x.slug === params.city);
    if (!c) throw notFound();
    const [cars] = await Promise.all([
      context.queryClient.ensureQueryData(vehiclesQuery(c.slug)),
      deps.pickup && deps.ret ? context.queryClient.ensureQueryData(unavailableQuery(c.slug, deps.pickup, deps.ret)) : null,
    ]);
    return { name: c.name, cats: PUBLIC_CATEGORIES.filter((k) => cars.some((v) => inCategory(v, k))) };
  },
  head: ({ params, loaderData }) => {
    const lang = params.lang as Lang;
    const tr = t(lang);
    const name = loaderData?.name ?? params.city;
    const title = fmt(tr.seo.catalogTitle, { city: name });
    return seoHead({
      lang, path: `/catalog/${params.city}`, homeLabel: tr.seo.home, noindex: !loaderData,
      title: `${title} | Onic Car Rentals`, description: fmt(tr.seo.cityDesc, { city: name }),
      crumbs: [[tr.seo.catalog, "/catalog"], [name, `/catalog/${params.city}`]],
      jsonLd: loaderData ? [itemListJsonLd(title, loaderData.cats.map((c) => ({ name: `${tr.seo.catTitle[c]} ${tr.seo.in} ${name}`, path: `/${lang}/catalog/${params.city}/${c}` })))] : [],
    });
  },
  component: Catalog,
  errorComponent: PageError,
  notFoundComponent: () => <PageError error={new Error("Not found")} />,
});

async function share(url: string, title: string, copied: string) {
  try {
    if (navigator.share) return await navigator.share({ url, title });
    await navigator.clipboard.writeText(url);
    toast.success(copied);
  } catch { /* cancelled */ }
}

function Catalog() {
  const { city } = Route.useParams();
  const { tr } = useLang();
  const c = useCities().find((x) => x.slug === city)!;
  return (
    <Container className="max-w-3xl py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">{tr.catalog.title}</div>
          <h1 className="font-display text-5xl md:text-7xl">{c.name}</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => share(window.location.href, `Onic Car Rentals · ${c.name}`, tr.catalog.copied)}>
          <Share2 />{tr.catalog.share}
        </Button>
      </div>
      <CategoryTiles city={c} mode="catalog" search={Route.useSearch()} />
    </Container>
  );
}

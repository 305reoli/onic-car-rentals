import { Link, useRouterState } from "@tanstack/react-router";
import { useLang } from "@/hooks/use-lang";
import { useCities } from "@/hooks/use-cities";
import { launchText } from "@/lib/launch";

export function PageTrail() {
  const { lang, tr } = useLang();
  const cities = useCities();
  const matches = useRouterState({ select: s => s.matches });
  const leaf = matches.at(-1);
  if (!leaf || leaf.routeId === "/$lang/" || /checkout|booking|thank-you|blog|guides|discover/.test(leaf.routeId)) return null;
  const citySlug = "city" in leaf.params && typeof leaf.params.city === "string" ? leaf.params.city : "";
  const city = cities.find(c => c.slug === citySlug);
  const title = leaf.meta?.find(m => m && "title" in m)?.title;
  const label = typeof title === "string" ? title.replace(/\s*[|—]\s*Onic Car Rentals.*$/, "") : city?.name;
  if (!label) return null;
  return <nav aria-label={launchText[lang].breadcrumb} className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-5 pt-6 text-sm text-muted-foreground">
    <Link to="/$lang" params={{ lang }} className="hover:text-primary">{tr.seo.home}</Link><span aria-hidden="true">/</span>
    {city && <><Link to="/$lang/fleet" params={{ lang }} className="hover:text-primary">{tr.nav.fleet}</Link><span aria-hidden="true">/</span></>}
    {city && /cars|category/.test(leaf.routeId) && <><Link to="/$lang/$city" params={{ lang, city: city.slug }} className="hover:text-primary">{city.name}</Link><span aria-hidden="true">/</span></>}
    <span aria-current="page">{label}</span>
  </nav>;
}
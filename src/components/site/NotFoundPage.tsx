import { Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { launchText } from "@/lib/launch";
import { t } from "@/lib/i18n";
import { useEffect } from "react";

export function NotFoundPage() {
  const path = useRouterState({ select: s => s.location.pathname });
  const lang = path.startsWith("/en/") ? "en" : path.startsWith("/es/") ? "es" : "pt";
  const ui = launchText[lang], tr = t(lang);
  useEffect(() => { document.title = `${ui.notFound} — Onic Car Rentals`; }, [ui.notFound]);
  return <div className="flex min-h-[75svh] flex-col items-center justify-center gap-6 bg-background px-5 py-16 text-center">
    <title>{`${ui.notFound} — Onic Car Rentals`}</title><meta name="description" content={ui.missing} /><meta property="og:title" content={`${ui.notFound} — Onic Car Rentals`} /><meta property="og:description" content={ui.missing} /><meta property="og:type" content="website" /><meta name="twitter:card" content="summary_large_image" /><meta name="robots" content="noindex, follow" />
    <Logo /><span className="font-display text-7xl text-primary">404</span>
    <h1 className="font-display text-3xl">{ui.notFound}</h1><p className="max-w-md text-muted-foreground">{ui.missing}</p>
    <nav className="flex flex-wrap justify-center gap-3">
      <Button asChild><Link to="/$lang" params={{ lang }}>{ui.home}</Link></Button>
      <Button asChild variant="outline"><Link to="/$lang/fleet" params={{ lang }}>{tr.nav.fleet}</Link></Button>
      <Button asChild variant="outline"><Link to="/$lang/search" params={{ lang }}>{tr.seo.searchTitle}</Link></Button>
    </nav>
  </div>;
}
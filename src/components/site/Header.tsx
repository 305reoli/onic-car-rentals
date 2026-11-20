import { Link, useLocation } from "@tanstack/react-router";
import { Phone, Menu } from "lucide-react";
import { useLang } from "@/hooks/use-lang";
import { CALL_PHONE, CALL_PHONE_DISPLAY, ownerText, LANGS, rememberLang } from "@/lib/i18n";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useBookingCities } from "@/hooks/use-cities";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { StickySearch } from "@/components/site/StickySearch";
import { Seal } from "@/components/brand/Seal";
import { internalPath, equivalentPath } from "@/lib/publicRoutes";
import { NavProgress } from "@/components/site/RoutePending";

export function TopBar() {
  const { tr } = useLang();
  return (
    <div className="bg-primary px-4 py-2 text-center text-xs font-medium text-primary-foreground">{tr.topbar}</div>
  );
}

function LangSwitcher({ className }: { className?: string }) {
  const { lang } = useLang();
  const { pathname } = useLocation();
  return (
    <div className={cn("flex items-center gap-1 text-xs font-semibold", className)} aria-label="Language">
      {LANGS.map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground">|</span>}
          <Link
            to={internalPath(equivalentPath(pathname, l))}
            search={true}
            onClick={() => rememberLang(l)}
            className={cn("cursor-pointer px-1 uppercase transition-colors", l === lang ? "text-primary" : "text-muted-foreground hover:text-foreground")}
            aria-current={l === lang}
          >
            {l}
          </Link>
        </span>
      ))}
    </div>
  );
}

export function Header() {
  const { lang, tr } = useLang();
  const cities = useBookingCities();
  const links = (
    <>
      <Link to="/$lang/fleet" params={{ lang }} className="hover:text-primary">{tr.nav.fleet}</Link>
      <Link to="/$lang/how-it-works" params={{ lang }} className="hover:text-primary">{tr.nav.how}</Link>
      <Link to="/$lang/faq" params={{ lang }} className="hover:text-primary">{tr.nav.faq}</Link>
      <Link to="/$lang/blog" params={{ lang }} className="hover:text-primary">{tr.nav.blog}</Link>
      {lang === "pt" && <Link to="/$lang/guides" params={{ lang: "pt" }} className="hover:text-primary">Guias</Link>}
      <Link to="/$lang/my-booking" params={{ lang }} className="hover:text-primary">{tr.nav.myBooking}</Link>
    </>
  );
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <NavProgress />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-5">
        <Link to="/$lang" params={{ lang }} className="flex items-center gap-2.5 font-display text-lg tracking-tight" aria-label="Onic Car Rentals">
          <Seal size={36} priority className="sm:hidden" />
          <Seal size={44} priority className="hidden sm:inline-block" />
          <span className="hidden min-[360px]:inline"><span className="text-primary">ONIC</span> <span className="text-muted-foreground">CAR RENTALS</span></span>
        </Link>
        <nav className="hidden items-center gap-4 text-sm text-muted-foreground xl:flex [&_a]:transition-colors">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex cursor-pointer items-center gap-1 hover:text-primary">{tr.nav.cities}<ChevronDown className="size-3" /></DropdownMenuTrigger>
            <DropdownMenuContent className="rounded-2xl">
              {cities.map((c) => (
                <DropdownMenuItem key={c.slug} asChild><Link to="/$lang/$city" params={{ lang, city: c.slug }}>{c.name}</Link></DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {links}
        </nav>
        <div className="flex items-center gap-3">
          <a href={`tel:${CALL_PHONE}`} aria-label={`${ownerText[lang].call} ${CALL_PHONE_DISPLAY}`} title={`${ownerText[lang].call} ${CALL_PHONE_DISPLAY}`} className="flex items-center gap-2 text-sm"><Phone className="size-4" /><span className="hidden 2xl:inline">{CALL_PHONE_DISPLAY}</span></a>
          <LangSwitcher />
          <Sheet>
            <SheetTrigger className="cursor-pointer xl:hidden" aria-label="Menu"><Menu className="size-6" /></SheetTrigger>
            <SheetContent side="right" className="bg-background">
              <SheetTitle className="font-display">ONIC CAR RENTALS</SheetTitle>
              <nav className="mt-8 flex flex-col gap-5 text-lg">
                {links}
                <a href={`tel:${CALL_PHONE}`} className="text-sm">{ownerText[lang].call} {CALL_PHONE_DISPLAY}</a>
                <div className="border-t border-border pt-5 text-sm text-muted-foreground">{tr.nav.cities}</div>
                {cities.map((c) => <Link key={c.slug} to="/$lang/$city" params={{ lang, city: c.slug }}>{c.name}</Link>)}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <StickySearch />
    </header>
  );
}

import { Link } from "@tanstack/react-router";
import { LockKeyhole, Phone } from "lucide-react";
import { Seal } from "@/components/brand/Seal";
import { useLang } from "@/hooks/use-lang";
import { CALL_PHONE, CALL_PHONE_DISPLAY, checkoutChromeText, ownerText } from "@/lib/i18n";

export function CheckoutHeader() {
  const { lang } = useLang();
  return <header className="border-b border-border bg-background" data-testid="checkout-header">
    <div className="mx-auto grid min-h-16 max-w-7xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:flex sm:justify-between">
      <Link to="/$lang" params={{ lang }} aria-label="Sua Locadora" className="flex shrink-0 items-center gap-2 text-sm font-semibold"><Seal size={36} priority /><span className="hidden sm:inline">Sua Locadora</span></Link>
      <span className="flex min-w-0 items-center justify-center gap-2 text-sm font-medium"><LockKeyhole className="size-4 shrink-0 text-muted-foreground" /><span>{checkoutChromeText[lang].secure}</span></span>
      <a href={`tel:${CALL_PHONE}`} aria-label={`${ownerText[lang].call} ${CALL_PHONE_DISPLAY}`} className="flex shrink-0 items-center gap-2 text-xs sm:text-sm"><Phone className="size-4 shrink-0" /><span className="hidden sm:inline">{CALL_PHONE_DISPLAY}</span></a>
    </div>
  </header>;
}

export function CheckoutFooter() {
  const { tr } = useLang();
  return <footer className="border-t border-border px-5 py-5 text-center text-xs text-muted-foreground" data-testid="checkout-footer">{tr.footer.operated} · {tr.footer.rights}</footer>;
}
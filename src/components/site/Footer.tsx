import { BUSINESS } from "@/lib/seo";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { settingsQuery } from "@/lib/queries";
import { useLang } from "@/hooks/use-lang";
import { CALL_PHONE, CALL_PHONE_DISPLAY, ownerText, waLink, waMessage, aeoUi } from "@/lib/i18n";
import { useCurrentWa } from "@/lib/waContext";
import { Seal } from "@/components/brand/Seal";

/** Operator line; ZIP and support email come from admin Company info and are omitted until filled. */
export function useCompany() {
  const { data } = useQuery(settingsQuery());
  const s = (data ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof s[k] === "string" ? (s[k] as string).trim() : "");
  return { zip: str("company_zip"), email: str("support_email"), settings: s, str };
}

export function Footer() {
  const { lang, tr } = useLang();
  const { email } = useCompany();
  const legalLine = [tr.footer.operated, BUSINESS.phoneDisplay, email, tr.footer.usd].filter(Boolean).join(" · ");
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3 font-display text-xl"><Seal size={40} className="-my-2" /><span><span className="text-primary">ONIC</span> <span className="text-muted-foreground">CAR RENTALS</span></span></div>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">Orlando · Miami · Fort Lauderdale · Tampa, Florida</p>
        </div>
        <nav className="flex flex-col gap-3 text-sm text-muted-foreground [&_a:hover]:text-primary">
          <Link to="/$lang/fleet" params={{ lang }}>{tr.nav.fleet}</Link>
          <Link to="/$lang/blog" params={{ lang }}>{tr.nav.blog}</Link>
          <Link to="/$lang/about" params={{ lang }}>{aeoUi[lang].about}</Link>
          <Link to="/$lang/reviews" params={{ lang }}>{aeoUi[lang].reviews}</Link>
          <Link to="/$lang/my-booking" params={{ lang }}>{tr.nav.myBooking}</Link>
          <Link to="/$lang/terms" params={{ lang }}>{tr.footer.terms}</Link>
          <Link to="/$lang/privacy" params={{ lang: "pt" }}>{tr.footer.privacyPolicy}</Link>
          <Link to="/$lang/cancellation" params={{ lang }}>{tr.footer.cancellation}</Link>
          <Link to="/$lang/legal" params={{ lang }} className="text-xs">{tr.footer.legal}</Link>
        </nav>
        <div className="flex flex-col gap-3 text-sm text-muted-foreground [&_a:hover]:text-primary">
          <a href={waLink(waMessage(lang, { kind: "general" }))} target="_blank" rel="noreferrer">WhatsApp +55 (65) 98404-6666</a>
          <a href={`tel:${CALL_PHONE}`}>{ownerText[lang].call} {CALL_PHONE_DISPLAY}</a>
          <p>{ownerText[lang].hours}</p>
          <a href="https://instagram.com/oniccarrentals" target="_blank" rel="noreferrer">Instagram @oniccarrentals</a>
        </div>
      </div>
      <div className="border-t border-border px-5 py-6 text-center text-xs text-muted-foreground"><p>{legalLine}</p><p className="mt-2">{tr.footer.rights}</p></div>
    </footer>
  );
}

export function WhatsAppFab() {
  const { lang } = useLang();
  const pageMessage = useCurrentWa();
  return (
    <a
      href={waLink(pageMessage ?? waMessage(lang, { kind: "general" }))}
      data-testid="wa-fab"
      target="_blank"
      rel="noreferrer"
      aria-label="WhatsApp"
      className="fixed bottom-24 right-5 z-50 flex size-14 items-center justify-center rounded-full bg-whatsapp text-whatsapp-foreground shadow-lg transition-transform hover:scale-105 md:bottom-6"
    >
      <svg viewBox="0 0 24 24" className="size-7" fill="currentColor" aria-hidden="true">
        <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.32l-.35-.2-3.56.93.95-3.47-.22-.36a9.4 9.4 0 0 1-1.44-5.01c0-5.2 4.23-9.43 9.44-9.43 2.52 0 4.89.98 6.67 2.77a9.37 9.37 0 0 1 2.76 6.67c0 5.2-4.24 9.43-9.44 9.43m8.03-17.46A11.27 11.27 0 0 0 12.05.72C5.8.72.7 5.8.7 12.07c0 2 .52 3.95 1.52 5.67L.6 23.65l6.04-1.58a11.33 11.33 0 0 0 5.41 1.38h.01c6.25 0 11.34-5.09 11.35-11.35 0-3.03-1.18-5.88-3.33-8.02" />
      </svg>
    </a>
  );
}

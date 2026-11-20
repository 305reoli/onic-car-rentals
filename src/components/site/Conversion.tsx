import { Link } from "@tanstack/react-router";
import { Star, Instagram, ShieldCheck, Check } from "lucide-react";
import { useLang } from "@/hooks/use-lang";
import { convText, fmt, resultsPriceText, t as dict } from "@/lib/i18n";
import { useGoogleReviews } from "@/components/site/Sections";
import { INSTAGRAM_PHOTOS, INSTAGRAM_POSTS } from "@/lib/instagramPhotos";
import { photoSrcSet, sizedPhoto } from "@/lib/vehicles";
import { cn } from "@/lib/utils";

export const INSTAGRAM_URL = "https://instagram.com/oniccarrentals";
const GOOGLE_LINK = "https://share.google/yY7cWYetSug8kS6P7";

/** Live Google rating summary (renders nothing until the live integration returns a rating). */
export function GoogleRatingBadge({ className }: { className?: string | undefined }) {
  const { lang } = useLang();
  const { data: g } = useGoogleReviews();
  if (!g?.connected || g.rating == null) return null;
  return (
    <a href={g.mapsUri ?? GOOGLE_LINK} target="_blank" rel="noreferrer" data-testid="google-rating" className={cn("inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary", className)}>
      <span className="flex text-primary" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={cn("size-3.5", i < Math.round(g.rating!) && "fill-current")} />)}</span>
      {fmt(convText[lang].rating, { r: g.rating.toFixed(1), n: g.total ?? 0 })}
    </a>
  );
}

const METHODS = ["Stripe", "Global Pays", "Pix", "Visa", "Mastercard", "Amex"];
/** Accepted payment methods (text badges — no third-party logos loaded). */
export function PaymentBadges({ className }: { className?: string | undefined }) {
  const { lang } = useLang();
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} data-testid="payment-badges">
      <span className="mr-1 flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 text-primary" />{convText[lang].secure}</span>
      {METHODS.map((m) => <span key={m} className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-semibold tracking-wide text-foreground">{m}</span>)}
    </div>
  );
}

/** One-line payment model for the car's category, consistent with the checkout payment step. */
export function PaymentLine({ mode, amount }: { mode: "full" | "signal" | string; amount: string }) {
  const { lang } = useLang();
  const t = convText[lang];
  const full = mode === "full";
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="payment-line" data-mode={full ? "full" : "signal"}>
      <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary-foreground">{full ? t.badgeFull : t.badgeRegular}</span>
      <span className="font-semibold">{full ? t.payFull : fmt(t.payRegular, { amt: amount })}</span>
    </p>
  );
}

/** Trust pill: every charge is itemized, so the quoted total is the amount charged. */
export function NoHiddenFeesBadge({ className }: { className?: string | undefined }) {
  const { lang } = useLang();
  return (
    <p className={cn("inline-flex items-center gap-1.5 self-start rounded-full border border-primary/35 bg-background/60 px-2.5 py-1 text-[11px] font-medium leading-snug text-muted-foreground", className)} data-testid="no-hidden-fees">
      <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
      {convText[lang].noHiddenFees}
    </p>
  );
}

/** Short summary of the real cancellation terms with a link to the full policy. */
export function ResultsPriceNote({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { lang } = useLang();
  if (compact) return <p className={cn("text-xs leading-relaxed text-muted-foreground", className)} data-testid="results-price-note">{convText[lang].totalNote} · {convText[lang].noHiddenFees}</p>;
  return <div className={cn("flex flex-col gap-2 text-xs text-muted-foreground", className)} data-testid="results-price-note"><p>{resultsPriceText[lang]}</p><NoHiddenFeesBadge /></div>;
}

/** Short summary of the real cancellation terms with a link to the full policy. */
export function CancellationSummary() {
  const { lang } = useLang();
  const t = convText[lang];
  return (
    <div className="rounded-2xl border border-border bg-background p-4 text-sm" data-testid="cancel-summary">
      <div className="mb-2 font-semibold">{t.cancelTitle}</div>
      <ul className="flex flex-col gap-1 text-muted-foreground">{t.cancel.map((x) => <li key={x}>• {x}</li>)}</ul>
      <Link to="/$lang/cancellation" params={{ lang }} target="_blank" className="mt-2 inline-block text-primary hover:underline">{t.cancelLink} →</Link>
    </div>
  );
}

/** Instagram social-proof strip (homepage + car pages): the 10 real @oniccarrentals photos, 4:5 tiles, each opening its own post. Lazy images, no embeds. */
export function InstagramStrip() {
  const { lang } = useLang();
  const t = convText[lang];
  const instaAlt = dict(lang).seo.instaAlt;
  const photos = INSTAGRAM_PHOTOS.map((src, i) => ({ src, href: INSTAGRAM_POSTS[i]!, alt: fmt(instaAlt, { n: i + 1 }) }));
  return (
    <section className="py-16" aria-labelledby="ig-title" data-testid="instagram-strip">
      <div className="mx-auto max-w-7xl px-5">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="ig-title" className="font-display text-3xl md:text-5xl"><a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="hover:text-primary">{t.igTitle}</a></h2><p className="mt-2 text-sm text-muted-foreground"><a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="font-semibold text-foreground hover:underline">@oniccarrentals</a> · {t.igSub}</p></div>
          <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"><Instagram className="size-4" />{t.igFollow}</a>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {photos.map((p, i) => (
            <a key={i} href={p.href} target="_blank" rel="noreferrer" aria-label={`@oniccarrentals — ${p.alt}`} className="group relative block aspect-[4/5] overflow-hidden rounded-xl">
              <img src={sizedPhoto(p.src, 480)} srcSet={photoSrcSet(p.src, [320, 480, 640])} sizes="(min-width: 768px) 20vw, 45vw" alt={p.alt} loading="lazy" decoding="async" width={480} height={600} className="size-full object-cover object-center transition-transform duration-500 group-hover:scale-105" />
              <span className="absolute inset-0 flex items-center justify-center bg-background/0 opacity-0 transition group-hover:bg-background/40 group-hover:opacity-100"><Instagram className="size-6" /></span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

import { conciergeText } from "@/lib/i18n";
import { deliveryLegText } from "@/lib/i18n";
import * as React from "react";
import { citiesQuery, settingsQuery, vehiclesQuery } from "@/lib/queries";
import { mainFaq, type FaqItem } from "@/lib/faqContent";
import { CityCoverImg } from "./CityCover";
import { Link } from "@tanstack/react-router";
import { Star, Instagram, Check, Play } from "lucide-react";
import { useLang } from "@/hooks/use-lang";
import { waLink, waMessage, aeoUi } from "@/lib/i18n";
import { useCities } from "@/hooks/use-cities";
import { cityDescription, photoUrl } from "@/lib/vehicles";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { fmt } from "@/lib/i18n";
import { getGoogleReviews } from "@/services/reviews.functions";

const GOOGLE_REVIEWS_LINK = "https://share.google/yY7cWYetSug8kS6P7";
export const googleReviewsQuery = () => ({ queryKey: ["google-reviews"], queryFn: () => getGoogleReviews(), staleTime: 30 * 60_000 });
export const useGoogleReviews = () => useQuery(googleReviewsQuery());
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Container = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`mx-auto max-w-7xl px-5 ${className}`}>{children}</div>
);

export function TrustRow() {
  const { tr } = useLang();
  const { data: g } = useGoogleReviews();
  const google = g?.connected && g.rating != null
    ? `★ ${g.rating.toFixed(1)} Google${g.total ? ` · ${fmt(tr.trust.reviewsN, { n: g.total })}` : ""}`
    : tr.trust.google;
  return (
    <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
      <a href={g?.mapsUri ?? GOOGLE_REVIEWS_LINK} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-primary"><Check className="size-4 text-primary" />{google}</a>
      {[tr.trust.tolls, tr.trust.airport, tr.trust.lang].map((x) => (
        <span key={x} className="flex items-center gap-2"><Check className="size-4 text-primary" />{x}</span>
      ))}
    </div>
  );
}

export function BrandStrip() {
  return (
    <div className="border-y border-border py-8">
      <Container className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
        {["Ferrari", "Lamborghini", "Rolls-Royce", "Mercedes-Benz", "Cadillac", "Tesla"].map((b) => (
          <span key={b} className="font-display text-lg uppercase tracking-widest text-muted-foreground/70">{b}</span>
        ))}
      </Container>
    </div>
  );
}

export function HowItWorks({ h1 = false }: { h1?: boolean }) {
  const { tr, lang } = useLang();
  const H = h1 ? "h1" : "h2";
  return (
    <section data-reveal className="py-20 md:py-28">
      <Container>
        <H className="font-display mb-12 text-3xl md:text-5xl">{tr.how.title}</H>
        {!h1 && <p className="-mt-8 mb-12 max-w-3xl text-muted-foreground">{tr.how.lead} <span data-testid="how-promise">{conciergeText[lang].howPromise}</span></p>}
        <div className="grid gap-6 md:grid-cols-4">
          {tr.how.steps.map(([title, text], i) => (
            <div key={title} className="surface p-6">
              <div className="font-display mb-6 text-4xl text-primary">0{i + 1}</div>
              <h3 className="font-display mb-2 text-lg">{title}</h3>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 border-t border-border pt-6">
          <h3 className="mb-2 font-semibold">{tr.how.usageTitle}</h3>
          <p className="max-w-5xl text-sm leading-relaxed text-muted-foreground">
            {tr.how.usageNote}{" "}
            <a href="https://oniccarrentals.com/english/faq.aspx" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">{tr.how.usageLink}</a>
          </p>
        </div>
      </Container>
    </section>
  );
}

export function CityCards() {
  const { lang, tr } = useLang();
  const cities = useCities().filter(c => c.slug === "orlando" || c.slug === "miami");
  const cards = cities.map((c) => ({ slug: c.slug, name: c.name, text: cityDescription(c, lang), img: photoUrl(c.hero_photo) }));
  return (
    <section data-reveal className="pb-20 md:pb-28">
      <Container className="grid gap-6 md:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.slug} to="/$lang/$city" params={{ lang, city: c.slug }} data-reveal className="surface lift group relative block aspect-[4/3] overflow-hidden md:aspect-[16/11]">
            <CityCoverImg slug={c.slug} lang={lang} fallback={c.img} fallbackAlt={c.name} />
            <div className="hero-overlay absolute inset-0" />
            <div className="absolute inset-x-0 bottom-0 p-7">
              <h3 className="font-display text-4xl md:text-5xl">{c.name}</h3><p className="mt-2 text-xs text-muted-foreground">{c.slug === "orlando" ? deliveryLegText[lang].tampa : deliveryLegText[lang].fll}</p>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">{c.text}</p>
              <span className="mt-4 inline-block text-sm font-semibold text-primary">{tr.cityCards.explore} →</span>
            </div>
          </Link>
        ))}
      </Container>
    </section>
  );
}

export function Concierge() {
  const { tr } = useLang();
  const { data: g } = useGoogleReviews();
  const stats = tr.concierge.stats
    .map(([n, l]) => (l === "Google" ? (g?.connected && g.rating != null ? [g.rating.toFixed(1), l] : null) : [n, l]))
    .filter((x): x is string[] => x !== null);
  return (
    <section data-reveal className="section-light py-20 md:py-28">
      <Container className="grid gap-12 md:grid-cols-2">
        <div>
          <div className="eyebrow mb-4">{tr.concierge.eyebrow}</div>
          <h2 className="font-display text-3xl md:text-5xl">{tr.concierge.title}</h2>
          <p className="mt-5 max-w-lg text-cream-muted">{tr.concierge.text}</p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {tr.concierge.perks.map((p) => (
              <li key={p} className="flex items-center gap-2 font-medium"><Check className="size-4" />{p}</li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {stats.map(([n, l]) => (
            <div key={l} className="rounded-[20px] border border-cream-foreground/10 p-6">
              <div className="font-display text-4xl md:text-5xl" data-count>{n}</div>
              <div className="mt-2 text-sm text-cream-muted">{l}</div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-label="Google">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function StarRow({ value, size = "size-4" }: { value: number; size?: string }) {
  return (
    <span className="flex gap-0.5 text-primary" aria-label={`${value.toFixed(1)} / 5`}>
      {Array.from({ length: 5 }).map((_, j) => <Star key={j} aria-hidden="true" className={`${size} ${j < Math.round(value) ? "fill-current" : "opacity-30"}`} />)}
    </span>
  );
}

function Avatar({ name, photo }: { name: string; photo: string | null }) {
  const [broken, setBroken] = React.useState(false);
  if (photo && !broken) return <img src={photo} alt="" aria-hidden="true" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} className="size-11 shrink-0 rounded-full border border-border object-cover" />;
  return <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-secondary font-display text-lg text-foreground">{(name.trim()[0] ?? "G").toUpperCase()}</span>;
}

export function Reviews({ page = false }: { page?: boolean }) {
  const { tr, lang } = useLang();
  const { data: g } = useGoogleReviews();
  // Live reviews are never edited; on highlighted spots (not the full reviews page) skip the one containing the "Very god" typo.
  const reviews = g?.connected ? g.reviews.filter((r) => r.text && (page || !/\bvery god\b/i.test(r.text))).slice(0, 6) : [];
  const link = g?.mapsUri ?? GOOGLE_REVIEWS_LINK;
  const live = g?.connected && g.rating != null;
  const Heading = page ? "h1" : "h2";
  return (
    <section data-reveal className="py-20 md:py-28">
      <Container>
        <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <Heading className="font-display text-3xl md:text-5xl">{page ? aeoUi[lang].reviews : tr.reviews.title}</Heading>
            {live && (
              <a href={link} target="_blank" rel="noreferrer" className="surface mt-5 inline-flex items-center gap-4 px-5 py-3 transition-colors hover:border-primary/50">
                <span className="grid size-10 place-items-center rounded-full bg-foreground"><GoogleG /></span>
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <span className="font-display text-2xl leading-none text-foreground">{g?.rating?.toFixed(1)}</span>
                    <StarRow value={g?.rating ?? 0} />
                  </span>
                  {g?.total != null && <span className="text-xs text-muted-foreground">{fmt(tr.reviews.onGoogle, { n: g.total })}</span>}
                </span>
              </a>
            )}
          </div>
          {reviews.length > 0 && <a href={link} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary hover:text-primary-hover">{tr.reviews.seeAll} →</a>}
        </div>
        {reviews.length > 0 ? (
          <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 md:mx-0 md:grid md:grid-cols-2 md:gap-6 md:overflow-visible md:px-0 lg:grid-cols-3">
            {reviews.map((r, i) => (
              <figure key={i} className="surface flex w-[85%] shrink-0 snap-start flex-col p-6 md:w-auto">
                <figcaption className="flex items-center gap-3">
                  <Avatar name={r.author} photo={r.photoUri} />
                  <div className="min-w-0 flex-1">
                    {r.authorUri ? <a href={r.authorUri} target="_blank" rel="noreferrer" className="block truncate font-semibold hover:text-primary">{r.author}</a> : <span className="block truncate font-semibold">{r.author}</span>}
                    <div className="mt-1 flex items-center gap-2">
                      <StarRow value={r.rating} size="size-3.5" />
                      <span className="text-xs text-muted-foreground">{r.relativeTime}</span>
                    </div>
                  </div>
                </figcaption>
                <blockquote className="mt-4 line-clamp-6 flex-1 text-sm leading-relaxed text-muted-foreground">{r.text}</blockquote>
                <a href={r.reviewUri ?? link} target="_blank" rel="noreferrer" className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground hover:text-foreground">
                  <span className="grid size-6 place-items-center rounded-full bg-foreground [&_svg]:size-4"><GoogleG /></span>
                  {tr.reviews.posted} <span className="font-semibold text-foreground">Google</span>
                </a>
              </figure>
            ))}
          </div>
        ) : (
          <Button asChild size="lg" variant="outline"><a href={link} target="_blank" rel="noreferrer"><Star />{tr.reviews.seeAllBtn}</a></Button>
        )}
        {!page && <p className="mt-6"><Link to="/$lang/reviews" params={{ lang }} className="text-sm text-primary hover:underline">{aeoUi[lang].moreReviews} →</Link></p>}
      </Container>
    </section>
  );
}

export function InstagramReels() {
  const { tr } = useLang();
  return (
    <section data-reveal className="pb-20 md:pb-28">
      <Container>
        <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="eyebrow mb-3">@oniccarrentals</div>
            <h2 className="font-display text-3xl md:text-5xl">{tr.insta.title}</h2>
          </div>
          <Button asChild variant="outline"><a href="https://instagram.com/oniccarrentals" target="_blank" rel="noreferrer"><Instagram />{tr.insta.follow}</a></Button>
        </div>
        <div className="no-scrollbar -mx-5 flex gap-4 overflow-x-auto px-5 md:mx-0 md:grid md:grid-cols-6 md:px-0">
          {["/images/car-urus.jpg", "/images/car-cullinan.jpg", "/images/car-purosangue.jpg", "/images/car-g63.jpg", "/images/car-escalade.jpg", "/images/city-miami.jpg"].map((src, i) => (
            <a key={i} href="https://instagram.com/oniccarrentals" target="_blank" rel="noreferrer" className="surface relative block aspect-[9/16] w-40 shrink-0 overflow-hidden md:w-auto">
              <img src={src} alt={fmt(tr.seo.instaAlt, { n: i + 1 })} loading="lazy" className="size-full object-cover opacity-70" />
              <Play className="absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 fill-current" />
            </a>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** Short-question accordion; answers are the exact strings used in the FAQPage JSON-LD and llms text. */
export function FaqList({ items, defaultOpen }: { items: FaqItem[]; defaultOpen?: string | undefined }) {
  return (
    <Accordion type="single" collapsible defaultValue={defaultOpen ?? ""}>
      {items.map((it) => (
        <AccordionItem key={it.q} value={it.q} className="border-border">
          <AccordionTrigger className="py-5 text-base hover:no-underline">{it.q}</AccordionTrigger>
          <AccordionContent forceMount className="whitespace-pre-line text-muted-foreground data-[state=closed]:hidden">
            {it.a}{it.href && <> <a href={it.href} aria-label={it.q} className="text-primary hover:underline">→</a></>}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function Faq({ h1 = false }: { h1?: boolean }) {
  const H = h1 ? "h1" : "h2";
  const { lang, tr } = useLang();
  const { data: st } = useQuery(settingsQuery());
  const { data: cities = [] } = useQuery(citiesQuery());
  const { data: cars = [] } = useQuery(vehiclesQuery());
  const f = mainFaq(lang, st as never, cities, cars);
  return (
    <section data-reveal className="py-20 md:py-28">
      <Container className="max-w-3xl">
        <H className="font-display mb-10 text-3xl md:text-5xl">{tr.faq.title}</H>
        <FaqList items={f.general} />
        <h3 id="delivery" className="font-display mb-4 mt-12 scroll-mt-28 text-2xl md:text-3xl">{tr.delivery.faqGroup}</h3>
        <FaqList items={f.delivery} defaultOpen={f.delivery[0]?.q} />
      </Container>
    </section>
  );
}

export function About() {
  const { tr } = useLang();
  return (
    <section data-reveal className="py-16 md:py-24" aria-labelledby="about-title">
      <Container className="max-w-3xl">
        <h2 id="about-title" className="font-display mb-6 text-3xl md:text-5xl">{tr.seo.aboutTitle}</h2>
        {tr.seo.about.map((p) => <p key={p.slice(0, 20)} className="mb-4 text-muted-foreground md:text-lg">{p}</p>)}
      </Container>
    </section>
  );
}

export function FinalCta() {
  const { lang, tr } = useLang();
  return (
    <section data-reveal className="pb-20 md:pb-28">
      <Container>
        <div className="surface flex flex-col items-center gap-6 px-6 py-16 text-center">
          <h2 className="font-display text-4xl md:text-6xl">{tr.cta.title}</h2>
          <p className="max-w-lg text-muted-foreground">{tr.cta.sub}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg"><Link to="/$lang/fleet" params={{ lang }}>{tr.cta.book}</Link></Button>
            <Button asChild size="lg" variant="whatsapp"><a href={waLink(tr.wa.general)} target="_blank" rel="noreferrer">{tr.cta.whatsapp}</a></Button>
          </div>
        </div>
      </Container>
    </section>
  );
}

/** Cities without cars yet: friendly WhatsApp prompt instead of an empty grid. */
export function EmptyCity({ cityName }: { cityName: string }) {
  const { lang, tr } = useLang();
  return (
    <div className="surface flex flex-col items-center gap-5 px-6 py-14 text-center">
      <p className="max-w-lg text-lg">{tr.fleet.emptyCity}</p>
      <Button asChild size="lg" variant="whatsapp"><a href={waLink(waMessage(lang, { kind: "results", city: cityName }))} target="_blank" rel="noreferrer">{tr.cta.whatsapp}</a></Button>
    </div>
  );
}

export function PageError({ error }: { error: unknown }) {
  return <Container className="py-24 text-center text-muted-foreground">{error instanceof Error ? error.message : "Error"}</Container>;
}

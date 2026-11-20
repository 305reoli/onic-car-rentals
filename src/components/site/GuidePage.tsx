import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Container, FaqList } from "./Sections";
import { guideCopy, guideUi } from "@/lib/i18n.guides";
import { fmt } from "@/lib/i18n";
import { internalPath, publicPath } from "@/lib/publicRoutes";
import { guidePath, type GuideData } from "@/lib/guides";
import { photoSrcSet, sizedPhoto, type Vehicle } from "@/lib/vehicles";

export function GuideIndex({ cars }: { cars: Vehicle[] }) {
  return <Container className="py-12 md:py-16">
    <nav aria-label="Breadcrumb" className="mb-8 text-sm text-muted-foreground"><Link to="/$lang" params={{ lang: "pt" }}>Início</Link> / Guias</nav>
    <header className="mb-12 max-w-3xl"><p className="eyebrow mb-3">{guideUi.eyebrow}</p><h1 className="font-display text-4xl md:text-5xl">{guideUi.title}</h1><p className="mt-5 text-muted-foreground">{guideUi.intro}</p></header>
    <div className="grid gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
      {guideCopy.map((g, i) => { const car = cars.filter((v) => v.city === (i === 5 ? "miami" : "orlando") && v.body_category === "exotics")[i % 3]; const photo = car?.photos[0]; return <article key={g.slug} className="border-b border-border pb-7">
        <Link to="/$lang/guides/$slug" params={{ lang: "pt", slug: g.slug }} className="group block">
          {photo && <img src={sizedPhoto(photo, 640)} srcSet={photoSrcSet(photo, [320, 640, 960])} sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" width={1200} height={800} loading="lazy" alt="" className="mb-5 aspect-[3/2] w-full rounded-lg object-cover" />}
          <p className="mb-3 text-xs text-muted-foreground">0{i + 1} / Guias</p><h2 className="font-display text-2xl group-hover:text-primary">{g.title}</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{g.meta}</p><span className="mt-5 inline-flex items-center gap-2 text-sm text-primary">{guideUi.read}<ArrowUpRight className="size-4" /></span>
        </Link>
      </article>; })}
    </div>
  </Container>;
}
export function GuidePage({ guide: g }: { guide: GuideData }) {
  return <Container className="py-10 md:py-14">
    <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap gap-2 text-sm text-muted-foreground"><Link to="/$lang" params={{ lang: "pt" }}>Início</Link><span>/</span><Link to="/$lang/guides" params={{ lang: "pt" }}>Guias</Link><span>/</span><span>{g.title}</span></nav>
    <article data-testid="guide-content" className="max-w-4xl">
      <header className="mb-12"><p className="eyebrow mb-3">{guideUi.eyebrow}</p><h1 className="font-display text-4xl md:text-5xl">{g.title}</h1><p data-testid="guide-answer" className="mt-6 border-l-2 border-primary pl-5 text-lg leading-relaxed">{g.answer}</p></header>
      <ol className="space-y-10">
        {g.sections.map((s, i) => <li key={s.title} className="border-t border-border pt-7"><h2 className="font-display mb-4 flex gap-3 text-2xl md:text-3xl"><span className="text-primary">{i + 1}.</span>{s.title}</h2><div className="space-y-4 leading-relaxed text-muted-foreground">{s.paragraphs.map((p) => <p key={p}>{p}</p>)}</div>
          {(s.fact === "prices" || s.fact === "comparison") && g.priceRows.length > 0 && <div className="mt-6 overflow-x-auto"><table data-testid="guide-prices" className="w-full text-left text-sm"><caption className="mb-4 text-left font-display text-xl text-foreground">{guideUi.models}</caption><thead className="border-b border-border text-muted-foreground"><tr><th className="py-3 pr-5">{guideUi.model}</th><th className="py-3 pr-5">{guideUi.city}</th><th className="py-3">{guideUi.daily}</th></tr></thead><tbody>{g.priceRows.map((r) => <tr key={r.path} className="border-b border-border"><td className="py-4 pr-5"><Link to={internalPath(publicPath("pt", r.path))} className="text-primary underline-offset-4 hover:underline">{r.label}</Link></td><td className="py-4 pr-5 capitalize">{r.city}</td><td className="whitespace-nowrap py-4">{fmt(guideUi.from, { price: r.price })}</td></tr>)}</tbody></table><p className="mt-4 text-xs text-muted-foreground">{guideUi.sourceNote}</p></div>}
          {s.fact === "comparison" && <div className="mt-7 space-y-5">{g.counts.map((r) => <div key={r.path}><h3 className="font-display text-xl"><Link to={internalPath(publicPath("pt", r.path))}>{r.city} · {r.category} · {r.count} unidades</Link></h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.models}</p></div>)}</div>}
        </li>)}
      </ol>
      <p className="mt-10 border-t border-border pt-7 leading-relaxed text-muted-foreground">{g.closing}</p>
      <section className="mt-12" data-testid="guide-faq"><h2 className="font-display mb-4 text-3xl">{guideUi.faq}</h2><FaqList items={g.faq} /></section>
      <section className="mt-12 border-t border-border pt-7"><h2 className="font-display mb-5 text-2xl">{guideUi.related}</h2><div className="flex flex-wrap gap-x-6 gap-y-3">{g.links.map((l) => <Link key={l.path} to={internalPath(publicPath("pt", l.path))} className="text-sm text-primary underline-offset-4 hover:underline">{l.label}<ArrowUpRight className="ml-1 inline size-3" /></Link>)}</div><Link to={internalPath(guidePath())} className="mt-7 inline-block text-sm text-muted-foreground">← Guias</Link></section>
    </article>
  </Container>;
}

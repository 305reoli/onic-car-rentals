import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowUpRight, ArrowLeft } from "lucide-react";
import { Container } from "./Sections";
import { Button } from "@/components/ui/button";
import { blogUi, t, waLink, type Lang } from "@/lib/i18n";
import { newestPosts, type BlogPost } from "@/data/blog";
import { blogCover, blogDate, blogLinks } from "@/lib/blog";
import { internalPath, publicPath } from "@/lib/publicRoutes";
import { photoSrcSet, sizedPhoto, type Vehicle } from "@/lib/vehicles";

export function BlogIndex({ lang, cars }: { lang: Lang; cars: Vehicle[] }) {
  const [category, setCategory] = useState("all"), ui = blogUi[lang];
  return <Container className="py-10 md:py-14">
    <nav aria-label="Breadcrumb" className="mb-8 text-sm text-muted-foreground"><Link to="/$lang" params={{ lang }}>{t(lang).seo.home}</Link> / {ui.title}</nav>
    <header className="mb-10 max-w-3xl"><p className="eyebrow mb-4">{ui.eyebrow}</p><h1 className="font-display text-4xl md:text-5xl">{ui.title}</h1><p className="mt-5 text-lg leading-relaxed text-muted-foreground">{ui.intro}</p></header>
    <div aria-label={ui.filter} className="mb-10 flex flex-wrap gap-2 border-y border-border py-4">{["all", ...Object.keys(ui.categories)].map(key => <Button key={key} variant={category === key ? "default" : "ghost"} size="sm" aria-pressed={category === key} onClick={() => setCategory(key)}>{key === "all" ? ui.all : ui.categories[key as "news"]}</Button>)}</div>
    <div data-testid="blog-posts" className="grid gap-x-8 gap-y-12 md:grid-cols-2">{newestPosts().filter(p => category === "all" || p.category === category).map(post => {
      const copy = post.translations[lang], photo = blogCover(post, cars);
      return <article key={post.slug} className="min-w-0 border-b border-border pb-8"><Link to="/$lang/blog/$slug" params={{ lang, slug: post.slug }} className="group block">
        {photo && <img src={sizedPhoto(photo, 828)} srcSet={photoSrcSet(photo, [480, 828, 1200])} sizes="(min-width: 768px) 45vw, 100vw" width={1200} height={800} loading="lazy" alt={copy.title} className="aspect-[3/2] w-full rounded-lg object-cover" />}
        <div className="mb-3 mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><span className="text-primary">{ui.categories[post.category]}</span><time dateTime={post.date}>{blogDate(post.date, lang)}</time></div>
        <h2 className="font-display break-words text-2xl leading-snug group-hover:text-primary">{copy.title}</h2><p className="mt-4 text-sm leading-relaxed text-muted-foreground">{copy.excerpt}</p><span className="mt-5 inline-flex items-center gap-2 text-sm text-primary">{ui.read}<ArrowUpRight className="size-4" /></span>
      </Link></article>;
    })}</div>
  </Container>;
}
export function BlogArticle({ lang, post, cars }: { lang: Lang; post: BlogPost; cars: Vehicle[] }) {
  const ui = blogUi[lang], copy = post.translations[lang], photo = blogCover(post, cars), links = blogLinks(post, cars, lang);
  // Each inline link is used once per article, at its last occurrence (the closing CTA paragraph); longer phrases win overlaps.
  const phrases = [...(post.inlineLinks ?? [])].sort((x, y) => y.phrase[lang].length - x.phrase[lang].length);
  const rx = phrases.length ? new RegExp(phrases.map(l => l.phrase[lang].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g") : null;
  const assigned = new Map<string, Set<number>>();
  if (rx) {
    const paragraphs = copy.sections.flatMap(s => s.paragraphs), used = new Set<string>();
    for (let i = paragraphs.length - 1; i >= 0; i--) {
      const p = paragraphs[i]!;
      for (const m of p.matchAll(rx)) { if (used.has(m[0])) continue; used.add(m[0]); if (!assigned.has(p)) assigned.set(p, new Set()); assigned.get(p)!.add(m.index); }
    }
  }
  const linkify = (text: string) => {
    const at = assigned.get(text);
    if (!rx || !at) return text;
    const out: ReactNode[] = []; let last = 0;
    for (const m of text.matchAll(rx)) {
      if (!at.has(m.index)) continue;
      const hit = phrases.find(l => l.phrase[lang] === m[0])!;
      out.push(text.slice(last, m.index), <Link key={m.index} to={internalPath(publicPath(lang, hit.path ?? `blog/${hit.slug}`))} className="text-primary underline underline-offset-4">{m[0]}</Link>);
      last = m.index + m[0].length;
    }
    out.push(text.slice(last));
    return <>{out}</>;
  };
  return <Container className="py-10 md:py-14">
    <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap gap-2 text-sm text-muted-foreground"><Link to="/$lang" params={{ lang }}>{t(lang).seo.home}</Link><span>/</span><Link to="/$lang/blog" params={{ lang }}>{ui.title}</Link></nav>
    <article data-testid="blog-article" className="mx-auto max-w-4xl">
      <header><p className="eyebrow mb-4">{ui.categories[post.category]}</p><h1 className="font-display break-words text-3xl leading-tight md:text-5xl">{copy.title}</h1><div className="mt-6 flex flex-wrap gap-4 text-sm text-muted-foreground"><span>{ui.author} Onic Car Rentals</span><time dateTime={post.date}>{blogDate(post.date, lang)}</time></div><p data-testid="blog-intro" className="my-8 text-lg leading-relaxed">{copy.intro}</p></header>
      {photo && <img src={sizedPhoto(photo, 1200)} srcSet={photoSrcSet(photo, [480, 828, 1200, 1600])} sizes="(min-width: 1024px) 896px, 100vw" width={1200} height={800} alt={copy.title} fetchPriority="high" className="mb-12 aspect-[3/2] w-full rounded-lg object-cover" />}
      <div className="mx-auto max-w-3xl space-y-10">{copy.sections.map(s => <section key={s.title}><h2 className="font-display mb-4 text-2xl leading-snug md:text-3xl">{s.title}</h2><div className="space-y-4 leading-relaxed text-muted-foreground">{s.paragraphs.map(p => <p key={p}>{linkify(p)}</p>)}</div></section>)}</div>
      <section className="mt-12 border-t border-border pt-8"><h2 className="font-display mb-5 text-2xl">{ui.related}</h2><div data-testid="blog-related" className="grid gap-4 sm:grid-cols-2">{links.map(l => <Link key={`${l.lang}/${l.path}`} to={internalPath(publicPath(l.lang, l.path))} className="text-sm text-primary underline-offset-4 hover:underline">{l.label}<ArrowUpRight className="ml-1 inline size-3" /></Link>)}</div></section>
      <section className="mt-12 border-y border-border py-8"><h2 className="font-display mb-4 text-2xl">{ui.cta}</h2><p className="max-w-3xl leading-relaxed text-muted-foreground">{copy.cta}</p><div className="mt-6 flex flex-wrap gap-3"><Button asChild><Link to="/$lang/fleet" params={{ lang }}>{ui.fleet}<ArrowUpRight className="size-4" /></Link></Button><Button asChild variant="outline"><a href={waLink(t(lang).wa.general)} target="_blank" rel="noreferrer">{ui.whatsapp}<ArrowUpRight className="size-4" /></a></Button></div></section>
      <p data-testid="blog-sources" className="mt-8 text-sm leading-relaxed text-muted-foreground">{ui.sources}: {post.sources.map((s, i) => <span key={s.name}>{i > 0 && " · "}{s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">{s.name}</a> : s.name}</span>)}</p>
      <Link to="/$lang/blog" params={{ lang }} className="mt-8 inline-flex items-center gap-2 text-sm text-primary"><ArrowLeft className="size-4" />{ui.back}</Link>
    </article>
  </Container>;
}
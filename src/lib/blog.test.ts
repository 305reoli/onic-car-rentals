import { describe, it, expect } from "vitest";
import { blogPosts } from "@/data/blog";
import { equivalentPath, internalPath, publicPath } from "./publicRoutes";
describe("Blog public routing", () => {
  it.each(["pt", "en", "es"] as const)("keeps blog at the requested %s path", lang => {
    expect(publicPath(lang, "blog")).toBe(lang === "pt" ? "/blog" : `/${lang}/blog`);
    for (const post of blogPosts) {
      const path = publicPath(lang, `blog/${post.slug}`);
      expect(path).toBe(`${lang === "pt" ? "" : `/${lang}`}/blog/${post.slug}`);
      expect(internalPath(path)).toBe(`/${lang}/blog/${post.slug}`);
      expect(equivalentPath(path, "pt")).toBe(`/blog/${post.slug}`);
    }
  });
  it("uses the owner-specified publication dates", () => {
    expect(blogPosts).toHaveLength(6);
    const dates: Record<string, string> = { "porsche-mission-s-conceito-superesportivo": "2026-11-17", "brabus-800-porsche-911-turbo-s": "2026-11-10" };
    for (const p of blogPosts) expect(p.date).toBe(dates[p.slug] ?? "2026-11-07");
  });
  it("Brabus post links the Carrera article in every language and never claims inclusions", () => {
    const p = blogPosts.find(x => x.slug === "brabus-800-porsche-911-turbo-s")!;
    const link = p.inlineLinks![0]!;
    expect(link.slug).toBe("porsche-911-carrera-conversivel-aluguel-miami");
    for (const l of ["pt", "en", "es"] as const) {
      const text = p.translations[l].sections.flatMap(s => s.paragraphs).join(" ");
      expect(text).toContain(link.phrase[l]);
      // Every mention of "included" must sit inside a negation: nothing may be claimed as included.
      for (const m of text.matchAll(/inclu[ií]dos?\b|included\b/gi)) {
        expect(text.slice(Math.max(0, m.index - 60), m.index)).toMatch(/\b(sem|without|sin)\s/i);
      }
    }
    expect(p.sources.map(s => s.name)).toEqual(["Brabus (via The Supercar Blog, 9 Nov 2026)", "PistonHeads, 9 Nov 2026", "CompleteCar.ie, 10 Nov 2026"]);
  });
  it("Brabus post closes by stating tolls, insurance and delivery are not in the daily rate", () => {
    const p = blogPosts.find(x => x.slug === "brabus-800-porsche-911-turbo-s")!;
    const last = (l: "pt" | "en" | "es") => p.translations[l].sections.at(-1)!.paragraphs.join(" ");
    expect(last("pt")).toContain("os custos aplicáveis aparecem discriminados no resumo, sem que pedágio, seguro ou entrega estejam incluídos na diária.");
    expect(last("en")).toContain("with the applicable costs itemized in the summary, without tolls, insurance or delivery being included in the daily rate.");
    expect(last("es")).toContain("con los costos aplicables desglosados en el resumen, sin que peajes, seguro o entrega estén incluidos en la tarifa diaria.");
  });
});
describe("Brabus 800 cover", () => {
  it("uses the dedicated Brabus 800 photo, not a fleet Carrera S, in every language", async () => {
    const { blogPosts } = await import("@/data/blog");
    const { blogCover } = await import("./blog");
    const post = blogPosts.find(p => p.slug === "brabus-800-porsche-911-turbo-s")!;
    const fleet = [{ active: true, city: "miami", name: "Porsche 911 Carrera S", photos: ["/__l5e/assets-v1/fleet/carrera.jpg"] }] as never;
    const cover = blogCover(post, fleet);
    expect(cover).toMatch(/\/__l5e\/assets-v1\/05ced2df-0abd-4588-867d-522d78325cfe\/brabus-800-porsche-911-turbo-s\.jpg$/);
    expect(cover).not.toContain("carrera");
  });
});
describe("Porsche Mission S post", () => {
  const p = blogPosts[0]!;
  it("is the newest post with its own Mission S cover and owner sources", async () => {
    const { newestPosts } = await import("@/data/blog");
    expect(p.slug).toBe("porsche-mission-s-conceito-superesportivo");
    expect(newestPosts()[0]!.slug).toBe(p.slug);
    expect(p.coverImage).toMatch(/\/porsche-mission-s-conceito-superesportivo\.jpg$/);
    expect(p.sources.map(s => s.name)).toEqual(["Porsche Newsroom (anúncio oficial do Museu Porsche / Icons of Porsche, nov 2026)", "tbreak, 12 nov 2026", "The Cornea Impression, 11 nov 2026 (atualizado 17 nov 2026)"]);
    expect(p.description!.pt).toContain("Revelado em Nova York em 15 de outubro de 2026");
  });
  it("closing paragraph contains every inline link phrase in all languages", () => {
    for (const l of ["pt", "en", "es"] as const) {
      const last = p.translations[l].sections.at(-1)!.paragraphs.at(-1)!;
      for (const link of p.inlineLinks!) expect(last).toContain(link.phrase[l]);
      expect(publicPath(l, "brand-hub/miami/porsche")).toMatch(/porsche/);
    }
  });
});

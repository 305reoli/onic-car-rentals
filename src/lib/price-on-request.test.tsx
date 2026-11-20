import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { PriceOnRequestPanel, PricelessWhatsApp } from "@/components/site/PriceOnRequest";
import { hasDailyPrice } from "./vehicles";
import { t } from "./i18n";

const src = (p: string) => readFileSync(p, "utf8");

describe("price-on-request cars", () => {
  it("null, undefined, blank, 0 and negative count as no price; positive prices stay bookable", () => {
    for (const p of [null, undefined, "", 0, -5]) expect(hasDailyPrice({ daily_price_usd: p as never })).toBe(false);
    expect(hasDailyPrice({ daily_price_usd: 55 })).toBe(true);
    expect(hasDailyPrice({ daily_price_usd: "99" })).toBe(true);
  });
  for (const lang of ["en", "pt", "es"] as const) {
    it(`${lang}: panel shows Price on request + WhatsApp with car and city, never $0`, () => {
      const html = renderToStaticMarkup(<PriceOnRequestPanel lang={lang} car="Ferrari Roma" city="Miami" />);
      expect(html).toContain(t(lang).fleet.priceOnRequest);
      expect(html).toContain("wa.me/5565984046666");
      const href = decodeURIComponent(/href="([^"]+)"/.exec(html)![1]!.replace(/&amp;/g, "&"));
      expect(href).toContain("Ferrari Roma");
      expect(href).toContain("Miami");
      expect(html).not.toMatch(/\$0|US\$ ?0\b|free|grátis|gratis/i);
      const card = renderToStaticMarkup(<PricelessWhatsApp lang={lang} car="Ferrari Roma" city="Miami" size="sm" />);
      expect(card).toContain(t(lang).cta.whatsapp);
      expect(card).not.toMatch(/\$0/);
    });
  }
  it("fleet card swaps Book for WhatsApp and skips dated totals when priceless", () => {
    const s = src("src/components/site/CarCard.tsx");
    expect(s).toMatch(/!hasDailyPrice\(v\)\s*\?\s*<PricelessWhatsApp/);
    expect(s).toContain("!short && hasDailyPrice(v) ? datedTotal");
  });
  it("car page hides booking widget, availability and mobile Book bar when priceless", () => {
    const s = src("src/routes/$lang.cars.$city.$slug.tsx");
    expect(s).toContain("{priceless ? <PriceOnRequestPanel");
    expect(s).toContain("{!priceless && <section className=\"mt-0\" data-testid=\"car-availability\">");
    expect(s).toContain("if (priceless) return;");
  });
  it("checkout route and server booking both refuse priceless cars", () => {
    const c = src("src/routes/$lang.checkout.$city.$slug.tsx");
    expect(c.indexOf("if (priceless) return")).toBeLessThan(c.indexOf("return <Checkout />"));
    expect(c).toContain("if (!hasDailyPrice(v)) return { unavailable: false, priceless: true");
    expect(src("src/services/booking-core.server.ts")).toContain('throw new Error("PRICE_ON_REQUEST")');
  });
});

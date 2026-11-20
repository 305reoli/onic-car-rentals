import { describe, expect, it } from "vitest";
import { deliveryLegPrice, DEFAULT_DELIVERY } from "./pricing";
import { previewLegFee, previewLegs, type OptionPrices } from "./deliveryPreview";

// Fees come from the shared defaults (settings.delivery_config.fixed_delivery / standard), never literals invented here.
const cfg = DEFAULT_DELIVERY;
const orlandoSuv = { city: "orlando", body_category: "suv" };
const orlandoExotic = { city: "orlando", body_category: "exotics" };
const fee = (v: typeof orlandoSuv, city: string, type: "pickup" | "airport" | "address", dir: "pickup" | "return" = "pickup", miles: number | null = null) => deliveryLegPrice(v, { city, type }, dir, miles, null).fee;

describe("Per-leg delivery fees — Orlando regular car", () => {
  it("own base pickup is free", () => expect(fee(orlandoSuv, "orlando", "pickup")).toBe(0));
  it("MCO airport uses the configured airport fee ($40)", () => expect(fee(orlandoSuv, "orlando", "airport")).toBe(cfg.fixed_delivery.regular.ownCityAddress));
  it("Tampa (served city) uses the served-city fee per leg ($100)", () => { expect(fee(orlandoSuv, "tampa", "airport")).toBe(cfg.fixed_delivery.regular.servedCity); expect(fee(orlandoSuv, "tampa", "address", "return")).toBe(100); });
  it("Miami (other base) uses the inter-city fee per leg ($180)", () => { expect(fee(orlandoSuv, "miami", "pickup")).toBe(cfg.fixed_delivery.regular.otherBase); expect(fee(orlandoSuv, "miami", "airport", "return")).toBe(180); });
  it("typed address exactly 25 miles away gets the own-city address fee ($40)", () => expect(fee(orlandoSuv, "orlando", "address", "pickup", 25)).toBe(cfg.fixed_delivery.regular.ownCityAddress));
  it("typed address just over 25 miles waits for owner confirmation (no price)", () => expect(deliveryLegPrice(orlandoSuv, { city: "orlando", type: "address" }, "pickup", 25.1, null)).toMatchObject({ status: "quote_pending", fee: null }));
  it("one-way: MCO pickup + Miami return are priced separately", () => expect([fee(orlandoSuv, "orlando", "airport"), fee(orlandoSuv, "miami", "pickup", "return")]).toEqual([40, 180]));
});

describe("Exotics — own city only, fixed per-leg fee", () => {
  it("own-city address within 25 miles is the fixed exotic fee ($120)", () => { expect(fee(orlandoExotic, "orlando", "address", "pickup", 3)).toBe(cfg.fixed_delivery.exotic.ownCityAddress); expect(fee(orlandoExotic, "orlando", "address", "return", 25)).toBe(120); });
  it("own-city address beyond 25 miles is not priced (we confirm)", () => { expect(fee(orlandoExotic, "orlando", "address", "pickup", 25.5)).toBeNull(); expect(fee(orlandoExotic, "orlando", "address", "return", 62)).toBeNull(); expect(fee(orlandoExotic, "orlando", "address", "pickup", null)).toBeNull(); });
  it("own base pickup is free", () => expect(fee(orlandoExotic, "orlando", "pickup")).toBe(0));
  it("never delivered to another city", () => { expect(() => fee(orlandoExotic, "tampa", "address")).toThrow("PICKUP_ONLY"); expect(() => fee(orlandoExotic, "miami", "pickup", "return")).toThrow("PICKUP_ONLY"); });
});

describe("Immediate checkout preview uses the car's server option table", () => {
  const prices: OptionPrices = { "pickup:orlando": { pickup: 0, airport: 40, address: 60 }, "return:orlando": { pickup: 0, airport: 40, address: 60 }, "pickup:tampa": { pickup: null, airport: 60, address: 60 }, "return:tampa": { pickup: null, airport: 60, address: 60 }, "pickup:miami": { pickup: 150, airport: 150, address: 150 }, "return:miami": { pickup: 150, airport: 150, address: 150 } };
  it("airport and other-city legs are priced the moment they are picked", () => {
    expect(previewLegFee(prices, { city: "orlando", type: "airport" }, "pickup", "orlando", false)).toBe(40);
    expect(previewLegFee(prices, { city: "tampa", type: "address" }, "return", "orlando", false)).toBe(60);
    expect(previewLegFee(prices, { city: "miami", type: "pickup" }, "return", "orlando", false)).toBe(150);
  });
  it("own-city typed address waits for the distance check", () => expect(previewLegFee(prices, { city: "orlando", type: "address" }, "pickup", "orlando", false)).toBeNull());
  it("exotic own-city address waits for the distance check (no fee before an address is verified)", () => expect(previewLegFee({ "pickup:orlando": { pickup: 0, airport: null, address: 120 } }, { city: "orlando", type: "address" }, "pickup", "orlando", true)).toBeNull());
  it("one-way legs add up for the total", () => expect(previewLegs({ pickup: { city: "orlando", type: "airport" }, ret: { city: "miami", type: "pickup" }, prices, carCity: "orlando", sameCityOnly: false })).toMatchObject({ fee: 190, pending: false }));
});

import { applyMcoPair } from "./pricing";
import { deliveryFaq, carDeliveryNote } from "./deliveryText";
const pair = (v: { city: string; body_category: string }, a: { city: string; type: "pickup" | "airport" | "address" }, b: typeof a) =>
  applyMcoPair(v.city, [
    { ...a, ...deliveryLegPrice(v, a, "pickup", a.type === "address" ? 10 : null, null) },
    { ...b, ...deliveryLegPrice(v, b, "return", b.type === "address" ? 10 : null, null) },
  ]).map(l => l.fee);
const miamiSuv = { city: "miami", body_category: "suv" }, miamiExotic = { city: "miami", body_category: "exotics" };
const mco = { city: "orlando", type: "airport" as const }, orlAddr = { city: "orlando", type: "address" as const }, mia = { city: "miami", type: "airport" as const };
describe("Orlando MCO pair rule", () => {
  it("Orlando regular MCO+MCO = $0+$0", () => expect(pair(orlandoSuv, mco, mco)).toEqual([0, 0]));
  it("Orlando exotic MCO+MCO = $0+$0", () => expect(pair(orlandoExotic, mco, mco)).toEqual([0, 0]));
  it("Orlando regular MCO pickup + address return = $40+$40", () => expect(pair(orlandoSuv, mco, orlAddr)).toEqual([40, 40]));
  it("Orlando MCO + base = $40+$0 (regular) / $120+$0 (exotic)", () => { expect(pair(orlandoSuv, mco, { city: "orlando", type: "pickup" })).toEqual([40, 0]); expect(pair(orlandoExotic, mco, { city: "orlando", type: "pickup" })).toEqual([120, 0]); });
  it("Orlando exotic address pickup + MCO return = $120+$120", () => expect(pair(orlandoExotic, orlAddr, mco)).toEqual([120, 120]));
  it("Orlando address+address unchanged ($40 / $120)", () => { expect(pair(orlandoSuv, orlAddr, orlAddr)).toEqual([40, 40]); expect(pair(orlandoExotic, orlAddr, orlAddr)).toEqual([120, 120]); });
  it("Miami regular MIA+MIA = $0+$0", () => expect(pair(miamiSuv, mia, mia)).toEqual([0, 0]));
  it("Miami exotic MIA+MIA = $0+$0", () => expect(pair(miamiExotic, mia, mia)).toEqual([0, 0]));
  it("Miami mixed MIA cases keep normal fees", () => {
    const miaAddr = { city: "miami", type: "address" as const }, miaBase = { city: "miami", type: "pickup" as const };
    expect(pair(miamiSuv, mia, miaAddr)).toEqual([40, 40]); expect(pair(miamiSuv, mia, miaBase)).toEqual([40, 0]);
    expect(pair(miamiExotic, mia, miaBase)).toEqual([120, 0]); expect(pair(miamiExotic, miaAddr, mia)).toEqual([120, 120]);
  });
  it("Orlando car at MIA+MIA is not free (own-airport only)", () => expect(pair(orlandoSuv, mia, mia)).toEqual([180, 180]));
  it("Orlando MCO pickup + Miami return stays $40+$180", () => expect(pair(orlandoSuv, mco, { city: "miami", type: "pickup" })).toEqual([40, 180]));
  it("preview totals agree: MCO round trip is $0", () => {
    const prices: OptionPrices = { "pickup:orlando": { pickup: 0, airport: 40, address: 40 }, "return:orlando": { pickup: 0, airport: 40, address: 40 } };
    expect(previewLegs({ pickup: mco, ret: mco, prices, carCity: "orlando", sameCityOnly: false }).fee).toBe(0);
  });
  it("FAQ and Orlando car note state the rule in PT/EN/ES", () => {
    for (const [lang, s] of [["en", "free delivery when you pick up and return at Orlando airport (MCO)"], ["pt", "entrega gratuita quando a retirada e a devolução são no aeroporto de Orlando (MCO)"], ["es", "entrega gratuita cuando recoges y devuelves en el aeropuerto de Orlando (MCO)"]] as const) {
      expect(deliveryFaq(lang, null)[1]![1]).toContain(s);
      expect(carDeliveryNote(lang, null, orlandoSuv, null, "orlando")).toContain(s);
      expect(carDeliveryNote(lang, null, miamiSuv, null, "miami")).not.toContain(s);
    }
    for (const [lang, s] of [["en", "free delivery when you pick up and return at Miami airport (MIA)"], ["pt", "entrega gratuita quando a retirada e a devolução são no aeroporto de Miami (MIA)"], ["es", "entrega gratuita cuando recoges y devuelves en el aeropuerto de Miami (MIA)"]] as const) {
      expect(deliveryFaq(lang, null)[1]![1]).toContain(s);
      expect(carDeliveryNote(lang, null, miamiSuv, null, "miami")).toContain(s);
    }
  });
});

import { encodeLegs, decodeLegs } from "@/hooks/useDeliveryQuote";
import { readFileSync } from "node:fs";
describe("Car page → checkout location hand-off", () => {
  it("passes pickup/return (incl. Google address) intact", () => {
    const p = { city: "orlando", type: "address" as const, address: "Disney Springs", placeId: "abc" }, r = { city: "orlando", type: "airport" as const };
    expect(decodeLegs(encodeLegs(p, r, false))).toEqual({ pickup: p, ret: r, same: false });
  });
  it("rejects malformed values", () => { expect(decodeLegs("{bad")).toBeNull(); expect(decodeLegs(JSON.stringify({ p: { city: "x", type: "boat" }, r: {} }))).toBeNull(); });
  it("car page booking card: dates, then pickup/return (Google Places), then add-ons; checkout note removed", () => {
    const src = readFileSync("src/routes/$lang.cars.$city.$slug.tsx", "utf8");
    const dates = src.indexOf("<DateTimeField"), legs = src.indexOf("<DeliveryLegs"), add = src.indexOf('data-testid="car-addons"');
    expect(dates).toBeGreaterThan(0); expect(legs).toBeGreaterThan(dates); expect(add).toBeGreaterThan(legs);
    expect(src).not.toContain('data-testid="delivery-note"');
    expect(src).toContain("dl: encodeLegs(");
    expect(readFileSync("src/components/site/DeliveryLegs.tsx", "utf8")).toContain("suggestDeliveryAddress");
  });
  it("checkout: confirmed locations then driver data; add-ons offered only on the car page", () => {
    const src = readFileSync("src/routes/$lang.checkout.$city.$slug.tsx", "utf8");
    const a = src.indexOf("<LegsConfirmed"), c = src.indexOf('data-testid="driver-fields"');
    expect(a).toBeGreaterThan(0); expect(c).toBeGreaterThan(a);
    expect(src).not.toContain('data-testid="checkout-addons"');
    expect(src).not.toContain("visibleAddonKeys(upsells).map");
  });
});

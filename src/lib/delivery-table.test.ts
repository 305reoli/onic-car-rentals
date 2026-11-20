// Owner's final delivery table (per leg, USD) — Nov 9, 2026.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { deliveryLegPrice, routeLegFee, type DeliveryCar } from "./pricing";
import { DeliveryLegSummary } from "@/components/site/DeliveryLegs";

const orlandoSuv: DeliveryCar = { city: "orlando", body_category: "suv" };
const miamiSuv: DeliveryCar = { city: "miami", body_category: "suv" };
const orlandoSports: DeliveryCar = { city: "orlando", body_category: "sports" };
const orlandoExotic: DeliveryCar = { city: "orlando", body_category: "exotics" };
const miamiExotic: DeliveryCar = { city: "miami", body_category: "exotics" };
const fee = (v: DeliveryCar, city: string, type: "pickup" | "airport" | "address", dir: "pickup" | "return" = "pickup", miles: number | null = 10) => deliveryLegPrice(v, { city, type }, dir, miles, null).fee;

describe("owner delivery table", () => {
  it("base pickup/return in the car's own city is free", () => {
    for (const v of [orlandoSuv, miamiSuv, orlandoExotic, miamiExotic]) for (const d of ["pickup", "return"] as const) expect(fee(v, v.city, "pickup", d)).toBe(0);
  });
  it("own-city airport or address is $40 per leg", () => {
    for (const v of [orlandoSuv, miamiSuv, orlandoSports]) for (const d of ["pickup", "return"] as const) {
      expect(fee(v, v.city, "airport", d)).toBe(40);
      expect(fee(v, v.city, "address", d)).toBe(40);
    }
  });
  it("Orlando → Tampa and Miami → Fort Lauderdale are $100 per leg, both directions", () => {
    for (const d of ["pickup", "return"] as const) for (const t of ["airport", "address"] as const) {
      expect(fee(orlandoSuv, "tampa", t, d)).toBe(100);
      expect(fee(miamiSuv, "fort-lauderdale", t, d)).toBe(100);
    }
  });
  it("every other inter-city route is $180 per leg, both directions", () => {
    for (const d of ["pickup", "return"] as const) {
      expect(fee(orlandoSuv, "miami", "pickup", d)).toBe(180);
      expect(fee(orlandoSuv, "miami", "airport", d)).toBe(180);
      expect(fee(miamiSuv, "orlando", "pickup", d)).toBe(180);
      expect(fee(miamiSuv, "orlando", "address", d)).toBe(180);
      expect(fee(orlandoSuv, "fort-lauderdale", "airport", d)).toBe(180);
      expect(fee(orlandoSuv, "fort-lauderdale", "address", d)).toBe(180);
      expect(fee(miamiSuv, "tampa", "airport", d)).toBe(180);
      expect(fee(miamiSuv, "tampa", "address", d)).toBe(180);
    }
  });
  it("exotics: $120 per leg at the own-city airport or address, never another city", () => {
    for (const v of [orlandoExotic, miamiExotic]) for (const d of ["pickup", "return"] as const) {
      expect(fee(v, v.city, "airport", d)).toBe(120);
      expect(fee(v, v.city, "address", d)).toBe(120);
    }
    expect(() => fee(orlandoExotic, "tampa", "airport")).toThrow("PICKUP_ONLY");
    expect(() => fee(miamiExotic, "fort-lauderdale", "address")).toThrow("PICKUP_ONLY");
    expect(() => fee(orlandoExotic, "miami", "pickup")).toThrow("PICKUP_ONLY");
  });
  it("custom address beyond 25 miles or unknown distance is confirmed with the client, no price", () => {
    for (const v of [orlandoSuv, orlandoExotic]) {
      expect(deliveryLegPrice(v, { city: v.city, type: "address" }, "pickup", 40, null)).toMatchObject({ status: "quote_pending", fee: null });
      expect(deliveryLegPrice(v, { city: v.city, type: "address" }, "pickup", null, null)).toMatchObject({ status: "quote_pending", fee: null });
    }
  });
  it("legacy saved prices (old flat keys) no longer override the table", () => {
    const old = { fixed_delivery: { regular: { ownCityAddress: 60, otherBase: 150, servedCity: 60 } } };
    expect(deliveryLegPrice(orlandoSuv, { city: "tampa", type: "airport" }, "pickup", null, old).fee).toBe(100);
    expect(deliveryLegPrice({ ...orlandoExotic, delivery_pricing: { ownCityAddress: 100 } }, { city: "orlando", type: "airport" }, "pickup", null, null).fee).toBe(120);
  });
  it("route fee for car pages matches checkout", () => {
    expect(routeLegFee(orlandoSuv, "tampa", null)).toBe(100);
    expect(routeLegFee(miamiSuv, "fort-lauderdale", null)).toBe(100);
    expect(routeLegFee(orlandoSuv, "fort-lauderdale", null)).toBe(180);
    expect(routeLegFee(miamiSuv, "tampa", null)).toBe(180);
    expect(routeLegFee(orlandoExotic, "tampa", null)).toBeNull();
  });
  it("inter-city summary shows one line per leg, not an extra inter-city fee line", () => {
    const leg = (direction: "pickup" | "return") => ({ city: "miami", type: "pickup" as const, direction, fee: 180, fixedFee: 180, localFee: 0, interCity: true, status: "priced" });
    const { container } = render(createElement(DeliveryLegSummary, { legs: [leg("pickup"), leg("return")], lang: "en" }));
    expect(container.textContent?.match(/\$180/g)?.length).toBe(2);
    expect(container.textContent).not.toContain("Inter-city fee");
  });
});

import { carDeliveryNote, deliveryFaq } from "./deliveryText";
import { deliveryLegText } from "./i18n";
const NOTES = {
  pt: "Carros exóticos têm espaço de bagagem muito limitado — as malas podem não caber no carro.",
  en: "Exotic cars have very limited luggage space — your bags may not fit in the car.",
  es: "Los autos exóticos tienen un espacio para equipaje muy limitado: es posible que sus maletas no quepan en el auto.",
} as const;
describe("exotic airport luggage note", () => {
  for (const lang of ["pt", "en", "es"] as const) {
    it(`${lang}: checkout airport note, car-page note and FAQ carry the exact text`, () => {
      expect(deliveryLegText[lang].exoticLuggage).toBe(NOTES[lang]);
      expect(carDeliveryNote(lang, null, { body_category: "exotics" }, null, "orlando")).toContain(NOTES[lang]);
      expect(carDeliveryNote(lang, null, { body_category: "suv" }, null, "orlando")).not.toContain(NOTES[lang]);
      expect(deliveryFaq(lang, null)[1]![1]).toContain(NOTES[lang]);
    });
  }
});

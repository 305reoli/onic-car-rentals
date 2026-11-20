import { describe, expect, it } from "vitest";
import { computeQuote, effectiveMinDays, minDaysMap } from "./pricing";

const P = new Date("2027-03-10T15:00:00Z");
const plus = (n: number) => new Date(P.getTime() + n * 86400000);
const none = { insurance: false, hotelCheckin: false, luggageCar: false };
const car = { daily_price_usd: 200, prereservation_amount_usd: null };

describe("minimum rental days", () => {
  it("defaults: Exotics 1, SUV/Sedan/Luxury/Sports 3", () => {
    const m = minDaysMap(null);
    expect([m["exotics"], m["suv"], m["sedan"], m["luxury"], m["sports"]]).toEqual([1, 3, 3, 3, 3]);
  });
  it("Mustang (sports) needs 3: 2 days blocked, 3 OK", () => {
    const n = effectiveMinDays({ body_category: "sports", min_days: null }, null).n;
    expect(() => computeQuote(car, P, plus(2), none, undefined, 0, 0, { exotic: false, minDays: n })).toThrow("MIN_DAYS");
    expect(computeQuote(car, P, plus(3), none, undefined, 0, 0, { exotic: false, minDays: n }).days).toBe(3);
  });
  it("Portofino / 911 (exotics) 1 day OK", () => {
    const n = effectiveMinDays({ body_category: "exotics", min_days: null }, null).n;
    expect(n).toBe(1);
    expect(computeQuote(car, P, plus(1), none, undefined, 0, 0, { exotic: true, minDays: n }).days).toBe(1);
  });
  it("Macan (luxury) 1 day blocked", () => {
    const n = effectiveMinDays({ body_category: "luxury", min_days: null }, null).n;
    expect(() => computeQuote(car, P, plus(1), none, undefined, 0, 0, { exotic: false, minDays: n })).toThrow("MIN_DAYS");
  });
  it("Urus pending override 3 beats Exotics default 1", () => {
    expect(effectiveMinDays({ body_category: "exotics", min_days: 3 }, null)).toEqual({ n: 3, source: "car" });
  });
  it("changing the Exotics default applies", () => {
    expect(effectiveMinDays({ body_category: "exotics", min_days: null }, { exotics: 2 }).n).toBe(2);
  });
});

describe("owner final decision", () => {
  const q = (cat: string, md: number | null, n: number) => computeQuote(car, P, plus(n), none, undefined, 0, 0, { exotic: cat === "exotics", minDays: effectiveMinDays({ body_category: cat, min_days: md }, null).n });
  it("Miami Cybertruck (override 3): 1 day blocked, 3 OK", () => { expect(() => q("exotics", 3, 1)).toThrow("MIN_DAYS"); expect(q("exotics", 3, 3).days).toBe(3); });
  it("Orlando Cybertruck, Urus, Maybach (Exotics default): 1 day OK", () => { expect(q("exotics", null, 1).days).toBe(1); });
  it("Porsche Macan (Luxury): 1 day blocked", () => { expect(() => q("luxury", null, 1)).toThrow("MIN_DAYS"); });
});

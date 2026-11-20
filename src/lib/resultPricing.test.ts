import { describe, expect, it } from "vitest";
import { meetsResultMinimum, sortResultPrices } from "./resultPricing";
import { datedTotal } from "./searchLocation";
import type { Vehicle } from "./vehicles";

const car = (id: string, price: number | null, category = "sedan", min_days: number | null = null) => ({ id, daily_price_usd: price, body_category: category, min_days, prereservation_amount_usd: null, city: "orlando" } as Vehicle);
const context = { pickup: "2026-11-24T10:00", ret: "2026-11-27T10:00" };
const regular = car("regular", 100), exotic = car("exotic", 120, "exotics"), priceless = car("priceless", null);

describe("dated result pricing", () => {
  it("low-to-high uses dated total, not daily rate", () => {
    expect(datedTotal(exotic, context.pickup, context.ret, undefined, "orlando")?.total).toBeLessThan(datedTotal(regular, context.pickup, context.ret, undefined, "orlando")?.total ?? 0);
    expect(sortResultPrices([regular, priceless, exotic], "asc", context).map(v => v.id)).toEqual(["exotic", "regular", "priceless"]);
  });
  it("high-to-low uses dated total and keeps unknown totals last", () => {
    expect(sortResultPrices([exotic, priceless, regular], "desc", context).map(v => v.id)).toEqual(["regular", "exotic", "priceless"]);
  });
  it("recomputes ordering for December full rates", () => {
    expect(sortResultPrices([regular, exotic], "asc", { pickup: "2026-12-10T10:00", ret: "2026-12-13T10:00" }).map(v => v.id)).toEqual(["regular", "exotic"]);
  });
  it("hides priced cars below their minimum and keeps price-on-request visible", () => {
    const short = { pickup: "2026-11-24T10:00", ret: "2026-11-25T10:00" };
    expect([regular, exotic, priceless].filter(v => meetsResultMinimum(v, short)).map(v => v.id)).toEqual(["exotic", "priceless"]);
  });
  it("respects per-unit overrides and category settings without changing them", () => {
    expect(meetsResultMinimum(car("override", 200, "exotics", 3), { ...context, ret: "2026-11-25T10:00" })).toBe(false);
    expect(meetsResultMinimum(regular, { ...context, settings: { min_days_by_category: { sedan: 4 } } })).toBe(false);
    expect(meetsResultMinimum(regular, context)).toBe(true);
  });
  it("preserves deliberate duplicate units, stable ties and the original array", () => {
    const duplicate = { ...regular, id: "unit2" };
    const input = [duplicate, regular];
    expect(sortResultPrices(input, "asc", context).map(v => v.id)).toEqual(["unit2", "regular"]);
    expect(input.map(v => v.id)).toEqual(["unit2", "regular"]);
  });
  it("without dates sorts daily prices and leaves all minimums eligible", () => {
    expect(sortResultPrices([exotic, priceless, regular], "asc", {}).map(v => v.id)).toEqual(["regular", "exotic", "priceless"]);
    expect(meetsResultMinimum(regular, {})).toBe(true);
  });
});
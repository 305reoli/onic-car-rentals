import { describe, expect, it } from "vitest";
import { canBookOnline, computeQuote, holdExpiresAt, prereservationAmount, rentalDays, round2, rentalRateText } from "./pricing";

describe("pre-reservation amount", () => {
  it("uses $75 when one day is cheaper", () => expect(prereservationAmount(50, null)).toBe(75));
  it("uses one day of the daily price when greater than $75", () => expect(prereservationAmount(1200, null)).toBe(1200));
  it("uses $75 when price is not set yet", () => expect(prereservationAmount(null, null)).toBe(75));
  it("uses the per-car override", () => expect(prereservationAmount(1200, 300)).toBe(300));
  it("never lets the override go below $75", () => expect(prereservationAmount(1200, 40)).toBe(75));
});

describe("hold expiry", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  it("expires 24h after the request when pick-up is far away", () => {
    expect(holdExpiresAt(now, new Date("2026-01-10T00:00:00Z")).toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });
  it("expires 3h before pick-up when that comes first", () => {
    expect(holdExpiresAt(now, new Date("2026-01-01T10:00:00Z")).toISOString()).toBe("2026-01-01T07:00:00.000Z");
  });
});

describe("online lead time", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  it("blocks pick-up less than 6h away", () => expect(canBookOnline(now, new Date("2026-01-01T05:59:00Z"))).toBe(false));
  it("allows pick-up 6h away", () => expect(canBookOnline(now, new Date("2026-01-01T06:00:00Z"))).toBe(true));
});

describe("rental days", () => {
  it("counts each started 24h", () => expect(rentalDays(new Date("2026-01-01T10:00Z"), new Date("2026-01-03T11:00Z"))).toBe(3));
});

describe("city delivery fee", () => {
  const car = { daily_price_usd: 100, prereservation_amount_usd: null };
  const a = new Date("2026-01-01T10:00:00Z"), b = new Date("2026-01-04T10:00:00Z");
  const none = { insurance: false, hotelCheckin: false, luggageCar: false };
  it("adds nothing when the city fee is empty", () => {
    const q = computeQuote(car, a, b, none, undefined, null);
    expect(q.subtotal! - q.basicInsurance - q.tolls - q.solidWaste).toBe(300);
  });
  it("adds the city fee once to the total when set", () => {
    const q = computeQuote(car, a, b, none, undefined, 40);
    expect(q.deliveryFee).toBe(40);
    expect(q.subtotal! - q.basicInsurance - q.tolls - q.solidWaste).toBe(340);
  });
});

import { isUnavailable } from "./pricing";
describe("search availability", () => {
  const P = "2026-11-13T10:00", R = "2026-11-16T10:00";
  it("is available with no blocks or requests", () => expect(isUnavailable([], [], P, R)).toBe(false));
  it("hides a car with a blocked day inside the period", () => expect(isUnavailable(["2026-11-15"], [], P, R)).toBe(true));
  it("keeps a car whose blocked day is outside the period", () => expect(isUnavailable(["2026-11-20"], [], P, R)).toBe(false));
  it("hides a car with an overlapping active request", () =>
    expect(isUnavailable([], [{ pickup_at: "2026-11-15T00:00:00Z", return_at: "2026-11-18T00:00:00Z" }], P, R)).toBe(true));
  it("keeps a car whose request ends before pick-up", () =>
    expect(isUnavailable([], [{ pickup_at: "2026-11-01T00:00:00Z", return_at: "2026-11-05T00:00:00Z" }], P, R)).toBe(false));
});

import { deliveryPrice, deliveryTier, insuranceOffered, prereservationAmount as pre2 } from "./pricing";
describe("delivery & insurance rules (owner table)", () => {
  it("1. Mustang (sports): no insurance; airport one-way $40, round trip $60", () => {
    const m = { body_category: "sports" };
    expect(insuranceOffered(m)).toBe(false);
    expect(deliveryTier(m)).toBe("standard");
    expect(deliveryPrice("standard", "airport", "one_way", null)).toEqual({ status: "priced", fee: 40 });
    expect(deliveryPrice("standard", "airport", "round_trip", null)).toEqual({ status: "priced", fee: 60 });
  });
  it("2. SUV address 10 mi $60, 15.0 mi $60, 20 mi $80; insurance offered", () => {
    expect(insuranceOffered({ body_category: "suv" })).toBe(true);
    expect(deliveryPrice("standard", "address", null, 10)!.fee).toBe(60);
    expect(deliveryPrice("standard", "address", null, 15.04)!.fee).toBe(60);
    expect(deliveryPrice("standard", "address", null, 20)!.fee).toBe(80);
  });
  it("3. Exotic 5 → $120, 7.0 → $120, 12 → $150, 15.0 → $150, 20 → quote", () => {
    expect(deliveryTier({ body_category: "exotics" })).toBe("exotic");
    expect(insuranceOffered({ body_category: "exotics" })).toBe(false);
    expect(deliveryPrice("exotic", "address", null, 5).fee).toBe(120);
    expect(deliveryPrice("exotic", "address", null, 7.0).fee).toBe(120);
    expect(deliveryPrice("exotic", "address", null, 12).fee).toBe(150);
    expect(deliveryPrice("exotic", "address", null, 15).fee).toBe(150);
    expect(deliveryPrice("exotic", "address", null, 20).status).toBe("quote_pending");
  });
  it("4. Exotic airport uses the base→terminal distance tiers", () => {
    expect(deliveryPrice("exotic", "airport", "one_way", 6.5).fee).toBe(120);
    expect(deliveryPrice("exotic", "airport", "round_trip", 13).fee).toBe(150);
    expect(deliveryPrice("exotic", "airport", null, 27).status).toBe("quote_pending");
  });
  it("5. unknown distance (no geocode / service down) → quote pending, never $0", () => {
    expect(deliveryPrice("standard", "address", null, null)).toEqual({ status: "quote_pending", fee: null });
    expect(deliveryPrice("exotic", "address", null, null).status).toBe("quote_pending");
  });
  it("8. pickup at base → $0", () => {
    expect(deliveryPrice("exotic", "pickup", null, null)).toEqual({ status: "priced", fee: 0 });
  });
  it("overrides win over category", () => {
    expect(insuranceOffered({ body_category: "exotics", insurance_override: "on" })).toBe(true);
    expect(insuranceOffered({ body_category: "suv", insurance_override: "off" })).toBe(false);
    expect(deliveryTier({ body_category: "sports", delivery_tier_override: "exotic" })).toBe("exotic");
  });
  it("9. pre-reservation rule unchanged (greater of $75 or 1 day)", () => {
    expect(pre2(44, null)).toBe(75);
    expect(pre2(1299, null)).toBe(1299);
  });
});

import { allInPrice, computeQuote as cq, crossCell, crossFromDaily, crossPrice, servesCity, DEFAULT_SETTINGS as DS } from "./pricing";
describe("cross-city fleet → service city (embedded fee)", () => {
  const suv = { body_category: "suv" }, mustang = { body_category: "sports" }, exo = { body_category: "exotics" };
  const p = new Date("2027-03-10T15:00:00Z"), r3 = new Date("2027-03-13T15:00:00Z"), r1 = new Date("2027-03-11T15:00:00Z");
  it("1. Miami SUV in FLL both = $200, itemized (not embedded)", () => {
    expect(crossPrice(crossCell("miami", "fort-lauderdale", suv), "both")).toEqual({ status: "priced", fee: 200 });
    expect(crossCell("miami", "fort-lauderdale", suv)?.itemized).toBe(true);
  });
  it("2. Orlando SUV in Miami 3 days: both $810, delivery only $630", () => {
    const c = crossCell("orlando", "miami", suv);
    expect(allInPrice(150, 3, crossPrice(c, "both").fee!).total).toBe(810);
    expect(allInPrice(150, 3, crossPrice(c, "delivery").fee!).total).toBe(630);
  });
  it("3. Orlando Mustang in Miami, both → bookable at $810", () => {
    expect(servesCity("orlando", "miami", mustang)).toBe(true);
    expect(allInPrice(150, 3, crossPrice(crossCell("orlando", "miami", mustang), "both").fee!).total).toBe(810);
  });
  it("4. Mustang Miami → FLL delivery only → allowed (+$100)", () => {
    expect(crossPrice(crossCell("miami", "fort-lauderdale", mustang), "delivery")).toEqual({ status: "priced", fee: 100 });
  });
  it("Exotic one-way → rejected (Orlando → Tampa and Miami → FLL)", () => {
    expect(crossPrice(crossCell("orlando", "tampa", exo), "delivery").status).toBe("rejected");
    expect(crossPrice(crossCell("miami", "fort-lauderdale", exo), "collection").status).toBe("rejected");
    expect(crossPrice(crossCell("orlando", "tampa", exo), "both").status).toBe("rejected");
  });
  it("Orlando/Miami local prices unchanged", () => {
    expect(crossCell("miami", "miami", suv)).toBeNull();
    expect(cq({ daily_price_usd: 150, prereservation_amount_usd: null }, p, r3, { insurance: false, hotelCheckin: false, luggageCar: false }, DS, 0, null)).toMatchObject({ dailyRate: 150, base: 450 });
  });
  it("5. Exotic Miami → FLL → pickup only (no delivery); Orlando exotic → Miami off", () => {
    expect(crossPrice(crossCell("miami", "fort-lauderdale", exo), "both").status).toBe("rejected");
    expect(servesCity("miami", "fort-lauderdale", exo)).toBe(true);
    expect(servesCity("orlando", "miami", exo)).toBe(false);
    expect(servesCity("miami", "orlando", exo)).toBe(false);
  });
  it("Orlando SUV in Tampa $150 × 3 → $570 shown $190/day (any mode +$120); 1 day with $300 fee → $450", () => {
    const c = crossCell("orlando", "tampa", suv);
    expect(cq({ daily_price_usd: 150, prereservation_amount_usd: null }, p, r3, { insurance: false, hotelCheckin: false, luggageCar: false }, DS, 0, crossPrice(c, "both").fee)).toMatchObject({ dailyRate: 150, base: 450, subtotal: 701, total: 746.57, deliveryFee: 200 });
    expect(crossPrice(c, "delivery")).toEqual({ status: "priced", fee: 100 });
    expect(crossPrice(crossCell("orlando", "tampa", mustang), "both")).toEqual({ status: "priced", fee: 200 });
    expect(crossPrice(crossCell("orlando", "tampa", mustang), "delivery")).toEqual({ status: "priced", fee: 100 });
    expect(cq({ daily_price_usd: 150, prereservation_amount_usd: null }, p, r1, { insurance: false, hotelCheckin: false, luggageCar: false }, DS, 0, 300)).toMatchObject({ dailyRate: 150, base: 150, deliveryFee: 300, prereservation: 150 });
  });
  it("symmetric: Miami SUV in Orlando 3 days both → $810; Miami Lamborghini in Orlando → not listed", () => {
    expect(allInPrice(150, 3, crossPrice(crossCell("miami", "orlando", suv), "both").fee!).total).toBe(810);
    expect(crossPrice(crossCell("miami", "tampa", suv), "delivery")).toEqual({ status: "priced", fee: 180 });
    expect(servesCity("miami", "orlando", exo)).toBe(false);
    expect(servesCity("miami", "tampa", mustang)).toBe(true);
  });
  it("pre-reservation in Tampa uses the all-in daily", () => {
    expect(cq({ daily_price_usd: 59, prereservation_amount_usd: null }, p, r3, { insurance: false, hotelCheckin: false, luggageCar: false }, DS, 0, 300).prereservation).toBe(75);
  });
  it("rounding cent goes on the total, never lost", () => {
    expect(allInPrice(100, 3, 100)).toEqual({ allInDaily: 133.33, total: 400 });
  });
  it("7. same city → no cell, price unchanged; from-price uses 3-day reference", () => {
    expect(crossCell("orlando", "orlando", suv)).toBeNull();
    expect(crossFromDaily(150, null)).toBe(150);
    expect(crossFromDaily(150, crossCell("orlando", "tampa", suv))).toBe(150);
    expect(crossFromDaily(1299, crossCell("orlando", "tampa", exo))).toBe(1299);
  });
});

describe("Fort Lauderdale rule (Miami fleet)", () => {
  const suv = { body_category: "suv" }, exo = { body_category: "exotics" };
  const car = { daily_price_usd: 150, prereservation_amount_usd: null };
  const fq = (fee: number) => computeQuote(car, new Date("2027-03-10T15:00:00Z"), new Date("2027-03-13T15:00:00Z"), { insurance: false, hotelCheckin: false, luggageCar: false }, undefined, fee, 0, { exotic: false });
  it("both: rental 450 + own delivery line 200, daily stays $150, total 740.18", () => {
    const q = fq(crossPrice(crossCell("miami", "fort-lauderdale", suv), "both").fee!);
    expect([q.dailyRate, q.base, q.deliveryFee, q.total]).toEqual([150, 450, 200, 746.57]);
  });
  it("delivery only: delivery line 100, total 633.68", () => {
    const q = fq(crossPrice(crossCell("miami", "fort-lauderdale", suv), "delivery").fee!);
    expect([q.base, q.deliveryFee, q.total]).toEqual([450, 100, 640.07]);
  });
  it("pickup at base: no delivery, total 527.18", () => { const q = fq(0); expect([q.deliveryFee, q.total]).toEqual([0, 533.57]); });
  it("FLL daily price is not embedded", () => expect(crossFromDaily(150, crossCell("miami", "fort-lauderdale", suv))).toBe(150));
  it("collection only = $100", () => expect(crossPrice(crossCell("miami", "fort-lauderdale", suv), "collection")).toEqual({ status: "priced", fee: 100 }));
  it("pickup at base allowed for standard", () => expect(crossCell("miami", "fort-lauderdale", suv)?.pickup).toBe(true));
  it("exotic: pickup only, every delivery mode rejected", () => {
    const c = crossCell("miami", "fort-lauderdale", exo);
    expect(c?.pickupOnly).toBe(true);
    for (const m of ["both", "delivery", "collection"] as const) expect(crossPrice(c, m).status).toBe("rejected");
  });
  it("Orlando fleet in FLL 180/180/360", () => expect(["delivery", "collection", "both"].map((m) => crossPrice(crossCell("orlando", "fort-lauderdale", suv), m as never).fee)).toEqual([180, 180, 360]));
});

describe("Stage 1 inter-city amounts remain separate", () => {
  for (const [fleet,city] of [["orlando","tampa"],["miami","fort-lauderdale"]] as const) {
    it(`${fleet} → ${city}: 100 per leg, 200 round trip; rental remains 450`, () => {
      const c = crossCell(fleet,city,{body_category:"suv"});
      expect([crossPrice(c,"delivery").fee,crossPrice(c,"collection").fee,crossPrice(c,"both").fee]).toEqual([100,100,200]);
      const q=computeQuote({daily_price_usd:150,prereservation_amount_usd:null},new Date("2027-01-01"),new Date("2027-01-04"),{insurance:false,hotelCheckin:false,luggageCar:false},undefined,200,0);
      expect([q.dailyRate,q.base,q.deliveryFee,q.subtotal,q.tax,q.total,q.prereservation]).toEqual([150,450,200,701,45.57,746.57,150]);
    });
  }
  it("exotic restriction cannot be overridden by editable matrix or delivery tier",()=>{
    const c=crossCell("miami","fort-lauderdale",{body_category:"exotics",delivery_tier_override:"standard"});
    expect(c?.pickupOnly).toBe(true);expect(crossPrice(c,"both").status).toBe("rejected");
    expect(crossPrice(crossCell("orlando","tampa",{body_category:"exotics"}),"both").status).toBe("rejected");
  });
});

describe("duration discount (Sports/Exotics only)", () => {
  const d = (n: number) => [new Date("2026-11-01T15:00:00Z"), new Date(new Date("2026-11-01T15:00:00Z").getTime() + n * 86_400_000)] as const;
  const q = (cat: string, price: number, n: number) => { const [a, b] = d(n); return computeQuote({ daily_price_usd: price, prereservation_amount_usd: null, body_category: cat }, a, b, { insurance: false, hotelCheckin: false, luggageCar: false }, DS, 0, 0, { exotic: cat === "exotics" }); };
  it("sports $449: 1d full, 2d 426.55 (853.10), 3d 404.10 (1212.30)", () => {
    expect(q("sports", 449, 1).dailyRate).toBe(449);
    expect(q("sports", 449, 1).durationDiscount).toBe(0);
    expect(q("sports", 449, 2).dailyRate).toBe(426.55); expect(q("sports", 449, 2).base).toBe(853.1);
    expect(q("sports", 449, 3).dailyRate).toBe(404.1); expect(q("sports", 449, 3).base).toBe(1212.3);
    expect(q("sports", 449, 3).durationPct).toBe(10);
  });
  it("exotic $899: 2d 854.05, 3d 809.10", () => {
    expect(q("exotics", 899, 2).dailyRate).toBe(854.05);
    expect(q("exotics", 899, 3).dailyRate).toBe(809.1);
  });
  it("regular car never discounted", () => {
    const r = q("suv", 449, 4);
    expect(r.dailyRate).toBe(449); expect(r.base).toBe(1796); expect(r.durationPct).toBe(0); expect(r.durationDiscount).toBe(0);
  });
  it("insurance/tolls not discounted; tax on discounted subtotal", () => {
    const r = q("sports", 449, 3);
    expect(r.basicInsurance).toBe(30); expect(r.tolls).toBe(15);
    expect(r.subtotal).toBe(1263.3);
    expect(r.tax).toBe(82.11);
    expect(r.total).toBe(1345.41);
  });
});

describe("December days never discounted (per-day rule)", () => {
  const cay = { daily_price_usd: 349, prereservation_amount_usd: null, body_category: "exotics" };
  const at = (d: string) => new Date(`${d}T10:00:00-05:00`);
  const q = (a: string, b: string) => computeQuote(cay as never, at(a), at(b), { insurance: false, hotelCheckin: false, luggageCar: false }, undefined, 0, 0, { exotic: true });
  it("(a) 5 Nov + 5 Dec: 10% on the 5 November days only", () => {
    const r = q("2026-11-26", "2026-12-06");
    expect([r.nonDecemberDays, r.decemberDays, r.durationPct]).toEqual([5, 5, 10]);
    expect(r.discountedDaily).toBe(314.1); expect(r.base).toBe(3315.5); expect(r.durationDiscount).toBe(174.5);
    expect(r.tax).toBe(216.81); expect(r.total).toBe(3552.31);
  });
  it("(b) 1 Nov + 4 Dec: no discount at all", () => {
    const r = q("2026-11-30", "2026-12-05");
    expect(r.durationPct).toBe(0); expect(r.durationDiscount).toBe(0); expect(r.base).toBe(1745); expect(r.tax).toBe(114.08); expect(r.total).toBe(1869.08);
  });
  it("(c) all December: no discount", () => {
    const r = q("2026-12-10", "2026-12-15");
    expect(r.durationPct).toBe(0); expect(r.base).toBe(1745);
  });
  it("(d) all outside December: as before (3 Nov days -10%)", () => {
    const r = q("2026-11-18", "2026-11-21");
    expect(r.base).toBe(942.3); expect(r.durationDiscount).toBe(104.7); expect(r.tax).toBe(61.64); expect(r.total).toBe(1009.94);
  });
  it("2 Nov + Dec days: 5% on the 2 November days only", () => {
    const r = q("2026-11-29", "2026-12-03");
    expect([r.nonDecemberDays, r.decemberDays, r.durationPct]).toEqual([2, 2, 5]);
    expect(r.base).toBe(round2(331.55 * 2 + 349 * 2)); expect(r.durationDiscount).toBe(34.9);
  });
});

describe("per-car promotions + configurable tier", () => {
  const car = { id: "car-1", daily_price_usd: 349, prereservation_amount_usd: null, body_category: "exotics" };
  const reg = { id: "car-2", daily_price_usd: 100, prereservation_amount_usd: null, body_category: "suv" };
  const at = (d: string) => new Date(`${d}T10:00:00-05:00`);
  const promo = (pct: number, a: string, b: string, id = "car-1") => ({ vehicle_id: id, pct, starts_on: a, ends_on: b, active: true });
  const q = (v: typeof car, a: string, b: string, s: Record<string, unknown> = {}) => computeQuote(v as never, at(a), at(b), { insurance: false, hotelCheckin: false, luggageCar: false }, { ...DS, ...s } as never, 0, 0, { exotic: v.body_category === "exotics" });
  it("promo higher than tier wins, no stacking", () => {
    const r = q(car, "2026-11-18", "2026-11-21", { promotions: [promo(20, "2026-11-01", "2026-11-30")] });
    expect(r.base).toBe(round2(279.2 * 3)); expect(r.durationDiscount).toBe(0); expect(r.promoDiscount).toBe(round2(349 * 3 - 279.2 * 3));
  });
  it("rental label shows the rate actually applied (promo wins vs tier wins)", () => {
    const cv = { dur2: "", dur3: "", durNonDec: "", decSplit: "{n} × {amt} (non-Dec.) + {d} × {full} (December)" };
    const p = q(car, "2026-11-18", "2026-11-21", { promotions: [promo(20, "2026-11-18", "2026-12-06")] });
    expect(p.base).toBe(837.6); expect(rentalRateText(p as never, "", cv)).toBe("3 × $279.20");
    const t = q(car, "2026-11-18", "2026-11-21");
    expect(rentalRateText(t as never, "", cv)).toContain("$314.10");
    const m = q(car, "2026-11-26", "2026-12-06", { promotions: [promo(20, "2026-11-18", "2026-12-06")] });
    expect(m.base).toBe(3141); expect(rentalRateText(m as never, "", cv)).toBe("5 × $279.20 + 5 × $349");
  });
  it("tier higher than promo wins", () => {
    const r = q(car, "2026-11-18", "2026-11-21", { promotions: [promo(5, "2026-11-01", "2026-11-30")] });
    expect(r.base).toBe(942.3); expect(r.durationDiscount).toBe(104.7); expect(r.promoDiscounts).toEqual([]);
  });
  it("promo on December days gives no discount", () => {
    const r = q(car, "2026-12-10", "2026-12-13", { promotions: [promo(30, "2026-12-01", "2026-12-31")] });
    expect(r.base).toBe(1047); expect(r.promoDiscount).toBe(0);
  });
  it("partial window discounts only in-window non-December days", () => {
    // regular car: no tier; 5 days Nov 27–Dec 2, promo Nov 28–Dec 5 → Nov 28,29,30 only
    const r = q(reg as never, "2026-11-27", "2026-12-02", { promotions: [promo(10, "2026-11-28", "2026-12-05", "car-2")] });
    expect(r.promoDiscounts).toEqual([{ pct: 10, days: 3, amount: 30 }]); expect(r.base).toBe(470);
  });
  it("expired / out-of-window / other car promo has no effect", () => {
    const r = q(reg as never, "2026-11-18", "2026-11-21", { promotions: [promo(50, "2026-10-01", "2026-10-31", "car-2"), promo(50, "2026-11-01", "2026-11-30", "other")] });
    expect(r.base).toBe(300); expect(r.promoDiscount).toBe(0);
  });
  it("tier config change is reflected; defaults stay 5/10", () => {
    expect(q(car, "2026-11-18", "2026-11-21").durationPct).toBe(10);
    expect(q(car, "2026-11-18", "2026-11-20").durationPct).toBe(5);
    const r = q(car, "2026-11-18", "2026-11-21", { duration_tiers: { two: 7, three: 15 } });
    expect(r.durationPct).toBe(15); expect(r.base).toBe(round2(296.65 * 3));
  });
});

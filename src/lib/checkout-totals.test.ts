import { describe, expect, it } from "vitest";
import { computeQuote, crossCell, crossPrice, DEFAULT_DELIVERY, deliveryPrice, deliveryTier, insuranceOffered } from "./pricing";

const P = new Date("2026-12-01T10:00:00Z");
const days = (n: number) => new Date(P.getTime() + n * 86400000);
const none = { insurance: false, hotelCheckin: false, luggageCar: false };
const car = (daily: number) => ({ daily_price_usd: daily, prereservation_amount_usd: null });
const q = (daily: number, n: number, cat: string, delivery = 0, embedded = 0) =>
  computeQuote(car(daily), P, days(n), none, undefined, delivery, embedded, { exotic: deliveryTier({ body_category: cat }) === "exotic" });

describe("local checkout composition", () => {
  it("a) SUV $150×4, address ≤15mi $60", () => {
    const fee = deliveryPrice("standard", "address", null, 10);
    expect(fee).toEqual({ status: "priced", fee: 60 });
    const r = q(150, 4, "suv", 60);
    expect([r.base, r.basicInsurance, r.tolls, r.deliveryFee, r.subtotal, r.tax, r.total]).toEqual([600, 40, 20, 60, 728, 47.32, 775.32]);
  });
  it("b) Exotic $1200×3, ≤7mi $120 — no insurance/toll lines", () => {
    expect(deliveryPrice("exotic", "address", null, 5)).toEqual({ status: "priced", fee: 120 });
    const r = q(1200, 3, "exotics", 120);
    expect([r.base, r.basicInsurance, r.tolls, r.deliveryFee, r.subtotal, r.tax, r.total]).toEqual([3600, 0, 0, 120, 3726, 242.19, 3968.19]);
  });
  it("c) Mustang (Sports): basic insurance + toll, no supplemental option", () => {
    const r = q(200, 2, "sports");
    expect([r.basicInsurance, r.tolls]).toEqual([20, 10]);
    expect(insuranceOffered({ body_category: "sports" }, DEFAULT_DELIVERY)).toBe(false);
  });
  it("d) SUV pickup: no delivery, tax still applied", () => {
    const r = q(150, 2, "suv", 0);
    expect([r.deliveryFee, r.subtotal, r.tax, r.total]).toEqual([0, 334, 21.71, 355.71]);
  });
  it("e) Orlando SUV in Tampa $150×3 (cross-city embedded)", () => {
    const fee = crossPrice(crossCell("orlando", "tampa", { body_category: "suv" }), "both");
    expect(fee).toEqual({ status: "priced", fee: 200 });
    const r = q(150, 3, "suv", 0, 200);
    expect([r.base, r.basicInsurance, r.tolls, r.subtotal, r.tax, r.total]).toEqual([450, 30, 15, 701, 45.57, 746.57]);
  });
  it("f) pre-reservation = max($75, one day) and full payment = total", () => {
    expect(q(150, 4, "suv", 60).prereservation).toBe(150);
    expect(q(50, 2, "sedan").prereservation).toBe(75);
    expect(q(150, 3, "suv", 0, 120).prereservation).toBe(150);
    const r = q(1200, 3, "exotics", 120);
    expect(r.total).toBe(3968.19); // Global Pays charges q.total
    expect(r.prereservation).toBe(1200);
  });
});

import { composeTotals, matchingFees, type CustomFee } from "./pricing";
const fee = (p: Partial<CustomFee>): CustomFee => ({ id: "f", name_en: "Fee", name_pt: "", name_es: "", type: "fixed", amount: 0, pct_base: "subtotal", applies: "all", categories: [], cities: [], mode: "mandatory", taxable: true, active: true, ...p });
const qf = (cat: string, custom: CustomFee[], chosen: string[] = []) => {
  const exotic = deliveryTier({ body_category: cat }) === "exotic";
  return computeQuote(car(150), P, days(4), none, undefined, 60, 0, { exotic, customFees: matchingFees(custom, { body_category: cat, exotic }, "orlando"), chosenFees: chosen });
};
describe("owner custom fees", () => {
  it("1) 10% of rental, mandatory, taxable → own line, taxed", () => {
    const r = qf("suv", [fee({ id: "acf", name_en: "Airport concession fee", type: "percent", amount: 10, pct_base: "rental" })]);
    expect(r.customFees.map((f) => f.amount)).toEqual([60]);
    expect([r.subtotal, r.tax, r.total]).toEqual([788, 51.22, 839.22]);
  });
  it("2) $15/day optional non-exotic → offered only to non-exotics, added only when ticked", () => {
    const seat = fee({ id: "seat", name_en: "Car seat", type: "per_day", amount: 15, applies: "non_exotic", mode: "optional" });
    expect(matchingFees([seat], { body_category: "exotics", exotic: true }, "orlando")).toEqual([]);
    expect(qf("suv", [seat]).customFees).toEqual([]);
    expect(qf("suv", [seat], ["seat"]).customFees[0]!.amount).toBe(60);
  });
  it("3) inactive fees → exactly the previous summary", () => {
    const off = [fee({ id: "a", type: "percent", amount: 10, active: false }), fee({ id: "b", type: "per_day", amount: 15, active: false, mode: "optional" })];
    const r = qf("suv", off, ["b"]);
    expect([r.subtotal, r.tax, r.total, r.customFees.length]).toEqual([728, 47.32, 775.32, 0]);
  });
  it("non-taxable fee is added after tax", () => {
    const r = qf("suv", [fee({ id: "n", amount: 25, taxable: false })]);
    expect([r.subtotal, r.tax, r.total]).toEqual([728, 47.32, 800.32]);
  });
  it("4) stored snapshot keeps the fee when recomputing a booking (fee deleted from settings)", () => {
    const snap = qf("suv", [fee({ id: "acf", name_en: "Airport concession fee", type: "percent", amount: 10, pct_base: "rental" })]).customFees;
    const t = composeTotals({ base: 600, basicInsurance: 40, tolls: 20, deliveryFee: 80, addonsTotal: 0, taxRatePct: 6.5, applied: snap, days: 4 });
    expect(t.customFees[0]).toMatchObject({ name_en: "Airport concession fee", amount: 60 });
  });
});

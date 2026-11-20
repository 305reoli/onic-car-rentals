import { describe, it, expect } from "vitest";
import { composeTotals, solidWasteFee } from "./pricing";

describe("Solid Waste fee", () => {
  it("is $2/day capped at 30 days", () => {
    expect(solidWasteFee(3)).toBe(6);
    expect(solidWasteFee(30)).toBe(60);
    expect(solidWasteFee(45)).toBe(60);
  });
  it("Corolla 3 days: taxable, total $230.04", () => {
    const t = composeTotals({ base: 165, basicInsurance: 30, tolls: 15, deliveryFee: 0, addonsTotal: 0, solidWaste: 6, taxRatePct: 6.5 });
    expect(t.subtotal).toBe(216); expect(t.tax).toBe(14.04); expect(t.total).toBe(230.04);
  });
  it("discounts never reduce it", () => {
    const t = composeTotals({ base: 10, basicInsurance: 0, tolls: 0, deliveryFee: 0, addonsTotal: 0, discount: 50, solidWaste: 6, taxRatePct: 0 });
    expect(t.subtotal).toBe(6);
  });
  it("old snapshots without it are unchanged", () => {
    const t = composeTotals({ base: 165, basicInsurance: 30, tolls: 15, deliveryFee: 0, addonsTotal: 0, taxRatePct: 6.5 });
    expect(t.total).toBe(223.65);
  });
});

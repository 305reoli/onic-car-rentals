import { describe, expect, it } from "vitest";
import { deliveryLegPrice, mcoRoundTripFree } from "./pricing";
import { relocationNotice } from "./relocation";

const car = { city: "miami", body_category: "sports" };
const leg = (city: string, direction: "pickup" | "return") => ({ city, type: "pickup" as const, direction, fee: deliveryLegPrice(car, { city, type: "pickup" }, direction, null, null).fee });
describe("relocation presentation follows actual per-leg pricing", () => {
  it("Miami car pickup and return in Orlando each cost US$180 and each get a notice", () => {
    const a = leg("orlando", "pickup"), b = leg("orlando", "return");
    expect([a.fee, b.fee]).toEqual([180, 180]);
    expect(relocationNotice("miami", a, "en")).toContain("Picking it up in Orlando");
    expect(relocationNotice("miami", b, "en")).toContain("Returning it in Orlando");
  });
  it("pickup away and return at base has exactly one relocation leg", () => {
    expect([leg("orlando", "pickup"), leg("miami", "return")].map(l => relocationNotice("miami", l, "pt")).filter(Boolean)).toHaveLength(1);
    expect(leg("miami", "return").fee).toBe(0);
  });
  it("both Miami base legs remain free and have no relocation notice", () => {
    for (const d of ["pickup", "return"] as const) { expect(leg("miami", d).fee).toBe(0); expect(relocationNotice("miami", leg("miami", d), "es")).toBeNull(); }
  });
  it("does not invent an amount when the delivery quote is unavailable", () => {
    expect(relocationNotice("miami", { ...leg("orlando", "pickup"), fee: null }, "en")).toBeNull();
  });
  it("an airport promise applies only to the own-airport pair and disappears for either away leg", () => {
    for (const base of ["miami", "orlando"]) {
      const airport = { city: base, type: "airport" as const }, away = { city: base === "miami" ? "orlando" : "miami", type: "airport" as const };
      expect(mcoRoundTripFree(base, airport, airport)).toBe(true);
      expect(mcoRoundTripFree(base, away, airport)).toBe(false);
      expect(mcoRoundTripFree(base, airport, away)).toBe(false);
    }
  });
  it("exotics remain same-city-only", () => {
    expect(() => deliveryLegPrice({ ...car, body_category: "exotics" }, { city: "orlando", type: "pickup" }, "pickup", null, null)).toThrow("PICKUP_ONLY");
  });
});
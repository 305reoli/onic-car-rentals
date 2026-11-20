import { describe, expect, it } from "vitest";
import { paymentDifference, prereservationAmount } from "./pricing";

describe("historical payment reconciliation (not a new-booking option)", () => {
  it("SUV $766.80 total, $255.60/day signal → balance $511.20", () => expect(paymentDifference(766.8, prereservationAmount(255.6, null))).toBe(511.2));
  it("cheap car: $75 signal floor is subtracted", () => expect(paymentDifference(351.45, prereservationAmount(50, null))).toBe(276.45));
  it("unknown total (quote pending) → no balance yet", () => expect(paymentDifference(null, 75)).toBeNull());
  it("never negative", () => expect(paymentDifference(60, 75)).toBe(0));
});

import { describe, expect, it } from "vitest";
import { qualifiesCancellationGrace, RENTAL_TERMS_RULES as rules } from "./rentalTerms";

describe("Part A published agreement values (not checkout pricing)", () => {
  it("lists the owner per-car age bands", () => expect(rules.minimumAges).toEqual([21, 25, 27]));
  it("uses $7 for performance extra miles", () => expect(rules.performanceExtraMile).toBe(7));
  it("regular mileage is unlimited within Florida", () => expect(rules.regularMileage).toBe("unlimited-florida"));
  it("uses a $500 leaving-Florida penalty", () => expect(rules.leavingFloridaPenalty).toBe(500));
  it("uses $6.99 per gallon", () => expect(rules.fuelPerGallon).toBe(6.99));
  it("uses a $20 refueling fee", () => expect(rules.fuelServiceFee).toBe(20));
  it("starts cleaning at $50", () => expect(rules.cleaningStartsAt).toBe(50));
  it("uses $50 for up to 30 minutes late", () => expect([rules.lateFirstMinutes, rules.lateFirstFee]).toEqual([30, 50]));
  it("uses $70 for 31–60 minutes late", () => expect([rules.lateSecondStartMinutes, rules.lateSecondMinutes, rules.lateSecondFee]).toEqual([31, 60, 70]));
  it("uses a 48-hour cancellation boundary", () => expect(rules.cancellationHours).toBe(48));
  it("publishes 75% early cancellation refund", () => expect(rules.earlyRefundPercent).toBe(75));
  it("publishes 40% late cancellation refund", () => expect(rules.lateRefundPercent).toBe(40));
  it("publishes a 100% guarded grace refund", () => expect(rules.graceRefundPercent).toBe(100));
  it("provides no pickup-day refund", () => expect(rules.pickupDayRefundPercent).toBe(0));
  it("provides no no-show refund", () => expect(rules.noShowRefundPercent).toBe(0));
});
describe("24-hour cancellation grace with pickup guard", () => {
  const booked = new Date("2026-11-10T20:00:00Z");
  const after = (hours: number) => new Date(booked.getTime() + hours * 3600000);
  it("allows cancellation across midnight within 24h when pickup remains >24h away", () => expect(qualifiesCancellationGrace(booked, after(12), after(72))).toBe(true));
  it("includes exactly 24h after booking", () => expect(qualifiesCancellationGrace(booked, after(24), after(72))).toBe(true));
  it("excludes cancellation after the 24h window", () => expect(qualifiesCancellationGrace(booked, after(24.01), after(72))).toBe(false));
  it("excludes pickup exactly 24h away at cancellation", () => expect(qualifiesCancellationGrace(booked, after(12), after(36))).toBe(false));
  it("excludes pickup less than 24h away", () => expect(qualifiesCancellationGrace(booked, after(12), after(35))).toBe(false));
  it("excludes last-minute booking with pickup within 24h of booking", () => expect(qualifiesCancellationGrace(booked, after(1), after(23))).toBe(false));
  it("excludes booking with pickup exactly 24h after booking", () => expect(qualifiesCancellationGrace(booked, after(0), after(24))).toBe(false));
  it("excludes pickup-day/no-show after pickup", () => expect(qualifiesCancellationGrace(booked, after(72), after(72))).toBe(false));
});

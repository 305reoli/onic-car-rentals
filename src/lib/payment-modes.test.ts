import { describe, expect, it } from "vitest";
import { dueAtBooking, paymentMode, substituteCapture, substituteDeadline, substituteDiffLabel, substitutePrice, sameSubstituteCategory, substituteExpired } from "./pricing";

describe("payment at booking", () => {
  it("defaults: exotics and sports full, all cars full", () => {
    expect(paymentMode({ body_category: "exotics" }, null)).toBe("full");
    expect(paymentMode({ body_category: "sports" }, null)).toBe("full");
    expect(paymentMode({ body_category: "suv" }, null)).toBe("full");
  });
  it("legacy per-category settings cannot enable partial payment", () => {
    expect(paymentMode({ body_category: "exotics" }, { exotics: "signal" })).toBe("full");
    expect(paymentMode({ body_category: "suv" }, { suv: "full" })).toBe("full");
  });
  it("per-car override beats the category, inherit uses it", () => {
    expect(paymentMode({ body_category: "suv", payment_mode: "full" }, null)).toBe("full");
    expect(paymentMode({ body_category: "exotics", payment_mode: "inherit" }, null)).toBe("full");
  });
  it("full total only, including legacy signal input", () => {
    expect(dueAtBooking({ total: 3961.8, prereservation: 1099 }, "full")).toEqual({ amount: 3961.8, mode: "full" });
    expect(dueAtBooking({ total: 460.08, prereservation: 129 }, "signal")).toEqual({ amount: 460.08, mode: "full" });
    expect(dueAtBooking({ total: null, prereservation: 1099 }, "full") ).toEqual({ amount: 0, mode: "full" });
  });
});

describe("substitution", () => {
  it("more expensive substitute: new total is NOT capped, client pays the extra", () => expect(substitutePrice(1000, 1200)).toEqual({ newTotal: 1200, difference: 200, extra: 200, refund: 0 }));
  it("cheaper substitute refunds the difference", () => expect(substitutePrice(1000, 850.5)).toEqual({ newTotal: 850.5, difference: -149.5, extra: 0, refund: 149.5 }));
  it("same total: no difference", () => expect(substitutePrice(1000, 1000)).toEqual({ newTotal: 1000, difference: 0, extra: 0, refund: 0 }));
  it("admin label wording", () => {
    expect(substituteDiffLabel(200)).toBe("client pays extra $200");
    expect(substituteDiffLabel(-149.5)).toBe("client refund $149.50");
    expect(substituteDiffLabel(0)).toBe("no difference");
  });
  it("full hold: cheaper releases the difference, dearer leaves the extra as on-site balance", () => {
    expect(substituteCapture(1000, 850.5)).toEqual({ capture: 850.5, release: 149.5, balance: 0 });
    expect(substituteCapture(1000, 1200)).toEqual({ capture: 1000, release: 0, balance: 200 });
    expect(substituteCapture(129, 850.5)).toEqual({ capture: 129, release: 0, balance: 721.5 });
  });
  it("deadline = offer + window, or pick-up with explicit acceptance", () => {
    const o = new Date("2027-01-01T10:00:00Z");
    expect(substituteDeadline(o, new Date("2027-01-05T10:00:00Z"), 24)).toEqual({ deadline: new Date("2027-01-02T10:00:00Z"), explicit: true });
    expect(substituteDeadline(o, new Date("2027-01-01T20:00:00Z"), 24)).toEqual({ deadline: new Date("2027-01-01T20:00:00Z"), explicit: true });
  });
});

describe("Stage 1 explicit same-category substitution", () => {
 it("never offers a different category, even higher or cheaper", () => { expect(sameSubstituteCategory("sports", "exotics")).toBe(false); expect(sameSubstituteCategory("sports", "suv")).toBe(false); expect(sameSubstituteCategory("sports", "sports")).toBe(true); });
 it("no response expires exactly after 24 hours, not auto-accept", () => { const o = new Date("2027-01-01T10:00:00Z"); const d = substituteDeadline(o, new Date("2027-02-01"), 24); expect(d.explicit).toBe(true); expect(substituteExpired(new Date("2027-01-02T09:59:59Z"), d.deadline)).toBe(false); expect(substituteExpired(new Date("2027-01-02T10:00:00Z"), d.deadline)).toBe(true); });
});

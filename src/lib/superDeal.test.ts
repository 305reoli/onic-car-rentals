import { describe, expect, it } from "vitest";
import { computeQuote, superDealFor } from "./pricing";

const ORL = { id: "741e5447-248d-43f9-a9f1-92d843f7e342", daily_price_usd: 1199, prereservation_amount_usd: null, body_category: "exotics" };
const MIA = { id: "d6e9309c-87e0-4f72-b2cc-a41b8e6d5cc0", daily_price_usd: 1399, prereservation_amount_usd: null, body_category: "exotics" };
const none = { insurance: false, hotelCheckin: false, luggageCar: false };
const q = (v: typeof ORL, p: string, r: string, booked: string) =>
  computeQuote(v as never, new Date(p), new Date(r), none, undefined, 0, 0, { exotic: true, bookedAt: new Date(booked) });

describe("Orlando Huracán super deal", () => {
  it("eligible December booking charges $990/day", () => {
    const x = q(ORL, "2026-12-10T10:00:00-05:00", "2026-12-12T10:00:00-05:00", "2026-11-17T12:00:00-05:00");
    expect(x.days).toBe(2);
    expect(x.base).toBe(1980);
    expect(x.basicInsurance).toBe(0);
    expect(x.tolls).toBe(0);
    expect(x.solidWaste).toBe(4);
    expect(x.total).toBe(Math.round((1980 + 4) * 1.065 * 100) / 100);
  });
  it("booked on Dec 5 is still eligible; after Dec 5 charges the normal price", () => {
    expect(q(ORL, "2026-12-10T10:00:00-05:00", "2026-12-12T10:00:00-05:00", "2026-12-05T23:30:00-05:00").base).toBe(1980);
    expect(q(ORL, "2026-12-10T10:00:00-05:00", "2026-12-12T10:00:00-05:00", "2026-12-06T00:30:00-05:00").base).toBe(2398);
  });
  it("non-December dates use the normal rate", () => {
    const x = q(ORL, "2027-01-10T10:00:00-05:00", "2027-01-11T10:00:00-05:00", "2026-11-17T12:00:00-05:00");
    expect(x.base).toBe(1199);
  });
  it("mixed Nov/Dec booking: December days at $990, other days at normal rules", () => {
    const x = q(ORL, "2026-11-30T10:00:00-05:00", "2026-12-02T10:00:00-05:00", "2026-11-17T12:00:00-05:00");
    // Nov 30 is a single non-December day (no tier discount for 1 day) + Dec 1 at $990.
    expect(x.rateGroups).toEqual([{ rate: 990, days: 1 }, { rate: 1199, days: 1 }]);
    expect(x.base).toBe(2189);
  });
  it("Miami Huracán is unaffected", () => {
    expect(superDealFor(MIA.id, new Date("2026-11-17T12:00:00-05:00"))).toBeNull();
    expect(q(MIA, "2026-12-10T10:00:00-05:00", "2026-12-12T10:00:00-05:00", "2026-11-17T12:00:00-05:00").base).toBe(2798);
  });
});

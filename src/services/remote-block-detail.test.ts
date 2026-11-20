import { describe, expect, it } from "vitest";
import { remoteBlocks, remoteDays } from "./fleet-sync";

// Car page offers Continue only when no selected day is in the booked-day set (site + SistemaGestao).
const offersContinue = (booked: Set<string>, from: string, to: string) => {
  for (let d = new Date(from + "T00:00:00Z"); d <= new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1))
    if (booked.has(d.toISOString().slice(0, 10))) return false;
  return true;
};
const pacifica = { available: true, ranges: [{ start_at: "2026-11-16T15:00:00+00:00", end_at: "2026-11-27T15:00:00+00:00", reason: "rental_overlap" }] };
const now = new Date("2026-11-15T22:00:00Z");

describe("SistemaGestao rental_overlap on the car detail page", () => {
  it("blocks Continue when pickup/return overlap a stored block", () => {
    expect(offersContinue(remoteDays(pacifica as never, now), "2026-11-16", "2026-11-27")).toBe(false);
    expect(remoteBlocks(pacifica as never, new Date("2026-11-16T15:00:00Z"), new Date("2026-11-27T15:00:00Z"))).toBe(true);
  });
  it("still offers Continue for a car with no overlap", () => {
    expect(offersContinue(remoteDays(null, now), "2026-11-16", "2026-11-19")).toBe(true);
    expect(remoteBlocks(null, new Date("2026-11-16T15:00:00Z"), new Date("2026-11-19T15:00:00Z"))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { BLOCKING_STATUSES, INSTANT_HOLD_MINUTES, UNPAID_HOLD_MINUTES, blockingFilter, rowBlocks, unpaidHoldCutoff } from "@/lib/pricing";
import { CAPTURE_HOURS, resumeLink } from "@/lib/checkoutRecovery";
import { availableModelUnits } from "@/lib/scarcity";

const created = new Date("2026-11-13T12:00:00Z");
const at = (min: number) => new Date(created.getTime() + min * 60000);
// A stale long hold_until (e.g. an old 15-minute or longer window) must not extend the 5-minute cap.
const hold = { status: "checkout_hold", created_at: created.toISOString(), hold_until: at(180).toISOString() };

describe("unpaid checkout availability block (owner: max 5 minutes)", () => {
  it("is 5 minutes and instant holds use the same value", () => {
    expect(UNPAID_HOLD_MINUTES).toBe(5);
    expect(INSTANT_HOLD_MINUTES).toBe(5);
  });
  it("(a) unpaid checkout_hold stops blocking after 5 minutes, even with a longer hold_until", () => {
    expect(rowBlocks(hold, at(5))).toBe(false);
    expect(rowBlocks(hold, at(6))).toBe(false);
  });
  it("(a) unpaid draft never blocks", () => {
    expect(rowBlocks({ status: "draft", created_at: created.toISOString() }, at(1))).toBe(false);
    expect((BLOCKING_STATUSES as readonly string[]).includes("draft")).toBe(false);
  });
  it("(b) the same unpaid hold at 4 minutes still blocks", () => {
    expect(rowBlocks(hold, at(4))).toBe(true);
  });
  it("database filter applies the live 5-minute cutoff", () => {
    expect(unpaidHoldCutoff(at(5)).toISOString()).toBe(created.toISOString());
    expect(blockingFilter(at(5))).toContain(`created_at.gt.${created.toISOString()}`);
  });
  it("(c) abandoned capture/recovery stays valid for 24 hours", () => {
    expect(CAPTURE_HOURS).toBe(24);
  });
  it("(d) paid bookings keep blocking long after 5 minutes", () => {
    for (const status of ["pending_approval", "approved", "confirmed"]) expect(rowBlocks({ status, created_at: created.toISOString() }, at(60 * 48))).toBe(true);
  });
  it("(e) recovery link after expiry re-checks live: car free once hold lapses, taken when a paid booking exists", () => {
    const v = { id: "car", brand: "Ford", model: "Mustang", city: "orlando", active: true, blocked_dates: [] as string[] };
    const p = new Date("2026-11-20T15:00:00Z"), r = new Date("2026-11-23T15:00:00Z");
    const row = { vehicle_id: "car", pickup_at: p.toISOString(), return_at: r.toISOString() };
    expect(availableModelUnits([v], [{ ...row, ...hold }], v, p.toISOString(), r.toISOString(), at(6))).toBe(1);
    expect(availableModelUnits([v], [{ ...row, status: "confirmed" }], v, p.toISOString(), r.toISOString(), at(6))).toBe(0);
    expect(resumeLink({ language: "en", base_city: "orlando", service_city: "orlando", vehicle_slug: "x", pickup_at: row.pickup_at, return_at: row.return_at })).toContain("/checkout/orlando/x");
  });
});

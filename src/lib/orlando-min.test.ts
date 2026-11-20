import { describe, it, expect } from "vitest";
import { locationMinDays, orlandoTooShort, ORLANDO_MIN_DAYS } from "./pricing";

const d = (s: string) => new Date(s);
describe("Orlando 7-day minimum", () => {
  it("Orlando service needs 7 days", () => expect(locationMinDays("orlando")).toBe(7));
  it("Miami has no location minimum", () => expect(locationMinDays("miami")).toBe(0));
  it("6 days to Orlando is blocked", () => expect(orlandoTooShort("orlando", d("2026-12-01T10:00:00Z"), d("2026-12-07T10:00:00Z"))).toBe(true));
  it("7 days to Orlando is allowed", () => expect(orlandoTooShort("orlando", d("2026-12-01T10:00:00Z"), d("2026-12-08T10:00:00Z"))).toBe(false));
  it("3 days in Miami is not affected", () => expect(orlandoTooShort("miami", d("2026-12-01T10:00:00Z"), d("2026-12-04T10:00:00Z"))).toBe(false));
  it("constant is 7", () => expect(ORLANDO_MIN_DAYS).toBe(7));
});

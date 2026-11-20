import { describe, expect, it } from "vitest";
import { isRentalCoverEligible, rentalCoverCardUrl, rentalCoverUrl, type RentalCoverBooking } from "./rentalcover";

const car = { name: "Toyota Corolla", category: "economy", body_category: "sedan" };
const booking: RentalCoverBooking = { status: "pending_approval", captured_at: "2026-11-17T03:00:00Z", paid_amount_usd: 230.04, price_breakdown: { total: 230.04 }, pickup_at: "2026-11-24T04:30:00Z", return_at: "2026-11-27T04:30:00Z", base_city: "orlando" };
const base = "https://affiliate.example/protect";

describe("RentalCover link and visibility", () => {
  it.each(["", "   \n\t", null, undefined])("empty %s produces no URL or card", (link) => {
    expect(rentalCoverUrl(link)).toBeNull();
    expect(rentalCoverCardUrl(link, car, booking)).toBeNull();
  });
  it("keeps a plain link exactly as stored with no appended parameters", () => {
    expect(rentalCoverUrl(base)).toBe(base);
  });
  it("keeps existing affiliate query bytes without appending anything", () => {
    const link = `${base}?affiliate=A%2fb&tracking=x+y`;
    expect(rentalCoverUrl(link)).toBe(link);
  });
  it("preserves escaped URL bytes", () => {
    const link = `${base}/a%2fb?tracking=Miami%20%26%20Orlando`;
    expect(rentalCoverUrl(link)).toBe(link);
  });
  it("keeps fragments unchanged", () => {
    expect(rentalCoverUrl(`${base}?a=1#cover`)).toBe(`${base}?a=1#cover`);
  });
  it("never changes the stored link based on booking dates or destination", () => {
    expect(rentalCoverCardUrl(base, car, booking)).toBe(base);
    expect(rentalCoverCardUrl(base, car, { ...booking, base_city: "miami", pickup_at: "2026-12-10", return_at: "2026-12-13" })).toBe(base);
  });
  it.each(["draft", "checkout_hold", "payment_failed", "paid_conflict", "amount_review", "declined", "expired", "cancelled", "refunded"])("hides card for %s", (status) => {
    expect(rentalCoverCardUrl(base, car, { ...booking, status })).toBeNull();
  });
  it.each(["pending_approval", "approved", "confirmed"])("shows for fully paid %s", (status) => {
    expect(rentalCoverCardUrl(base, car, { ...booking, status })).not.toBeNull();
  });
  it("hides absent payment evidence, insufficient payment and refunds", () => {
    expect(rentalCoverCardUrl(base, car, { ...booking, captured_at: null })).toBeNull();
    expect(rentalCoverCardUrl(base, car, { ...booking, paid_amount_usd: 1 })).toBeNull();
    expect(rentalCoverCardUrl(base, car, { ...booking, refunded_at: "2026-11-18" })).toBeNull();
  });
  it("hides unsafe links without requiring unsupported prefill context", () => {
    expect(rentalCoverCardUrl("javascript:alert(1)", car, booking)).toBeNull();
    expect(rentalCoverCardUrl("not a URL", car, booking)).toBeNull();
    expect(rentalCoverCardUrl(base, car, { ...booking, base_city: null })).toBe(base);
    expect(rentalCoverCardUrl(base, car, { ...booking, pickup_at: "invalid" })).toBe(base);
  });
});

describe("RentalCover regular-only eligibility", () => {
  it("allows economy Corolla", () => expect(isRentalCoverEligible(car)).toBe(true));
  it("allows family car", () => expect(isRentalCoverEligible({ name: "Chrysler Pacifica", category: "family", body_category: "suv" })).toBe(true));
  it.each(["Cadillac ESCALADE", "Chevrolet CorVeTTe"])("excludes %s even with regular categories", (name) => expect(isRentalCoverEligible({ ...car, name })).toBe(false));
  it.each(["luxury", "luxury_suv", "sport", "sports", "exotic", "exotics", "convertible"])("excludes %s in either category field", (premium) => {
    expect(isRentalCoverEligible({ ...car, category: premium })).toBe(false);
    expect(isRentalCoverEligible({ ...car, body_category: premium })).toBe(false);
  });
  it.each([null, "", "unknown", "unrecognised", "sedan", "suv"])("excludes missing/unrecognised internal category %s", (category) => expect(isRentalCoverEligible({ ...car, category })).toBe(false));
  it("fails closed on absent vehicle/name, unknown public category or convertible flag", () => {
    expect(isRentalCoverEligible(null)).toBe(false);
    expect(isRentalCoverEligible({ name: "Toyota Corolla", body_category: "sedan" })).toBe(false);
    expect(isRentalCoverEligible({ category: "economy" })).toBe(false);
    expect(isRentalCoverEligible({ ...car, body_category: "unknown" })).toBe(false);
    expect(isRentalCoverEligible({ ...car, is_convertible: true })).toBe(false);
  });
});
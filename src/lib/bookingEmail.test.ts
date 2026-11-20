import { describe, expect, it } from "vitest";
import { bookingNotificationEmail, emailPerkAllowed, ownerBookingSubject } from "./bookingEmail";

describe("booking email rules", () => {
  it("defaults owner notifications to Proprietario's current inbox", () => {
    expect(bookingNotificationEmail(undefined)).toBe("info@oniccarrentals.com");
    expect(bookingNotificationEmail(" ")).toBe("info@oniccarrentals.com");
    expect(bookingNotificationEmail("not-an-email")).toBe("info@oniccarrentals.com");
  });
  it("uses the admin's dedicated address after it is configured", () => {
    expect(bookingNotificationEmail(" bookings@example.com ")).toBe("bookings@example.com");
  });
  const paid = { status: "approved", captured_at: "2026-11-08", prereservation_amount_usd: 500, price_breakdown: { total: 500 } };
  it("uses the owner's requested new booking subject pattern", () => {
    expect(ownerBookingSubject("BMW X3", "Nov 12–18", "Test Customer")).toBe("Nova reserva — BMW X3 · Nov 12–18 · Test Customer");
  });
  it("allows ONIC10 only in final fully paid confirmation", () => {
    expect(emailPerkAllowed("customer_confirmed", paid)).toBe(true);
    expect(emailPerkAllowed("customer_approved", paid)).toBe(false);
    expect(emailPerkAllowed("customer_received", paid)).toBe(false);
    expect(emailPerkAllowed("customer_confirmed", { ...paid, prereservation_amount_usd: 75 })).toBe(false);
    expect(emailPerkAllowed("customer_confirmed", { ...paid, status: "pending_approval" })).toBe(false);
    expect(emailPerkAllowed("customer_confirmed", { ...paid, refunded_at: "2026-11-08" })).toBe(false);
  });
});
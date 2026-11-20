import { describe, expect, it } from "vitest";
import { bookingNotificationEmail, ownerBookingSubject } from "./bookingEmail";

describe("booking email rules", () => {
  it("defaults owner notifications to Proprietario's current inbox", () => {
    expect(bookingNotificationEmail(undefined)).toBe("info@oniccarrentals.com");
    expect(bookingNotificationEmail(" ")).toBe("info@oniccarrentals.com");
    expect(bookingNotificationEmail("not-an-email")).toBe("info@oniccarrentals.com");
  });
  it("uses the admin's dedicated address after it is configured", () => {
    expect(bookingNotificationEmail(" bookings@example.com ")).toBe("bookings@example.com");
  });
  it("uses the owner's requested new booking subject pattern", () => {
    expect(ownerBookingSubject("BMW X3", "Nov 12–18", "Test Customer")).toBe("Nova reserva — BMW X3 · Nov 12–18 · Test Customer");
  });
});
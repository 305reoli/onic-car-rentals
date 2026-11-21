import { describe, expect, it } from "vitest";
import { directionsUrl, submittedBooking } from "./launch";
import { orgJsonLd } from "./seo";
import { publicPath } from "./publicRoutes";

describe("launch booking confirmation", () => {
  it("allows only submitted bookings, never an unpaid or failed checkout", () => {
    for (const status of ["pending_approval", "approved", "confirmed"]) expect(submittedBooking(status)).toBe(true);
    for (const status of ["checkout_hold", "payment_failed", "expired", "declined", "amount_review", "paid_conflict"]) expect(submittedBooking(status)).toBe(false);
  });
  it("keeps private thank-you URLs out of Portuguese marketing rewrites", () => {
    expect(publicPath("pt", "thank-you/test-token")).toBe("/pt/thank-you/test-token");
  });
});
describe("confirmed local business facts", () => {
  it("uses the Miami address in the rental business schema", () => {
    expect(orgJsonLd([]).address).toEqual({ "@type": "PostalAddress", streetAddress: "1000 Lincoln Rd", addressLocality: "Miami Beach", addressRegion: "FL", postalCode: "33139", addressCountry: "US" });
  });
  it("uses the confirmed Orlando address for directions", () => {
    const url = new URL(directionsUrl("5461 Hazeltine National Dr, Orlando, FL 32812"));
    expect(url.searchParams.get("destination")).toBe("5461 Hazeltine National Dr, Orlando, FL 32812");
  });
});
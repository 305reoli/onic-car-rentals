import { expect, it } from "vitest";
import { CAPTURE_HOURS, recoveryDue, resumeLink } from "./checkoutRecovery";
const row = { status: "pending_payment", created_at: "2026-11-09T00:00:00Z", expires_at: "2026-11-10T00:00:00Z" };
it("expires captures after 24 hours", () => { expect(CAPTURE_HOURS).toBe(24); expect(recoveryDue(row, new Date(row.expires_at))).toBe(false); });
it("sends at most once and not before two hours", () => {
  expect(recoveryDue(row, new Date("2026-11-09T01:59:00Z"))).toBe(false);
  expect(recoveryDue(row, new Date("2026-11-09T02:00:00Z"))).toBe(true);
  expect(recoveryDue({ ...row, recovery_attempted_at: "2026-11-09T02:00:00Z" }, new Date("2026-11-09T03:00:00Z"))).toBe(false);
});
it("excludes completed payments", () => { expect(recoveryDue({ ...row, status: "completed" }, new Date("2026-11-09T03:00:00Z"))).toBe(false); });
it("resume links open fresh dated checkouts, never old bookings", () => {
  const link = new URL(resumeLink({ language: "en", base_city: "orlando", service_city: "orlando", vehicle_slug: "land-rover-defender", pickup_at: "2026-12-08T15:00:00Z", return_at: "2026-12-11T15:00:00Z" }));
  expect(link.pathname).toBe("/en/checkout/orlando/land-rover-defender"); expect(link.searchParams.get("pickup")).toBe("2026-12-08T15:00:00Z"); expect(link.searchParams.has("token")).toBe(false);
});it("resume links use the real checkout route for every language", () => {
  const base = { base_city: "miami", service_city: "miami", vehicle_slug: "ford-new-mustang", pickup_at: "2026-12-08T15:00:00Z", return_at: "2026-12-11T15:00:00Z" };
  expect(resumeLink({ ...base, language: "pt" }, "https://x.test")).toBe("https://x.test/pt/checkout/miami/ford-new-mustang?city=miami&pickup=2026-12-08T15%3A00%3A00Z&ret=2026-12-11T15%3A00%3A00Z");
  expect(new URL(resumeLink({ ...base, language: "es" })).pathname).toBe("/es/checkout/miami/ford-new-mustang");
});
it("old /cars/{slug}-{city}/checkout links redirect to the working checkout with query kept", async () => {
  const { legacyCheckoutRedirect } = await import("./checkoutRecovery");
  expect(legacyCheckoutRedirect("/cars/ford-new-mustang-miami/checkout", "?pickup=2026-12-08T15:00:00Z&ret=2026-12-11T15:00:00Z")).toBe("/en/checkout/miami/ford-new-mustang?pickup=2026-12-08T15%3A00%3A00Z&ret=2026-12-11T15%3A00%3A00Z&city=miami");
  expect(legacyCheckoutRedirect("/pt/cars/toyota-corolla-orlando/checkout/", "")).toBe("/pt/checkout/orlando/toyota-corolla?city=orlando");
  expect(legacyCheckoutRedirect("/en/cars/miami/ford-new-mustang", "")).toBeNull();
});

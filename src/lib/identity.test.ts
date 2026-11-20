import { describe, expect, it } from "vitest";
import { docMode, documentsComplete, identityAdminState, identityFromReport, identityPayload, requiredUploads, storedDocsComplete } from "./identity";
import { checkoutInvalidFields } from "./checkoutValidation";
import { buildIntakePayload } from "@/services/sistemagestao-payload";

const base = { driver: {}, pickup: { city: "miami", type: "pickup" }, ret: { city: "miami", type: "pickup" }, same: true, pickupAt: new Date(), minAge: 21, askClient: false, clientType: null, babySeat: false, hotelCheckin: false, hotel: { hotelName: "", hotelAddress: "", arrivalTime: "" }, luggageCar: false, luggage: { pickupPoint: "MCO", pickupAddress: "", deliveryAddress: "", pickupTime: "" }, paymentReady: false, docBusy: {}, accepted: false } as never as Parameters<typeof checkoutInvalidFields>[1];
const all = { licenseFront: "a", licenseBack: "b", passport: "c" };

describe("(a) Brazil path unchanged", () => {
  it("requires license front, back and passport, and never needs Stripe", () => {
    expect(docMode("Brazil")).toBe("brazil");
    expect(requiredUploads("brazil")).toEqual(["licenseFront", "licenseBack", "passport"]);
    expect(documentsComplete("brazil", all, null)).toBe(true);
    expect(documentsComplete("brazil", { licenseFront: "a", licenseBack: "b" }, null)).toBe(false);
    expect(checkoutInvalidFields(1, { ...base, uploaded: {}, licenseCountry: "Brazil" })).toEqual(["licenseFront", "licenseBack", "passport"]);
    expect(checkoutInvalidFields(1, { ...base, uploaded: all, licenseCountry: "Brazil" })).toEqual([]);
  });
});

describe("(b) non-Brazil shows verification; passport only for non-USA", () => {
  it("USA: verification, no passport field", () => {
    expect(docMode("United States")).toBe("stripe_us");
    expect(requiredUploads("stripe_us")).toEqual([]);
  });
  it("Portugal: verification plus passport field", () => {
    expect(docMode("Portugal")).toBe("stripe_foreign");
    expect(requiredUploads("stripe_foreign")).toEqual(["passport"]);
  });
  it("no country chosen yet blocks with the country field", () => {
    expect(docMode("")).toBeNull();
    expect(checkoutInvalidFields(1, { ...base, uploaded: all, licenseCountry: "" })).toEqual(["licenseCountry"]);
  });
});

describe("(c) gating to Terms/Payment", () => {
  for (const st of [null, "pending", "needs_attention", "canceled"]) it(`blocks while ${st} (not submitted)`, () => {
    expect(documentsComplete("stripe_us", {}, st)).toBe(false);
    expect(checkoutInvalidFields(1, { ...base, uploaded: {}, licenseCountry: "United States", identityStatus: st })).toContain("identity");
  });
  it("allows a SUBMITTED identity still processing (non-blocking), required uploads still required", () => {
    expect(documentsComplete("stripe_us", {}, "processing")).toBe(true);
    expect(checkoutInvalidFields(1, { ...base, uploaded: {}, licenseCountry: "United States", identityStatus: "processing" })).toEqual([]);
    expect(documentsComplete("stripe_foreign", {}, "processing")).toBe(false);
    expect(documentsComplete("stripe_foreign", { passport: "p" }, "processing")).toBe(true);
    expect(documentsComplete("brazil", { licenseFront: "a", licenseBack: "b" }, null)).toBe(false);
  });
  it("server check accepts a booking carrying a PENDING or FAILED stripe identity (surfaced in admin)", () => {
    const pend = { provider: "stripe", session_id: "vs_x", status: "pending", verified_at: null, license_country: "United States" };
    expect(storedDocsComplete({}, pend)).toBe(true);
    expect(storedDocsComplete({}, { ...pend, status: "failed", license_country: "Portugal" })).toBe(false);
    expect(storedDocsComplete({ passport: "p" }, { ...pend, status: "failed", license_country: "Portugal" })).toBe(true);
    expect(storedDocsComplete({}, { ...pend, status: "requires_input" })).toBe(false);
    expect(identityAdminState(pend)).toBe("pending");
  });
  it("allows when verified (USA no files; Portugal needs passport)", () => {
    expect(documentsComplete("stripe_us", {}, "verified")).toBe(true);
    expect(checkoutInvalidFields(1, { ...base, uploaded: {}, licenseCountry: "United States", identityStatus: "verified" })).toEqual([]);
    expect(documentsComplete("stripe_foreign", {}, "verified")).toBe(false);
    expect(documentsComplete("stripe_foreign", { passport: "p" }, "verified")).toBe(true);
  });
  it("server-side stored check mirrors the gate", () => {
    const idv = identityFromReport({ sessionId: "vs_123456789", licenseCountry: "Portugal", verifiedAt: "2026-11-14T15:00:00.000Z", report: { document: {} } });
    expect(storedDocsComplete({}, idv)).toBe(false);
    expect(storedDocsComplete({ passport: "p" }, idv)).toBe(true);
    expect(storedDocsComplete({}, { ...idv, license_country: "United States" })).toBe(true);
    expect(storedDocsComplete({}, { ...idv, status: "requires_input" })).toBe(false);
    expect(storedDocsComplete(all, null)).toBe(true);
  });
});

describe("(d) SistemaGestao payload", () => {
  const booking = {
    id: "11111111-1111-4111-8111-111111111111", first_name: "A", last_name: "B", email: "a@b.co", phone: "+1 555", vehicle_name: "Car", service_city: "miami", base_city: "miami",
    pickup_at: "2026-11-20T15:00:00.000Z", return_at: "2026-11-24T15:00:00.000Z", payment_provider: "stripe",
    price_breakdown: { base: 100, dailyRate: 25, days: 4, subtotal: 100, tax: 6.5, total: 106.5, taxRate: 6.5, customFees: [] },
  };
  const idv = identityFromReport({ sessionId: "vs_abcdefgh123", licenseCountry: "Portugal", verifiedAt: "2026-11-14T15:00:00.000Z", report: { document: { first_name: "Ana", last_name: "Silva", number: "PT123", issuing_country: "PT", dob: { day: 2, month: 3, year: 1990 }, expiration_date: { day: 1, month: 12, year: 2030 } } } });
  it("verified payload carries exactly the identity_verification fields", () => {
    const p = buildIntakePayload({ ...booking, identity_verification: idv }, null) as Record<string, unknown>;
    expect(p["identity_verification"]).toEqual({ provider: "stripe", session_id: "vs_abcdefgh123", status: "verified", verified_at: "2026-11-14T15:00:00.000Z", document_country: "PT", document_number: "PT123", document_expiry: "2030-12-01", dob: "1990-03-02", first_name: "Ana", last_name: "Silva" });
    expect(identityPayload(idv)).toEqual(p["identity_verification"]);
  });
  it("Brazil payload has no identity_verification and totals are unchanged", () => {
    const br = buildIntakePayload(booking, null) as Record<string, unknown>;
    const ver = buildIntakePayload({ ...booking, identity_verification: idv }, null) as Record<string, unknown>;
    expect("identity_verification" in br).toBe(false);
    const { identity_verification: _x, ...rest } = ver;
    expect(rest).toEqual(br);
  });
});

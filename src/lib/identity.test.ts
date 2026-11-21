import { describe, expect, it } from "vitest";
import { docMode, documentsComplete, identityAdminState, identityFromReport, requiredUploads, storedDocsComplete } from "./identity";
import { checkoutInvalidFields } from "./checkoutValidation";

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


import { describe, it, expect, vi } from "vitest";
import { insuranceText } from "./i18n";
import { checkoutInvalidFields, type CheckoutValidationInput } from "./checkoutValidation";
import { composeInsuranceDenialEmail, initialInsurance, insuranceClass, insuranceTransition } from "./insurance";
import { createSchema, docsRow } from "@/services/booking-schema";
import { setInsuranceStatus, type InsuranceDeps } from "@/services/insurance.server";
const folder = "uploads/11111111-1111-4111-8111-111111111111";

const keys = (o: unknown, p = ""): string[] => typeof o === "object" && o && !Array.isArray(o) ? Object.entries(o).flatMap(([k, v]) => keys(v, `${p}${k}.`)) : Array.isArray(o) ? o.map((_, i) => `${p}${i}`) : [p];
describe("insurance i18n", () => {
  it("EN/PT/ES have identical, non-empty keys", () => {
    const en = keys(insuranceText.en).sort();
    for (const l of ["pt", "es"] as const) expect(keys(insuranceText[l]).sort()).toEqual(en);
    for (const l of ["en", "pt", "es"] as const) for (const s of JSON.stringify(insuranceText[l]).match(/"[^"]*"/g) ?? []) expect(s).not.toBe('""');
  });
  it("uses the owner's headings", () => {
    expect(insuranceText.en.title).toBe("Add your own insurance");
    expect(insuranceText.pt.title).toBe("Insira o seu seguro");
  });
});

const base = (): CheckoutValidationInput => ({ driver: {}, pickup: { city: "orlando", type: "airport" }, ret: { city: "orlando", type: "airport" }, same: true, pickupAt: new Date(), minAge: 21, askClient: false, clientType: null, babySeat: false, hotelCheckin: false, hotel: { hotelName: "", hotelAddress: "", arrivalTime: "" }, luggageCar: false, luggage: { pickupPoint: "MCO", pickupAddress: "", deliveryAddress: "", pickupTime: "" }, paymentReady: false, uploaded: { licenseFront: "a", licenseBack: "b", passport: "c" }, docBusy: {}, accepted: false, licenseCountry: "Brazil" });
describe("checkout validation never requires insurance", () => {
  it("passes with no choice, Onic coverage, or an uploaded file", () => {
    expect(checkoutInvalidFields(1, base())).toEqual([]);
    const withFile = base(); withFile.uploaded = { ...withFile.uploaded, insurancePolicy: `${folder}/insurancePolicy.pdf` };
    expect(checkoutInvalidFields(1, withFile)).toEqual([]);
    const us = base(); us.licenseCountry = "United States"; us.identityStatus = "processing" as never;
    expect(checkoutInvalidFields(1, us).filter((f) => f.startsWith("insurance"))).toEqual([]);
    expect(initialInsurance("ben", undefined)).toEqual({ insurance_choice: "ben", insurance_status: null });
    expect(initialInsurance(undefined, undefined)).toEqual({ insurance_choice: null, insurance_status: null });
    expect(initialInsurance("own", `${folder}/insurancePolicy.pdf`)).toEqual({ insurance_choice: "own", insurance_status: "pending_review" });
  });
  it("booking documents accept an optional insurance path and store it", () => {
    const d = { folder, licenseFront: `${folder}/licenseFront.png`, licenseBack: `${folder}/licenseBack.png`, passport: `${folder}/passport.png` };
    const shape = createSchema.shape.documents;
    expect(shape.safeParse(d).success).toBe(true);
    expect(shape.safeParse({ ...d, insurancePolicy: `${folder}/insurancePolicy.pdf` }).success).toBe(true);
    expect(shape.safeParse({ ...d, insurancePolicy: `${folder}/insurancePolicy.exe` }).success).toBe(false);
    expect(docsRow({ ...d, insurancePolicy: `${folder}/insurancePolicy.pdf` })).toMatchObject({ insurancePolicy: `${folder}/insurancePolicy.pdf` });
  });
});

describe("admin insurance status", () => {
  it("transitions and requires a reason for Denied", () => {
    expect(insuranceTransition({ hasFile: true, status: "pending_review" }, "verified")).toEqual({ status: "verified", reason: null });
    expect(() => insuranceTransition({ hasFile: true, status: "pending_review" }, "denied")).toThrow("REASON_REQUIRED");
    expect(insuranceTransition({ hasFile: true, status: "verified" }, "denied", "deductible_too_high")).toEqual({ status: "denied", reason: "deductible_too_high" });
    expect(() => insuranceTransition({ hasFile: false, status: null }, "verified")).toThrow("NO_INSURANCE_FILE");
  });
  it("picks the minimums row from the car category", () => {
    expect(insuranceClass({ body_category: "sedan" })).toBe("regular");
    expect(insuranceClass({ body_category: "luxury" })).toBe("luxury");
    expect(insuranceClass({ body_category: "sports" })).toBe("sports");
    expect(insuranceClass({ body_category: "exotics" })).toBe("exotics");
  });
  it("denial email contains the chosen reason and the minimums table", () => {
    const m = composeInsuranceDenialEmail("en", { id: "abcdef12-0000", first_name: "Ana", vehicle_name: "Cadillac Escalade" }, "liability_below_minimum", "luxury");
    expect(m.html).toContain("Liability below the minimum");
    for (const k of ["regular", "luxury", "sports", "exotics"] as const) expect(m.html).toContain(insuranceText.en.rows[k][1].replace("'", "&#39;"));
    expect(m.html).toContain("Liability 10/10 (US$10k per person / US$10k per accident) + property damage US$10k");
    expect(m.html).toContain("Liability 100/300");
    expect(m.html).toContain(insuranceText.en.always);
    const pt = composeInsuranceDenialEmail("pt", { id: "abcdef12-0000", first_name: "Ana", vehicle_name: "X" }, "not_active", "regular");
    expect(pt.html).toContain("Apólice não vigente nas datas da locação");
  });
  const deps = (status: "pending_review" | "verified" = "pending_review") => {
    const send = vi.fn(async () => ({ id: "re_1" })), save = vi.fn(async () => undefined), log = vi.fn(async () => undefined);
    const d: InsuranceDeps = { load: async () => ({ id: "11111111-1111-4111-8111-111111111111", email: "ana@example.com", first_name: "Ana", vehicle_name: "Toyota Corolla", language: "es", documents: { insurancePolicy: `${folder}/insurancePolicy.pdf` }, insurance_status: status, vehicle: { body_category: "sedan" } }), save, send, log, now: () => new Date("2026-11-15T00:00:00Z") };
    return { d, send, save, log };
  };
  it("Denied persists the status and emails the renter once with the reason (mocked sender)", async () => {
    const { d, send, save } = deps();
    expect(await setInsuranceStatus(d, "x", "denied", "missing_collision_comprehensive")).toEqual({ ok: true, emailed: true });
    expect(save).toHaveBeenCalledWith("x", { insurance_status: "denied", insurance_denial_reason: "missing_collision_comprehensive", insurance_reviewed_at: "2026-11-15T00:00:00.000Z" });
    expect(send).toHaveBeenCalledTimes(1);
    const arg = (send.mock.calls[0] as unknown as [{ to: string; html: string }])[0];
    expect(arg.to).toBe("ana@example.com");
    expect(arg.html).toContain(insuranceText.es.reasons.missing_collision_comprehensive);
    expect(arg.html).toContain(insuranceText.es.minTitle);
  });
  it("Verified persists without emailing", async () => {
    const { d, send, save } = deps();
    expect(await setInsuranceStatus(d, "x", "verified")).toEqual({ ok: true, emailed: false });
    expect(save).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });
});

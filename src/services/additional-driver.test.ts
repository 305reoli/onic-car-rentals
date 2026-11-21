import { describe, it, expect } from "vitest";
import { additionalDriverSchema, docsInFolder, docsRow } from "./booking-schema";
import { computeQuote } from "@/lib/pricing";

const folder = "uploads/22222222-2222-4222-8222-222222222222";
const primary = { folder, licenseFront: `${folder}/licenseFront.jpg`, licenseBack: `${folder}/licenseBack.jpg`, passport: `${folder}/passport.jpg` };
const addl = { fullName: "Alex Smith", licenseFront: `${folder}/addLicenseFront.jpg`, licenseBack: `${folder}/addLicenseBack.jpg`, passport: `${folder}/addPassport.png` };
describe("locally stored additional driver", () => {
  it("stores no additional driver when unchecked", () => {
    expect(docsRow(primary)).not.toHaveProperty("additionalDriver");
  });
  it("preserves the name and all three private document paths when checked", () => {
    expect(docsRow({ ...primary, additionalDriver: addl })).toMatchObject({ additionalDriver: addl });
    expect(docsInFolder({ ...primary, additionalDriver: addl })).toBe(true);
  });
  it("requires a name of 2–120 characters and three JPEG/PNG documents inside the checkout folder", () => {
    expect(additionalDriverSchema.safeParse({ ...addl, fullName: "A" }).success).toBe(false);
    expect(additionalDriverSchema.safeParse({ ...addl, fullName: "x".repeat(121) }).success).toBe(false);
    const { passport: _passport, ...incomplete } = addl;
    expect(additionalDriverSchema.safeParse(incomplete).success).toBe(false);
    expect(additionalDriverSchema.safeParse({ ...addl, licenseFront: `${folder}/addLicenseFront.heic` }).success).toBe(false);
    expect(docsInFolder({ ...primary, additionalDriver: { ...addl, passport: "uploads/33333333-3333-4333-8333-333333333333/addPassport.png" } })).toBe(false);
  });
  it("does not charge for the first additional driver", () => {
    const quote = computeQuote({ daily_price_usd: 150, prereservation_amount_usd: null }, new Date("2026-12-03T10:00:00Z"), new Date("2026-12-07T10:00:00Z"), { insurance: false, hotelCheckin: false, luggageCar: false }, undefined, 0, 0, { exotic: false });
    expect(quote.base).toBe(600);
    expect(quote.total).toBe(711.42);
  });
});

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Blob as ServerBlob } from "node:buffer";
const Blob = ServerBlob as unknown as typeof globalThis.Blob;
import { readAdditionalDriver, readIntakeDocuments } from "./sistemagestao-documents.server";
import { additionalDriverSchema, docsInFolder, docsRow } from "./booking-schema";
import { computeQuote } from "@/lib/pricing";

const folder = "uploads/22222222-2222-4222-8222-222222222222";
const primary = { folder, licenseFront: `${folder}/licenseFront.jpg`, licenseBack: `${folder}/licenseBack.jpg`, passport: `${folder}/passport.jpg` };
const addl = { fullName: "Alex Smith", licenseFront: `${folder}/addLicenseFront.jpg`, licenseBack: `${folder}/addLicenseBack.jpg`, passport: `${folder}/addPassport.png` };
const blob = async (p: string) => new Blob(["abc"], { type: p.endsWith(".png") ? "image/png" : "image/jpeg" });
const P = new Date("2026-11-03T10:00:00Z"), R = new Date("2026-11-07T10:00:00Z");
const none = { insurance: false, hotelCheckin: false, luggageCar: false };

describe("additional driver", () => {
  it("(a) unchecked: stored row and SistemaGestao payload have NO additional_driver; total unchanged", async () => {
    const row = docsRow(primary);
    expect("additionalDriver" in row).toBe(false);
    expect(await readAdditionalDriver(row, vi.fn())).toBeUndefined();
    expect((await readIntakeDocuments(row, blob)).map(d => d.kind)).toEqual(["license_front", "license_back", "passport"]);
  });
  it("(b) checked: additional_driver has full_name and exactly license_front, license_back, passport", async () => {
    const row = docsRow({ ...primary, additionalDriver: addl });
    const primaryDocs = await readIntakeDocuments(row, blob); // primary array stays separate
    expect(primaryDocs.map(d => d.kind)).toEqual(["license_front", "license_back", "passport"]);
    const a = await readAdditionalDriver(row, blob);
    expect(a?.full_name).toBe("Alex Smith");
    expect(a?.documents.map(d => d.kind).sort()).toEqual(["license_back", "license_front", "passport"]);
    for (const d of a?.documents ?? []) {
      expect(Object.keys(d).sort()).toEqual(["content_type", "data_base64", "filename", "kind", "sha256", "size_bytes"]);
      expect(d.data_base64).toBe("YWJj"); expect(d.data_base64.startsWith("data:")).toBe(false); expect(d.size_bytes).toBe(3);
      expect(["image/jpeg", "image/png"]).toContain(d.content_type);
    }
  });
  it("(b) requires name 2–120 chars and all three JPEG/PNG documents", async () => {
    expect(additionalDriverSchema.safeParse({ ...addl, fullName: "A" }).success).toBe(false);
    expect(additionalDriverSchema.safeParse({ ...addl, fullName: "x".repeat(121) }).success).toBe(false);
    expect(additionalDriverSchema.safeParse({ ...addl, passport: undefined }).success).toBe(false);
    expect(additionalDriverSchema.safeParse({ ...addl, licenseFront: `${folder}/addLicenseFront.heic` }).success).toBe(false);
    expect(docsInFolder({ ...primary, additionalDriver: { ...addl, passport: "uploads/33333333-3333-4333-8333-333333333333/addPassport.png" } })).toBe(false);
    await expect(readAdditionalDriver({ additionalDriver: { fullName: "Alex Smith", licenseFront: addl.licenseFront } }, blob)).rejects.toThrow("Missing additional driver document");
  });
  it("25 MiB limit is combined across both drivers", async () => {
    const big = async () => new Blob([new Uint8Array(5 * 1024 * 1024)], { type: "image/jpeg" });
    const row = docsRow({ ...primary, additionalDriver: { ...addl, passport: `${folder}/addPassport.jpg` } });
    const counter = { total: 0 };
    await readIntakeDocuments(row, big, counter);
    await expect(readAdditionalDriver(row, big, counter)).rejects.toThrow("25 MB total");
  });
  it("(c) first additional driver adds no price or price line", () => {
    const q = computeQuote({ daily_price_usd: 150, prereservation_amount_usd: null }, P, R, none, undefined, 0, 0, { exotic: false });
    expect(JSON.stringify(q).toLowerCase()).not.toMatch(/driver/);
    const src = readFileSync("src/lib/pricing.ts", "utf8");
    expect(src).not.toMatch(/additional.?driver/i);
  });
  it("(d) main-driver step no longer offers the loose second-license slot; legacy secondLicense still maps", async () => {
    const route = readFileSync("src/routes/$lang.checkout.$city.$slug.tsx", "utf8");
    expect(route).not.toMatch(/"passport", "secondLicense"\]/);
    expect(route).not.toMatch(/secondLicense: uploaded/);
    const legacy = await readIntakeDocuments({ ...docsRow(primary), secondLicense: `${folder}/secondLicense.jpg` }, blob);
    expect(legacy.map(d => d.kind)).toContain("second_license");
  });
});

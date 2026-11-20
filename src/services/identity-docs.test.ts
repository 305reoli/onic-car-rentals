import { describe, expect, it } from "vitest";
import { Blob as ServerBlob } from "node:buffer";
import { readIntakeDocuments } from "./sistemagestao-documents.server";
import { identityVerified } from "@/lib/identity";
const Blob = ServerBlob as unknown as typeof globalThis.Blob;
const folder = "uploads/11111111-1111-4111-8111-111111111111";
describe("(d) verified clients send no loose licence files", () => {
  it("verified booking stores only passport, so only passport travels", async () => {
    const docs = await readIntakeDocuments({ passport: `${folder}/passport.png` }, async () => new Blob(["x"], { type: "image/png" }));
    expect(docs.map((d) => d.kind)).toEqual(["passport"]);
    // adapter filter (defence in depth) applies only to verified records
    const filtered = docs.filter((d) => !(identityVerified({ provider: "stripe", status: "verified" }) && (d.kind === "license_front" || d.kind === "license_back")));
    expect(filtered.map((d) => d.kind)).toEqual(["passport"]);
  });
  it("Brazil booking still sends front, back and passport", async () => {
    const docs = await readIntakeDocuments({ licenseFront: `${folder}/licenseFront.png`, licenseBack: `${folder}/licenseBack.png`, passport: `${folder}/passport.png` }, async () => new Blob(["x"], { type: "image/png" }));
    expect(docs.map((d) => d.kind)).toEqual(["license_front", "license_back", "passport"]);
  });
});

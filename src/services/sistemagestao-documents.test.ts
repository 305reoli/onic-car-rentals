import { describe, it, expect, vi } from "vitest";
import { Blob as ServerBlob } from "node:buffer";
const Blob = ServerBlob as unknown as typeof globalThis.Blob;
import { readIntakeDocuments, DOCUMENT_FILE_LIMIT, DOCUMENT_TOTAL_LIMIT } from "./sistemagestao-documents.server";
const folder = "uploads/11111111-1111-4111-8111-111111111111";
const paths = { licenseFront: `${folder}/licenseFront.png`, licenseBack: `${folder}/licenseBack.png`, passport: `${folder}/passport.png`, secondLicense: `${folder}/secondLicense.png` };
describe("private SistemaGestao documents", () => {
  it("reads all actual checkout fields and sends complete base64 with exact SHA256 and metadata", async () => {
    const result = await readIntakeDocuments(paths, async () => new Blob(["abc"], { type: "image/png" }));
    expect(result.map(x => x.kind)).toEqual(["license_front", "license_back", "passport", "second_license"]);
    expect(result[0]).toEqual({ kind: "license_front", filename: "license-front.png", content_type: "image/png", size_bytes: 3, data_base64: "YWJj", sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" });
    expect(atob(result[2]?.data_base64 ?? "")).toBe("abc");
  });
  it("sends every kind snake_case, including second_license for the second driver's license", async () => {
    const result = await readIntakeDocuments(paths, async () => new Blob(["abc"], { type: "image/png" }));
    for (const doc of result) expect(doc.kind).toMatch(/^[a-z_]+$/);
    expect(result.find(x => x.kind === "second_license")?.filename).toBe("second-license.png");
    expect(result.some(x => x.kind === "secondLicense")).toBe(false);
  });
  it("sends no documents normally for an empty booking", async () => {
    const download = vi.fn();
    expect(await readIntakeDocuments({}, download)).toEqual([]);
    expect(await readIntakeDocuments(null, download)).toEqual([]);
    expect(download).not.toHaveBeenCalled();
  });
  it("rejects public URLs and mismatched checkout slots without fetching", async () => {
    const download = vi.fn();
    await expect(readIntakeDocuments({ passport: "https://example.com/passport.png" }, download)).rejects.toThrow("Invalid private document path");
    await expect(readIntakeDocuments({ passport: paths.licenseFront }, download)).rejects.toThrow();
    expect(download).not.toHaveBeenCalled();
  });
  it("rejects above exactly 10 MB per file", async () => {
    expect(DOCUMENT_FILE_LIMIT).toBe(10 * 1024 * 1024);
    await expect(readIntakeDocuments({ passport: paths.passport }, async () => new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "image/png" }))).rejects.toThrow("exceeds 10 MB");
  });
  it("rejects above exactly 25 MB total, never returning a partial result", async () => {
    expect(DOCUMENT_TOTAL_LIMIT).toBe(25 * 1024 * 1024);
    await expect(readIntakeDocuments(paths, async () => new Blob([new Uint8Array(9 * 1024 * 1024)], { type: "image/png" }))).rejects.toThrow("25 MB total");
  });
  it("rejects empty files", async () => {
    await expect(readIntakeDocuments({ passport: paths.passport }, async () => new Blob([]))).rejects.toThrow("Empty document");
  });
  it("rejects download failures and type mismatches", async () => {
    await expect(readIntakeDocuments(paths, async () => { throw new Error("download failed"); })).rejects.toThrow("download failed");
    await expect(readIntakeDocuments(paths, async () => new Blob(["abc"], { type: "text/plain" }))).rejects.toThrow("type mismatch");
  });
  it("rejects unexpected fields rather than silently losing documents", async () => {
    await expect(readIntakeDocuments({ unknown: `${folder}/unknown.png` }, vi.fn())).rejects.toThrow("Unsupported checkout document field");
  });
});
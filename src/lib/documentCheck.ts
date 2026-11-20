import { z } from "zod";

const text = z.string().nullable();
export const extractedDocumentSchema = z.object({
  fullName: text, number: text, dateOfBirth: text, issueDate: text, expiryDate: text,
  category: text, country: text, state: text, nationality: text,
  documentType: z.enum(["license", "passport", "other", "unknown"]),
  legible: z.boolean(), notes: text,
}).strict();
export type ExtractedDocument = z.infer<typeof extractedDocumentSchema>;
export type DocumentResult = ExtractedDocument & { expired: boolean | null; expiresBeforeReturn: boolean | null; nameMatches: boolean | null; typeMatches: boolean };
export type DocumentResults = Partial<Record<"licenseFront" | "licenseBack" | "passport" | "secondLicense", DocumentResult>>;
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
export function validateDocument(d: ExtractedDocument, kind: string, name: string, returnAt: string, now = new Date()): DocumentResult {
  const expiry = d.expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(d.expiryDate) && Number.isFinite(Date.parse(d.expiryDate)) ? d.expiryDate : null;
  return { ...d, expired: expiry ? expiry < now.toISOString().slice(0, 10) : null,
    expiresBeforeReturn: expiry ? expiry < returnAt.slice(0, 10) : null,
    nameMatches: d.fullName && name.trim() ? normalize(d.fullName) === normalize(name) : null,
    typeMatches: d.documentType === (kind === "passport" ? "passport" : "license") };
}
export function driverFromDocuments(results: DocumentResults) {
  const license = results.licenseFront?.documentType === "license" && results.licenseFront.legible ? results.licenseFront : results.licenseBack?.documentType === "license" && results.licenseBack.legible ? results.licenseBack : null;
  const passport = results.passport?.documentType === "passport" && results.passport.legible ? results.passport : null;
  const name = license?.fullName || passport?.fullName;
  const parts = name?.trim().split(/\s+/) ?? [];
  const first = parts[0];
  const dob = license?.dateOfBirth || passport?.dateOfBirth;
  return { ...(first && parts.length > 1 ? { firstName: first, lastName: parts.slice(1).join(" ") } : {}),
    ...(dob ? { dateOfBirth: dob } : {}),
    ...(license?.number ? { licenseNumber: license.number } : {}), ...(license?.expiryDate ? { licenseExpiry: license.expiryDate } : {}),
    ...(passport?.number ? { passportNumber: passport.number } : {}) };
}
// Pure rules for the Documents step: Brazil = uploads as before; every other licence country = Stripe Identity.
export type DocMode = "brazil" | "stripe_us" | "stripe_foreign";
/** Country values are the English names stored by countryOptions(). Empty = not chosen yet. */
export function docMode(licenseCountry: string | null | undefined): DocMode | null {
  if (!licenseCountry) return null;
  if (licenseCountry === "Brazil") return "brazil";
  if (licenseCountry === "United States") return "stripe_us";
  return "stripe_foreign";
}
/** Upload slots the main driver must fill for the mode. */
export function requiredUploads(mode: DocMode | null): ("licenseFront" | "licenseBack" | "passport")[] {
  if (mode === "brazil") return ["licenseFront", "licenseBack", "passport"];
  if (mode === "stripe_foreign") return ["passport"];
  return [];
}
export type StoredIdentity = {
  provider: "stripe"; session_id: string; status: string; verified_at: string | null; license_country: string;
  first_name: string | null; last_name: string | null; dob: string | null; document_number: string | null; document_expiry: string | null; document_country: string | null;
};
export const identityVerified = (idv: unknown): idv is StoredIdentity => !!idv && typeof idv === "object" && (idv as StoredIdentity).status === "verified" && (idv as StoredIdentity).provider === "stripe";
/** Submitted identity: Stripe is reviewing ("processing") or already verified. Progression never waits for the final result. */
export const identitySubmitted = (status: string | null | undefined) => status === "verified" || status === "processing";
/** Documents step gate: the mode's files and (non-Brazil) a submitted identity (verified OR still processing). */
export function documentsComplete(mode: DocMode | null, uploaded: Partial<Record<string, string | undefined>>, identityStatus: string | null): boolean {
  if (!mode) return false;
  if (requiredUploads(mode).some((k) => !uploaded[k])) return false;
  return mode === "brazil" || identitySubmitted(identityStatus);
}
/** Stored on a booking while Stripe has not resolved yet (or resolved as failed); the webhook replaces it. */
export type PendingIdentity = { provider: "stripe"; session_id: string; status: "pending" | "failed"; verified_at: null; license_country: string; failure_code?: string | null };
export const identityAttached = (idv: unknown): idv is StoredIdentity | PendingIdentity => !!idv && typeof idv === "object" && (idv as StoredIdentity).provider === "stripe" && typeof (idv as StoredIdentity).session_id === "string" && ["verified", "pending", "failed"].includes((idv as StoredIdentity).status);
/** Admin label for a booking's identity column. */
export const identityAdminState = (idv: unknown): "verified" | "pending" | "failed" | null => identityAttached(idv) ? (idv.status as "verified" | "pending" | "failed") : null;
/** Server-side check of a stored booking (documents JSON + identity column). */
export function storedDocsComplete(docs: unknown, idv: unknown): boolean {
  const d = (docs ?? {}) as Record<string, unknown>;
  const has = (k: string) => typeof d[k] === "string" && !!d[k];
  if (identityAttached(idv)) return idv.license_country === "United States" || has("passport");
  return has("licenseFront") && has("licenseBack") && has("passport");
}
/** SistemaGestao identity_verification object (verified clients only; undefined otherwise). */
export function identityPayload(idv: unknown) {
  if (!identityVerified(idv)) return undefined;
  return { provider: "stripe" as const, session_id: idv.session_id, status: "verified" as const, verified_at: idv.verified_at, document_country: idv.document_country, document_number: idv.document_number, document_expiry: idv.document_expiry, dob: idv.dob, first_name: idv.first_name, last_name: idv.last_name };
}
const ymd = (x?: { day: number; month: number; year: number } | null) => x?.year ? `${x.year}-${String(x.month).padStart(2, "0")}-${String(x.day).padStart(2, "0")}` : null;
/** Maps Stripe's verification report to the stored record. */
export function identityFromReport(o: { sessionId: string; licenseCountry: string; verifiedAt: string; report: { document?: { first_name?: string | null; last_name?: string | null; number?: string | null; issuing_country?: string | null; dob?: { day: number; month: number; year: number } | null; expiration_date?: { day: number; month: number; year: number } | null } } }): StoredIdentity {
  const d = o.report.document ?? {};
  return { provider: "stripe", session_id: o.sessionId, status: "verified", verified_at: o.verifiedAt, license_country: o.licenseCountry, first_name: d.first_name ?? null, last_name: d.last_name ?? null, dob: ymd(d.dob), document_number: d.number ?? null, document_expiry: ymd(d.expiration_date), document_country: d.issuing_country ?? null };
}

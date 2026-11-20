export const DOCUMENT_FILE_LIMIT = 10 * 1024 * 1024;
export const DOCUMENT_TOTAL_LIMIT = 25 * 1024 * 1024;
export type IntakeDocument = { kind: string; filename: string; content_type: string; size_bytes: number; data_base64: string; sha256: string };
export type IntakeAdditionalDriver = { full_name: string; documents: IntakeDocument[] };
// Stored secondLicense (legacy bookings only) keeps mapping to second_license so old bookings can still re-send.
const slots: Record<string, string> = { licenseFront: "license_front", licenseBack: "license_back", passport: "passport", secondLicense: "second_license", insurancePolicy: "insurance_policy" };
// Additional driver's files: stored slot -> SistemaGestao kind (JPEG/PNG only per SistemaGestao contract).
const addSlots: Record<string, { field: string; kind: string }> = { addLicenseFront: { field: "licenseFront", kind: "license_front" }, addLicenseBack: { field: "licenseBack", kind: "license_back" }, addPassport: { field: "passport", kind: "passport" } };
const mime: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif" };
// PDF is accepted ONLY for the client insurance policy slot; identity documents stay image-only.
const pdfMime: Record<string, string> = { ...mime, pdf: "application/pdf" };
type Download = (path: string) => Promise<Blob>;

async function readOne(field: string, path: string, kind: string, ext: string, download: Download, counter: { total: number }, prefix = "", types: Record<string, string> = mime): Promise<IntakeDocument> {
  const file = await download(path);
  if (!file.size) throw new Error(`Empty document: ${field}`);
  if (file.size > DOCUMENT_FILE_LIMIT) throw new Error(`Document ${field} exceeds 10 MB; entire send rejected`);
  counter.total += file.size;
  if (counter.total > DOCUMENT_TOTAL_LIMIT) throw new Error("Documents exceed 25 MB total; entire send rejected");
  const content_type = types[ext];
  if (!content_type || (file.type && file.type !== content_type && file.type !== "application/octet-stream")) throw new Error(`Document type mismatch: ${field}`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size) throw new Error(`Incomplete document: ${field}`);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return { kind, filename: `${prefix}${kind.replaceAll("_", "-")}.${ext}`, content_type, size_bytes: bytes.length, data_base64: btoa(binary), sha256: Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, "0")).join("") };
}

/** Reads only stored checkout paths from PRIVATE storage; fails the entire send rather than sending partial files. */
export async function readIntakeDocuments(stored: unknown, download: Download, counter = { total: 0 }): Promise<IntakeDocument[]> {
  if (stored == null) return [];
  if (typeof stored !== "object" || Array.isArray(stored)) throw new Error("Invalid checkout document record");
  const out: IntakeDocument[] = [];
  for (const [field, path] of Object.entries(stored)) {
    if (field === "additionalDriver") continue; // sent separately as the top-level additional_driver object
    if (path == null || path === "") continue;
    const kind = slots[field];
    if (!kind || typeof path !== "string") throw new Error(`Unsupported checkout document field: ${field}`);
    const match = field === "insurancePolicy"
      ? /^uploads\/[0-9a-f-]{36}\/(insurancePolicy)\.(pdf|jpg|jpeg|png|heic|heif)$/.exec(path)
      : /^uploads\/[0-9a-f-]{36}\/(licenseFront|licenseBack|passport|secondLicense)\.(jpg|jpeg|png|heic|heif)$/.exec(path);
    if (!match || match[1] !== field) throw new Error(`Invalid private document path: ${field}`);
    out.push(await readOne(field, path, kind, match[2] ?? "", download, counter, "", field === "insurancePolicy" ? pdfMime : mime));
  }
  return out;
}

/** Additional driver per SistemaGestao contract: undefined when not selected (field omitted); else full_name + exactly one of each kind. */
export async function readAdditionalDriver(stored: unknown, download: Download, counter = { total: 0 }): Promise<IntakeAdditionalDriver | undefined> {
  const a = stored && typeof stored === "object" ? (stored as Record<string, unknown>)["additionalDriver"] : undefined;
  if (a == null) return undefined;
  if (typeof a !== "object" || Array.isArray(a)) throw new Error("Invalid additional driver record");
  const rec = a as Record<string, unknown>;
  const full_name = typeof rec["fullName"] === "string" ? rec["fullName"].trim() : "";
  if (full_name.length < 2 || full_name.length > 120) throw new Error("Invalid additional driver name");
  const documents: IntakeDocument[] = [];
  for (const [slot, { field, kind }] of Object.entries(addSlots)) {
    const path = rec[field];
    if (typeof path !== "string" || !path) throw new Error(`Missing additional driver document: ${field}`);
    const match = /^uploads\/[0-9a-f-]{36}\/(addLicenseFront|addLicenseBack|addPassport)\.(jpg|jpeg|png)$/.exec(path);
    if (!match || match[1] !== slot) throw new Error(`Invalid additional driver document path: ${field}`);
    documents.push(await readOne(`additionalDriver.${field}`, path, kind, match[2] ?? "", download, counter, "additional-driver-"));
  }
  return { full_name, documents };
}

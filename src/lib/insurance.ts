import { insuranceText, type Lang } from "./i18n";

export type InsuranceChoice = "own" | "ben";
export type InsuranceStatus = "pending_review" | "verified" | "denied";
export const INSURANCE_STATUSES: readonly InsuranceStatus[] = ["pending_review", "verified", "denied"];
export const DENIAL_REASONS = ["not_active", "missing_collision_comprehensive", "liability_below_minimum", "deductible_too_high"] as const;
export type DenialReason = (typeof DENIAL_REASONS)[number];
export type InsuranceClass = "regular" | "luxury" | "sports" | "exotics";
export const INSURANCE_CLASSES: readonly InsuranceClass[] = ["regular", "luxury", "sports", "exotics"];
export const INSURANCE_PATH = /^uploads\/[0-9a-f-]{36}\/insurancePolicy\.(pdf|jpg|jpeg|png|heic|heif)$/;

/** Picks the minimums row from the car's existing category (public body_category, legacy tier as fallback). */
export function insuranceClass(v: { body_category?: string | null; category?: string | null; exotic?: boolean | null }): InsuranceClass {
  const b = v.body_category;
  if (b === "exotics") return "exotics";
  if (b === "sports") return "sports";
  if (b === "luxury") return "luxury";
  // A known everyday body (SUV/sedan/convertible) is regular unless its tier is the luxury SUV class (Escalade/Wagoneer);
  // the legacy "exotic" tier never turns an everyday body into an exotic.
  if (b) return v.category === "luxury_suv" ? "luxury" : "regular";
  if (v.exotic || v.category === "exotic") return "exotics";
  if (v.category === "sport") return "sports";
  if (v.category === "luxury_suv") return "luxury";
  return "regular";
}

/** Initial stored state: a file → Pending review; Onic coverage or nothing → no status. */
export function initialInsurance(choice: InsuranceChoice | null | undefined, path: string | null | undefined): { insurance_choice: InsuranceChoice | null; insurance_status: InsuranceStatus | null } {
  if (choice === "own" && path) return { insurance_choice: "own", insurance_status: "pending_review" };
  return { insurance_choice: choice ?? null, insurance_status: null };
}

/** Owner review: only bookings with an uploaded policy can be reviewed; Denied needs one reason. */
export function insuranceTransition(current: { hasFile: boolean; status: InsuranceStatus | null; measureOne?: boolean }, next: InsuranceStatus, reason?: DenialReason | null): { status: InsuranceStatus; reason: DenialReason | null } {
  // MeasureOne bookings have no file: the owner records his verdict after reading the MeasureOne report.
  if (!current.hasFile && !current.measureOne) throw new Error("NO_INSURANCE_FILE");
  if (!INSURANCE_STATUSES.includes(next)) throw new Error("BAD_STATUS");
  if (next === "denied") {
    if (!reason || !DENIAL_REASONS.includes(reason)) throw new Error("REASON_REQUIRED");
    return { status: next, reason };
  }
  return { status: next, reason: null };
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export function minimumsTableHtml(lang: Lang, highlight?: InsuranceClass) {
  const t = insuranceText[lang];
  const rows = INSURANCE_CLASSES.map((k) => `<tr${k === highlight ? ' style="background:#F5F3EF;font-weight:bold"' : ""}><td style="border:1px solid #ccc;padding:6px">${esc(t.rows[k][0])}</td><td style="border:1px solid #ccc;padding:6px">${esc(t.rows[k][1])}</td></tr>`).join("");
  return `<table style="border-collapse:collapse"><tr><th style="border:1px solid #ccc;padding:6px;text-align:left">${esc(t.colClass)}</th><th style="border:1px solid #ccc;padding:6px;text-align:left">${esc(t.colReq)}</th></tr>${rows}</table><p>${esc(t.always)}</p>`;
}

/** Renter email on Denied: failed reason + minimums table, in the booking language. */
export function composeInsuranceDenialEmail(lang: Lang, b: { id: string; first_name?: string | null; vehicle_name?: string | null }, reason: DenialReason, cls: InsuranceClass) {
  const t = insuranceText[lang];
  const ref = b.id.slice(0, 8).toUpperCase();
  const subject = `${t.emailSubject} — ${t.emailBooking} ${ref}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#111"><p>${esc(t.emailHello)} ${esc(b.first_name ?? "")},</p><p>${esc(t.emailBody)}</p><p>${esc(t.emailBooking)}: <strong>${ref}</strong><br>${esc(t.emailCar)}: <strong>${esc(b.vehicle_name)}</strong></p><p>${esc(t.emailReason)}: <strong>${esc(t.reasons[reason])}</strong></p><h3>${esc(t.minTitle)}</h3><p>${esc(t.emailClassLine)}: <strong>${esc(t.rows[cls][0])}</strong></p>${minimumsTableHtml(lang, cls)}<p>${esc(t.emailAsk)}</p></div>`;
  return { subject, html };
}

/** US-license insurance flow recorded on the booking. "completed" is never inferred from a static link.
 * New checkouts record `measureone_pending_after_payment` (verification link is sent after payment);
 * `measureone_started` is legacy (old in-checkout dialog) and kept for existing rows. */
export type UsInsuranceFlow = "measureone_started" | "fallback_uploaded" | "not_provided" | "measureone_pending_after_payment";
export const MEASUREONE_PENDING = "measureone_pending_after_payment" as const;
export function usInsuranceFlow(isUs: boolean, linkAvailable: boolean, uploadedPath: string | null | undefined): UsInsuranceFlow | null {
  if (!isUs) return null;
  if (uploadedPath) return "fallback_uploaded";
  return linkAvailable ? MEASUREONE_PENDING : "not_provided";
}
/** Admin label key for the stored US flow (null = not a US-license booking). Pending is never "started" or completed. */
export function usFlowLabelKey(flow: string | null | undefined): "flowStarted" | "flowFallback" | "flowNone" | "flowPending" | null {
  if (flow === MEASUREONE_PENDING) return "flowPending";
  if (flow === "measureone_started") return "flowStarted";
  if (flow === "fallback_uploaded") return "flowFallback";
  if (flow === "not_provided") return "flowNone";
  return null;
}
/** Admin: pending label shows until verification data (a policy file or an owner-set status) exists. */
export function usFlowAdminKey(r: { insurance_us_flow?: string | null | undefined; insurance_status?: string | null | undefined; hasFile: boolean }) {
  const k = usFlowLabelKey(r.insurance_us_flow);
  if (k === "flowPending" && (r.hasFile || r.insurance_status)) return null;
  return k;
}
/** Post-payment MeasureOne card/email: paid US own-insurance pending bookings only; link used exactly as stored. */
export function measureOneEligible(b: { insurance_us_flow?: string | null; insurance_choice?: string | null }, paid: boolean): boolean {
  return paid && b.insurance_us_flow === MEASUREONE_PENDING && b.insurance_choice !== "ben";
}
export function measureOneCardUrl(link: unknown, b: { insurance_us_flow?: string | null; insurance_choice?: string | null }, paid: boolean): string | null {
  if (!measureOneEligible(b, paid) || typeof link !== "string" || !link.trim()) return null;
  try { if (new URL(link).protocol !== "https:") return null; } catch { return null; }
  return link;
}
/** Only an https URL from the owner setting is used; anything else falls back to upload. */
export function measureOneLink(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  try { const u = new URL(v.trim()); return u.protocol === "https:" ? u.toString() : null; } catch { return null; }
}

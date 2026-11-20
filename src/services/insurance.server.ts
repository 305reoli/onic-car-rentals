import { composeInsuranceDenialEmail, insuranceClass, insuranceTransition, type DenialReason, type InsuranceStatus } from "@/lib/insurance";
import type { Lang } from "@/lib/i18n";

export type InsuranceBooking = { id: string; email: string; first_name: string | null; vehicle_name: string | null; language: string | null; documents: unknown; insurance_status: InsuranceStatus | null; insurance_us_flow?: string | null; insurance_choice?: string | null; vehicle?: { body_category?: string | null; category?: string | null; exotic?: boolean | null } | null };
export type InsuranceDeps = {
  load: (id: string) => Promise<InsuranceBooking | null>;
  save: (id: string, patch: { insurance_status: InsuranceStatus; insurance_denial_reason: DenialReason | null; insurance_reviewed_at: string }) => Promise<void>;
  send: (m: { to: string; subject: string; html: string; idempotencyKey?: string }) => Promise<{ id: string }>;
  log: (r: { prereservation_id: string; channel: string; kind: string; recipient: string; status: string; detail?: string }) => Promise<void>;
  now?: () => Date;
};

/** Owner sets the status; Denied emails the renter (existing Resend sender) with the reason and minimums table. */
export async function setInsuranceStatus(deps: InsuranceDeps, id: string, next: InsuranceStatus, reason?: DenialReason | null) {
  const b = await deps.load(id);
  if (!b) throw new Error("Booking not found");
  const path = (b.documents as { insurancePolicy?: unknown } | null)?.insurancePolicy;
  const t = insuranceTransition({ hasFile: typeof path === "string" && !!path, status: b.insurance_status, measureOne: b.insurance_us_flow === "measureone_pending_after_payment" && b.insurance_choice !== "ben" }, next, reason);
  const at = (deps.now ?? (() => new Date()))().toISOString();
  await deps.save(id, { insurance_status: t.status, insurance_denial_reason: t.reason, insurance_reviewed_at: at });
  if (t.status !== "denied" || !t.reason) return { ok: true, emailed: false };
  const lang = (["en", "pt", "es"].includes(b.language ?? "") ? b.language : "en") as Lang;
  const mail = composeInsuranceDenialEmail(lang, b, t.reason, insuranceClass(b.vehicle ?? {}));
  try {
    const r = await deps.send({ to: b.email, ...mail, idempotencyKey: `insurance-denied-${id}-${at}` });
    await deps.log({ prereservation_id: id, channel: "email", kind: "insurance_denied", recipient: b.email, status: "sent", detail: `${t.reason} ${r.id}` });
    return { ok: true, emailed: true };
  } catch (e) {
    await deps.log({ prereservation_id: id, channel: "email", kind: "insurance_denied", recipient: b.email, status: "failed", detail: e instanceof Error ? e.message : String(e) });
    return { ok: true, emailed: false };
  }
}

export async function liveInsuranceDeps(db: any): Promise<InsuranceDeps> {
  const { sendResendEmail } = await import("./resend-email.server");
  const { logNotification } = await import("./whatsapp.server");
  return {
    load: async (id) => (await db.from("prereservations").select("id, email, first_name, vehicle_name, language, documents, insurance_status, insurance_us_flow, insurance_choice, vehicle:vehicles(body_category, category)").eq("id", id).maybeSingle()).data,
    save: async (id, patch) => { const { error } = await db.from("prereservations").update(patch).eq("id", id); if (error) throw new Error(error.message); },
    send: sendResendEmail, log: (r) => logNotification(db, r),
  };
}

// Owner email when a Stripe Identity session reaches "verified" (webhook identity.verification_session.verified).
// Works for checkout and for late completions via a shared link: never depends on checkout state.
import { identityFromReport, type StoredIdentity } from "@/lib/identity";
import { identityDenialText } from "@/lib/i18n";
import type { VerificationReport, VerificationSession } from "./stripe.server";

type Db = { from: (t: string) => any };
export interface IdentityNotifyDeps {
  db: Db;
  retrieveSession: (id: string) => Promise<VerificationSession>;
  retrieveReport: (id: string) => Promise<VerificationReport>;
  ownerEmail: () => Promise<string>;
  send: (m: { to: string; subject: string; html: string; idempotencyKey: string }) => Promise<unknown>;
  log?: (row: { prereservation_id?: string | null; channel: string; kind: string; recipient: string; status: string; detail?: string }) => Promise<void>;
  mode: string;
  /** Renter "not approved" email with a fresh verification link. Optional: absent = owner email only. */
  client?: { send: IdentityNotifyDeps["send"]; createSession: (o: { bookingId: string; licenseCountry: string; lang: "en" | "pt" | "es" }) => Promise<{ id: string; url: string | null }> };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT = /^[0-9a-f]{8}$/i;
const BOOKING_COLS = "id, first_name, last_name, email, language, vehicle_name, pickup_at, pickup_location, return_at, return_location, identity_verification";
export const shortId = (id: string) => id.slice(0, 8).toUpperCase();
const esc = (s: unknown) => String(s ?? "—").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmt = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET" : "—";
const DOC_TYPES: Record<string, string> = { driving_license: "Driver's license", passport: "Passport", id_card: "ID card" };

async function bookingByRef(db: Db, ref: string | undefined | null) {
  const v = (ref ?? "").trim();
  if (UUID.test(v)) return (await db.from("prereservations").select(BOOKING_COLS).eq("id", v.toLowerCase()).maybeSingle()).data ?? null;
  if (SHORT.test(v)) {
    const p = v.toLowerCase();
    const { data } = await db.from("prereservations").select(BOOKING_COLS).gte("id", `${p}-0000-0000-0000-000000000000`).lte("id", `${p}-ffff-ffff-ffff-ffffffffffff`).limit(2);
    return data?.length === 1 ? data[0] : null;
  }
  return null;
}

/** Booking resolution order: session metadata (booking_id / prereservation_id) → stored identity check row → booking already carrying this session. */
export async function resolveBooking(db: Db, sessionId: string, meta: Record<string, string> | null | undefined, row: { booking_id?: string | null } | null) {
  for (const k of ["booking_id", "prereservation_id"]) {
    const b = await bookingByRef(db, meta?.[k]);
    if (b) return { booking: b, via: `metadata.${k}` };
  }
  if (row?.booking_id) { const b = await bookingByRef(db, row.booking_id); if (b) return { booking: b, via: "identity_check.booking_id" }; }
  const { data } = await db.from("prereservations").select(BOOKING_COLS).eq("identity_verification->>session_id", sessionId).limit(2);
  if (data?.length === 1) return { booking: data[0], via: "identity_check.session_id" };
  return { booking: null, via: "unresolved" };
}

export function composeIdentityEmail(b: { id: string; first_name?: string | null; last_name?: string | null; vehicle_name?: string | null; pickup_at?: string | null; pickup_location?: string | null; return_at?: string | null; return_location?: string | null }, idv: StoredIdentity, docType: string | null) {
  const client = `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim() || `${idv.first_name ?? ""} ${idv.last_name ?? ""}`.trim() || "Client";
  const subject = `Identity verification completed — ${client} — booking ${shortId(b.id)}`;
  const rows: [string, unknown][] = [
    ["Client name", client], ["Booking ID", `${shortId(b.id)} (${b.id})`], ["Car", b.vehicle_name],
    ["Pickup", `${fmt(b.pickup_at)} — ${b.pickup_location ?? "—"}`], ["Return", `${fmt(b.return_at)} — ${b.return_location ?? "—"}`],
    ["Verified first name", idv.first_name], ["Verified last name", idv.last_name], ["Date of birth", idv.dob],
    ["Document type", docType ? (DOC_TYPES[docType] ?? docType) : null], ["Document number", idv.document_number],
    ["Document issuing country", idv.document_country], ["Document expiration", idv.document_expiry],
    ["Stripe session ID", idv.session_id], ["Verified at", idv.verified_at ? `${fmt(idv.verified_at)} (${idv.verified_at})` : null],
  ];
  const html = `<div style="font-family:Arial,sans-serif;color:#111"><h2>Identity verification completed</h2><table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#555">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join("")}</table></div>`;
  return { subject, html };
}

export async function handleIdentityVerified(deps: IdentityNotifyDeps, eventObj: { id: string; metadata?: Record<string, string> }): Promise<string> {
  const { db } = deps;
  const sid = eventObj.id;
  if (!/^vs_[A-Za-z0-9]{8,80}$/.test(sid)) return "identity:bad_session";
  const vs = await deps.retrieveSession(sid);
  if (vs.status !== "verified" || !vs.last_verification_report) return `identity:not_verified:${vs.status}`;
  const meta = { ...(eventObj.metadata ?? {}), ...(vs.metadata ?? {}) };
  const { data: row } = await db.from("identity_verifications").select("id, booking_id, license_country, owner_notified_at").eq("session_id", sid).maybeSingle();
  const report = await deps.retrieveReport(vs.last_verification_report);
  const verifiedAt = new Date((report.created ?? Date.now() / 1000) * 1000).toISOString();
  const licenseCountry = row?.license_country ?? meta["license_country"] ?? report.document?.issuing_country ?? "Unknown";
  const outputs = identityFromReport({ sessionId: sid, licenseCountry, verifiedAt, report });
  const { booking, via } = await resolveBooking(db, sid, meta, row);
  const now = new Date().toISOString();
  // Store verified outputs exactly as checkout does (same mapper), linking the booking when known.
  if (row) await db.from("identity_verifications").update({ status: "verified", verified_at: verifiedAt, outputs, updated_at: now, ...(booking ? { booking_id: booking.id } : {}) }).eq("id", row.id);
  else await db.from("identity_verifications").insert({ session_id: sid, license_country: licenseCountry, mode: deps.mode, status: "verified", verified_at: verifiedAt, outputs, booking_id: booking?.id ?? null });
  if (!booking) { console.error(`[identity] verified session ${sid} has no resolvable booking — owner email NOT sent`); return "identity:verified_unresolved"; }
  // Keep admin badge + SistemaGestao payload consistent; never overwrite a different session's data.
  await db.from("prereservations").update({ identity_verification: outputs }).eq("id", booking.id).or(`identity_verification.is.null,identity_verification->>session_id.eq.${sid},identity_verification->>status.neq.verified`);
  // Atomic claim: only one delivery can flip owner_notified_at from NULL.
  const { data: claimed } = await db.from("identity_verifications").update({ owner_notified_at: now }).eq("session_id", sid).is("owner_notified_at", null).select("id");
  if (!claimed?.length) return `identity:already_notified(${via})`;
  const to = await deps.ownerEmail();
  const { subject, html } = composeIdentityEmail(booking, outputs, report.document?.type ?? null);
  try {
    await deps.send({ to, subject, html, idempotencyKey: `identity-verified-${sid}` });
    await deps.log?.({ prereservation_id: booking.id, channel: "email", kind: "owner_identity_verified", recipient: to, status: "sent", detail: subject });
    return `identity:notified(${via})`;
  } catch (e) {
    await db.from("identity_verifications").update({ owner_notified_at: null }).eq("session_id", sid);
    await deps.log?.({ prereservation_id: booking.id, channel: "email", kind: "owner_identity_verified", recipient: to, status: "failed", detail: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** Production wiring: existing Stripe gateway helpers, Settings → booking notification mailbox, existing Resend sender + notification_log. */
export async function liveIdentityNotifyDeps(db: Db, mode: string): Promise<IdentityNotifyDeps> {
  const s = await import("./stripe.server");
  const { bookingNotificationEmail } = await import("@/lib/bookingEmail");
  const { sendResendEmail } = await import("./resend-email.server");
  const { logNotification } = await import("./whatsapp.server");
  return {
    db, mode, retrieveSession: s.retrieveVerificationSession, retrieveReport: s.retrieveVerificationReport,
    ownerEmail: async () => bookingNotificationEmail((await db.from("settings").select("owner_notification_email").eq("id", 1).maybeSingle()).data?.owner_notification_email),
    send: sendResendEmail, log: (r) => logNotification(db as never, r),
    client: {
      send: sendResendEmail,
      createSession: async ({ bookingId, licenseCountry, lang }) => {
        const vs = await s.createVerificationSession({ returnUrl: `https://oniccarrentals.com/api/public/identity-return?lang=${lang}`, meta: { source: "client_redo", booking_id: bookingId, license_country: licenseCountry.slice(0, 80) }, idem: `identity-redo-${bookingId}-${crypto.randomUUID()}` });
        return { id: vs.id, url: vs.url };
      },
    },
  };
}

/** A real failed outcome: Stripe rejected a submission (requires_input + last_error, not a plain "abandoned" exit) or the session was canceled. */
export function failedOutcome(vs: Pick<VerificationSession, "status" | "last_error">): { code: string; reason: string } | null {
  if (vs.status === "canceled") return { code: vs.last_error?.code ?? "canceled", reason: vs.last_error?.reason ?? "The verification session was canceled." };
  if (vs.status === "requires_input" && vs.last_error && vs.last_error.code !== "abandoned") return { code: vs.last_error.code ?? "unknown", reason: vs.last_error.reason ?? "" };
  return null;
}

export function composeFailureEmail(b: { id: string; first_name?: string | null; last_name?: string | null; vehicle_name?: string | null; pickup_at?: string | null; pickup_location?: string | null; return_at?: string | null; return_location?: string | null }, sid: string, f: { code: string; reason: string }) {
  const client = `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim() || "Client";
  const subject = `Identity verification NOT completed — ${client} — booking ${shortId(b.id)}`;
  const rows: [string, unknown][] = [
    ["Client name", client], ["Booking ID", `${shortId(b.id)} (${b.id})`], ["Car", b.vehicle_name],
    ["Pickup", `${fmt(b.pickup_at)} — ${b.pickup_location ?? "—"}`], ["Return", `${fmt(b.return_at)} — ${b.return_location ?? "—"}`],
    ["Stripe error code", f.code], ["Stripe message", f.reason || null], ["Stripe session ID", sid],
  ];
  const html = `<div style="font-family:Arial,sans-serif;color:#111"><h2>Identity verification NOT completed</h2><table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#555">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join("")}</table><p><strong>This booking still needs its identity verification completed.</strong></p></div>`;
  return { subject, html };
}

/** identity.verification_session.requires_input / .canceled → one failure email per session (owner_failure_notified_at). */
export async function handleIdentityFailed(deps: IdentityNotifyDeps, eventObj: { id: string; metadata?: Record<string, string> }): Promise<string> {
  const { db } = deps;
  const sid = eventObj.id;
  if (!/^vs_[A-Za-z0-9]{8,80}$/.test(sid)) return "identity:bad_session";
  const vs = await deps.retrieveSession(sid);
  const f = failedOutcome(vs);
  if (!f) return `identity:not_failed:${vs.status}`;
  const meta = { ...(eventObj.metadata ?? {}), ...(vs.metadata ?? {}) };
  const { data: row } = await db.from("identity_verifications").select("id, booking_id, license_country, status").eq("session_id", sid).maybeSingle();
  const { booking, via } = await resolveBooking(db, sid, meta, row);
  const now = new Date().toISOString();
  if (row) { if (row.status !== "verified") await db.from("identity_verifications").update({ status: vs.status, updated_at: now, ...(booking ? { booking_id: booking.id } : {}) }).eq("id", row.id); }
  else await db.from("identity_verifications").insert({ session_id: sid, license_country: meta["license_country"] ?? "Unknown", mode: deps.mode, status: vs.status, booking_id: booking?.id ?? null });
  if (!booking) { console.error(`[identity] failed session ${sid} has no resolvable booking — owner email NOT sent`); return "identity:failed_unresolved"; }
  const { data: claimed } = await db.from("identity_verifications").update({ owner_failure_notified_at: now }).eq("session_id", sid).is("owner_failure_notified_at", null).select("id");
  // Surface in admin: a PENDING identity of this same session becomes FAILED (never overwrites a verified one).
  const cur = booking.identity_verification as { session_id?: string; status?: string } | null;
  if (cur?.session_id === sid && cur.status !== "verified") await db.from("prereservations").update({ identity_verification: { ...cur, status: "failed", failure_code: f.code } }).eq("id", booking.id);
  let out = `identity:failure_already_notified(${via})`;
  if (claimed?.length) {
    const to = await deps.ownerEmail();
    const { subject, html } = composeFailureEmail(booking, sid, f);
    try {
      await deps.send({ to, subject, html, idempotencyKey: `identity-failed-${sid}` });
      await deps.log?.({ prereservation_id: booking.id, channel: "email", kind: "owner_identity_failed", recipient: to, status: "sent", detail: subject });
      out = `identity:failure_notified(${via})`;
    } catch (e) {
      await db.from("identity_verifications").update({ owner_failure_notified_at: null }).eq("session_id", sid);
      await deps.log?.({ prereservation_id: booking.id, channel: "email", kind: "owner_identity_failed", recipient: to, status: "failed", detail: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }
  if (deps.client) await notifyClientFailure(deps, booking, sid, f, row?.license_country ?? meta["license_country"] ?? "Unknown");
  return out;
}

/** Stripe last_error code → client-facing reason category. */
export function denialCategory(code: string): keyof (typeof identityDenialText)["en"]["reasons"] {
  if (code === "canceled") return "canceled";
  if (/^selfie_/.test(code)) return "selfie_mismatch";
  if (code === "document_expired") return "expired";
  if (code === "document_type_not_supported" || code === "country_not_supported") return "type_not_accepted";
  if (/^document_/.test(code)) return "photo_unclear";
  return "other";
}

export function composeClientDenialEmail(b: { id: string; first_name?: string | null; vehicle_name?: string | null; language?: string | null }, f: { code: string }, url: string) {
  const lang = b.language === "pt" || b.language === "es" ? b.language : "en";
  const t = identityDenialText[lang];
  const fill = (x: string) => x.replace("{id}", shortId(b.id)).replace("{name}", b.first_name?.trim() || "").replace("{car}", b.vehicle_name ?? "");
  const subject = fill(t.subject);
  const html = `<div style="font-family:Arial,sans-serif;color:#111;max-width:560px"><p>${esc(fill(t.hello))}</p><p>${esc(fill(t.body))}</p><p><strong>${esc(t.reasonLabel)}:</strong> ${esc(t.reasons[denialCategory(f.code)])}</p><p>${esc(t.live)}</p><p><a href="${esc(url)}" style="display:inline-block;background:#111;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none">${esc(t.cta)}</a></p><p style="color:#555;font-size:13px">${esc(t.note)}</p></div>`;
  return { subject, html, lang };
}

/** One renter email per failed session (client_failure_notified_at), with a FRESH verification session tied to the booking. */
async function notifyClientFailure(deps: IdentityNotifyDeps, booking: { id: string; email?: string | null; first_name?: string | null; vehicle_name?: string | null; language?: string | null }, sid: string, f: { code: string; reason: string }, licenseCountry: string) {
  const { db } = deps;
  if (!booking.email) return;
  const now = new Date().toISOString();
  const { data: claimed } = await db.from("identity_verifications").update({ client_failure_notified_at: now }).eq("session_id", sid).is("client_failure_notified_at", null).select("id");
  if (!claimed?.length) return;
  const lang = booking.language === "pt" || booking.language === "es" ? booking.language : "en";
  try {
    const fresh = await deps.client!.createSession({ bookingId: booking.id, licenseCountry, lang });
    if (!fresh.url) throw new Error("no verification url");
    await db.from("identity_verifications").insert({ session_id: fresh.id, license_country: licenseCountry, mode: deps.mode, status: "requires_input", booking_id: booking.id });
    const { subject, html } = composeClientDenialEmail(booking, f, fresh.url);
    await deps.client!.send({ to: booking.email, subject, html, idempotencyKey: `identity-client-failed-${sid}` });
    await deps.log?.({ prereservation_id: booking.id, channel: "email", kind: "client_identity_failed", recipient: booking.email, status: "sent", detail: subject });
  } catch (e) {
    await db.from("identity_verifications").update({ client_failure_notified_at: null }).eq("session_id", sid);
    await deps.log?.({ prereservation_id: booking.id, channel: "email", kind: "client_identity_failed", recipient: booking.email, status: "failed", detail: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

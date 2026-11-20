// ONE place that turns a paid draft into a visible booking (pending_approval).
// Used by the client submit, the in-page payment confirmation, the booking page,
// the Stripe webhook and the admin "Recover" action, so every path ends identically.
// The status-guarded UPDATE (only from draft) is the atomic lock: only the caller that
// wins it sends owner_new / customer_received, so replays and late submits never duplicate.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DEFAULT_SETTINGS, holdExpiresAt, stripeBookingReady } from "@/lib/pricing";
import { BLOCKED_BOOKING_ID } from "./sistemagestao-payload";

type Admin = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["prereservations"]["Row"];
type Session = { id: string; payment_status: string; payment_intent: string | null; metadata: Record<string, string> | null; amount_total?: number | null; customer_details?: { name?: string | null; email?: string | null } | null; customer_email?: string | null };
type Intent = { id: string; status: string; amount: number; amount_received?: number; metadata?: Record<string, string> | null; receipt_email?: string | null };

export type FinalizeDeps = {
  stripeConnected: () => boolean;
  retrieveSession: (id: string) => Promise<Session>;
  retrieveIntent: (id: string) => Promise<Intent>;
  syncHold: (db: Admin, r: Row) => Promise<string | null>;
  notify: (kind: "owner_new" | "customer_received" | "owner_hold_failed", to: string, lang: "en" | "pt" | "es", vars: Record<string, string>) => Promise<unknown>;
  /** Post-payment MeasureOne email (no-op unless paid + US MeasureOne-pending). */
  afterPaid?: (db: Admin, id: string) => Promise<unknown>;
};

export async function defaultDeps(): Promise<FinalizeDeps> {
  const s = await import("./stripe.server");
  const { syncHoldFromSession } = await import("./holds.server");
  const { notify } = await import("./notify.server");
  return { stripeConnected: s.stripeConnected, retrieveSession: s.retrieveSession as never, retrieveIntent: s.retrieveIntent as never, syncHold: syncHoldFromSession as never, notify: notify as never,
    afterPaid: async (db, id) => (await import("./measureone-email.server")).measureOneAfterPayment(db, id) };
}

/** Statuses a paid checkout may be finalized from. ("pending_payment" is listed for safety; bookings normally use "draft".) */
export const FINALIZABLE = ["draft", "pending_payment"];
const INACTIVE = ["expired", "declined", "cancelled", "payment_failed", "refunded"];
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type FinalizeResult =
  | { outcome: "finalized" | "already"; id: string; holdSyncError: string | null }
  | { outcome: "not_paid"; id: string; stripeStatus: string | null }
  | { outcome: "inactive"; id: string; status: string }
  | { outcome: "not_found" | "blocked"; id: string };

export async function finalizePaidBooking(db: Admin, id: string, opts: { source: "client" | "confirm" | "booking_page" | "webhook" | "admin"; ip?: string | null }, deps?: FinalizeDeps): Promise<FinalizeResult> {
  if (id === BLOCKED_BOOKING_ID) return { outcome: "blocked", id };
  const d = deps ?? await defaultDeps();
  const { data: r } = await db.from("prereservations").select("*").eq("id", id).maybeSingle();
  if (!r) return { outcome: "not_found", id };
  if (INACTIVE.includes(r.status)) return { outcome: "inactive", id, status: r.status };
  if (!FINALIZABLE.includes(r.status)) return { outcome: "already", id, holdSyncError: null };

  // Hold sync is best-effort: a failure is logged and surfaced, never blocks a paid booking.
  let holdSyncError: string | null = null;
  let piId = r.stripe_payment_intent_id;
  try { piId = (await d.syncHold(db, r)) ?? piId; } catch (e) { holdSyncError = msg(e); console.error("[finalize] hold sync failed", id, e); }

  // Stripe is the source of truth for "paid".
  let stripe_status = r.stripe_status;
  let paidAmount: number | null = null;
  if ((piId || r.stripe_session_id) && d.stripeConnected()) {
    const session = r.stripe_session_id ? await d.retrieveSession(r.stripe_session_id) : null;
    piId = piId ?? session?.payment_intent ?? null;
    const pi = piId ? await d.retrieveIntent(piId) : null;
    stripe_status = pi?.status ?? (session?.payment_status === "paid" ? "succeeded" : "requires_payment_method");
    if (!stripeBookingReady(stripe_status ?? "", session?.metadata?.["kind"] === "hold")) return { outcome: "not_paid", id, stripeStatus: stripe_status };
    paidAmount = pi ? (pi.amount_received || pi.amount) / 100 : Number(r.prereservation_amount_usd);
  }

  const { data: st } = await db.from("settings").select("*").eq("id", 1).maybeSingle();
  const s = { ...DEFAULT_SETTINGS, ...(st ?? {}) };
  const now = new Date();
  const { data: won } = await db.from("prereservations").update({
    status: "pending_approval", stripe_status,
    ...(piId ? { stripe_payment_intent_id: piId } : {}),
    ...(stripe_status === "succeeded" ? { captured_at: r.captured_at ?? now.toISOString(), paid_amount_usd: paidAmount ?? Number(r.prereservation_amount_usd) } : {}),
    // Terms are accepted in the step before payment; the client path also records the IP.
    terms_accepted_at: r.terms_accepted_at ?? now.toISOString(), terms_ip: opts.ip || r.terms_ip || null, terms_version: r.terms_version ?? (st as { terms_version?: string } | null)?.terms_version ?? "v0",
    expires_at: holdExpiresAt(now, new Date(r.pickup_at), s).toISOString(),
  }).eq("id", r.id).in("status", FINALIZABLE).select("id");
  if (!won?.length) return { outcome: "already", id, holdSyncError };

  const ownerTo = (st as { owner_notification_email?: string } | null)?.owner_notification_email ?? "";
  await d.notify("owner_new", ownerTo, "pt", { id: r.id, car: r.vehicle_name, link: "/admin", ...(opts.source !== "client" ? { detail: `Booking created automatically from the confirmed payment (${opts.source}).` } : {}) }).catch((e) => console.error("[finalize] owner_new failed", e));
  await d.notify("customer_received", r.email, (r.language as "en") ?? "en", { id: r.id, car: r.vehicle_name, link: `/${r.language}/booking/${r.token}` }).catch((e) => console.error("[finalize] customer_received failed", e));
  await d.afterPaid?.(db, r.id).catch((e) => console.error("[finalize] measureone failed", e));
  if (holdSyncError) await d.notify("owner_hold_failed", "", "en", { id: r.id, car: r.vehicle_name, detail: `Booking created from the paid payment, but payment linking failed: ${holdSyncError}` }).catch(() => {});
  await db.from("payment_orphans").update({ status: "recovered", resolved_at: now.toISOString(), updated_at: now.toISOString() }).eq("booking_id", r.id).eq("status", "open");
  return { outcome: "finalized", id, holdSyncError };
}

/** Persistent, de-duplicated record of a paid Stripe payment that did not become a booking; alerts the owner once. */
export async function recordOrphan(db: Admin, o: { ref: string; sessionId?: string | null; piId?: string | null; bookingId?: string | null; amountUsd?: number | null; name?: string | null; email?: string | null; reason: string; eventId?: string | null }, deps?: FinalizeDeps) {
  const now = new Date().toISOString();
  const { data: ex } = await db.from("payment_orphans").select("id, status").eq("ref", o.ref).maybeSingle();
  if (ex) { if (ex.status === "open") await db.from("payment_orphans").update({ reason: o.reason, updated_at: now, ...(o.bookingId ? { booking_id: o.bookingId } : {}) }).eq("id", ex.id); return { created: false }; }
  const { error } = await db.from("payment_orphans").insert({ ref: o.ref, stripe_session_id: o.sessionId ?? null, stripe_payment_intent_id: o.piId ?? null, booking_id: o.bookingId ?? null, amount_usd: o.amountUsd ?? null, customer_name: o.name ?? null, customer_email: o.email ?? null, reason: o.reason, event_id: o.eventId ?? null });
  if (error) return { created: false }; // concurrent insert of the same ref
  const d = deps ?? await defaultDeps();
  await d.notify("owner_hold_failed", "", "en", { car: "Paid payment without booking", detail: `PAID but no booking was created — ${o.amountUsd != null ? `$${o.amountUsd.toFixed(2)} ` : ""}${o.name ?? ""} ${o.email ?? ""} (${o.piId ?? o.sessionId ?? o.ref}). Reason: ${o.reason}. Open Admin → Payments → "Orphaned payments" to recover.` }).catch(() => {});
  return { created: true };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Webhook entry: a paid checkout session or succeeded payment intent → booking, or a visible orphan record. Returns the outcome label. */
export async function handlePaidStripeEvent(db: Admin, ev: { type: "checkout.session.completed" | "payment_intent.succeeded"; obj: Session & Intent & { status?: string }; eventId: string }, deps?: FinalizeDeps): Promise<string> {
  const o = ev.obj;
  const isSession = ev.type === "checkout.session.completed";
  if (isSession && o.payment_status !== "paid") return "awaiting_payment";
  if (o.metadata?.["kind"] === "substitute_difference") return "substitute_difference";
  const sessionId = isSession ? o.id : null;
  const piId = isSession ? o.payment_intent : o.id;
  const metaId = o.metadata?.["prereservation_id"];
  let row: { id: string } | null = null;
  if (metaId && UUID.test(metaId)) row = (await db.from("prereservations").select("id").eq("id", metaId).maybeSingle()).data;
  if (!row && sessionId) row = (await db.from("prereservations").select("id").eq("stripe_session_id", sessionId).maybeSingle()).data;
  if (!row && piId) row = (await db.from("prereservations").select("id").eq("stripe_payment_intent_id", piId).maybeSingle()).data;
  const amountUsd = isSession ? (o.amount_total ?? 0) / 100 : (o.amount_received || o.amount || 0) / 100;
  const base = { ref: piId ?? o.id, sessionId, piId, amountUsd, name: o.customer_details?.name ?? null, email: o.customer_details?.email ?? o.customer_email ?? o.receipt_email ?? null, eventId: ev.eventId };
  if (!row) { await recordOrphan(db, { ...base, reason: metaId ? `No booking found for prereservation_id ${metaId}` : "Paid payment has no booking reference (missing metadata, no matching session/payment)" }, deps); return "orphan_recorded"; }
  try {
    const res = await finalizePaidBooking(db, row.id, { source: "webhook" }, deps);
    if (res.outcome === "finalized") return res.holdSyncError ? "booking_finalized_hold_sync_failed" : "booking_finalized";
    if (res.outcome === "already" || res.outcome === "blocked") return "already_finalized";
    if (res.outcome === "inactive") { await recordOrphan(db, { ...base, bookingId: row.id, reason: `Paid, but the booking is ${res.status}` }, deps); return "orphan_recorded"; }
    if (res.outcome === "not_paid") { await recordOrphan(db, { ...base, bookingId: row.id, reason: `Stripe event says paid but verification returned ${res.stripeStatus}` }, deps); return "orphan_recorded"; }
    await recordOrphan(db, { ...base, bookingId: row.id, reason: "Booking disappeared during finalization" }, deps);
    return "orphan_recorded";
  } catch (e) {
    await recordOrphan(db, { ...base, bookingId: row.id, reason: `Booking creation failed: ${msg(e)}` }, deps);
    return "finalize_failed";
  }
}

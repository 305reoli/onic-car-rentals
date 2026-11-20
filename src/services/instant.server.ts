// Instant full-payment bookings (Global Pays): settlement, hold expiry and SistemaGestao outbox.
// A booking is confirmed ONLY here, from a verified webhook or a server-side order consult.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { paidEnough } from "@/lib/pricing";
import { carIsFree } from "./booking-core.server";
import { customerMessage, notify } from "./notify.server";
import { FAILED, REFUNDED, SUCCESS, type OrderStatus } from "./globalpays.server";

type Admin = SupabaseClient<Database>;

/** Disabled until the SistemaGestao side exists; jobs wait in the outbox as "pending". */
export const SISTEMAGESTAO_OUTBOX_ENABLED = false;

export async function logPaymentEvent(db: Admin, e: { booking_id?: string | null; provider_order_id?: string | null; status?: string; outcome: string; payload?: unknown }) {
  await db.from("payment_events").insert({ provider: "globalpays", booking_id: e.booking_id ?? null, provider_order_id: e.provider_order_id ?? null, status: e.status ?? "", outcome: e.outcome, payload: (e.payload ?? {}) as Json });
}

/** USD the Global Pays order was created for. */
export function gpExpectedUsd(r: { flow: string; payment_mode?: string | null; prereservation_amount_usd?: number | null; price_breakdown?: unknown }): number | null {
  const total = (r.price_breakdown as { total?: number | null } | null)?.total ?? null;
  if (r.flow === "gp_request" && r.payment_mode !== "full" && r.prereservation_amount_usd != null) return Number(r.prereservation_amount_usd);
  return total;
}

export type SettleResult = "confirmed" | "paid_conflict" | "amount_review" | "payment_failed" | "refunded" | "duplicate" | "ignored" | "pending_approval";

/** Applies a payment status to an instant booking. Idempotent: side effects fire only on the first transition. */
export async function settle(db: Admin, bookingId: string, p: OrderStatus): Promise<SettleResult> {
  const { data: r } = await db.from("prereservations").select("*").eq("id", bookingId).maybeSingle();
  if (!r || !["instant", "gp_request"].includes(r.flow)) return "ignored";
  const st = p.status;

  if (REFUNDED.has(st)) {
    if (r.status === "refunded") return "duplicate";
    const { data: u } = await db.from("prereservations").update({ status: "refunded", refunded_at: new Date().toISOString(), refund_note: r.refund_note ?? `Provider status: ${st}` })
      .eq("id", r.id).neq("status", "refunded").select("id");
    if (u?.length) await notify("owner_refunded", "", "en", { id: r.id, car: r.vehicle_name, detail: `Global Pays reported ${st}` });
    return u?.length ? "refunded" : "duplicate";
  }

  if (FAILED.has(st)) {
    const { data: u } = await db.from("prereservations").update({ status: "payment_failed", decided_at: new Date().toISOString() })
      .eq("id", r.id).eq("status", "checkout_hold").select("id");
    return u?.length ? "payment_failed" : "duplicate";
  }

  if (!SUCCESS.has(st)) return "ignored";
  // First settlement only: from an open hold, or a late payment after the hold lapsed.
  if (!["checkout_hold", "payment_failed"].includes(r.status)) return "duplicate";

  // Verify the exact amount contracted by the order; legacy orders retain their historical amounts.
  const total = gpExpectedUsd(r);
  const money = { paid_amount_usd: p.amountUsd, gross_amount: p.gross, gross_currency: p.grossCurrency, fee_amount: p.fee, payment_method: p.method, gp_amount_brl: p.amountBrl ?? null, gp_installments: p.installments ?? null, settled_at: new Date().toISOString() };

  if (!paidEnough(p.amountUsd, total)) {
    const { data: u } = await db.from("prereservations").update({ ...money, status: "amount_review", review_reason: `Paid ${p.amountUsd ?? "unknown"} USD < total ${total ?? "unknown"} USD` })
      .eq("id", r.id).eq("status", r.status).select("id");
    if (u?.length) await notify("owner_amount_review", "", "en", { id: r.id, car: r.vehicle_name, detail: `Amount below total — review in admin (paid ${p.amountUsd ?? "?"} / total ${total ?? "?"} USD)` });
    return u?.length ? "amount_review" : "duplicate";
  }

  const { data: v } = await db.from("vehicles").select("blocked_dates").eq("id", r.vehicle_id ?? "").maybeSingle();
  const free = await carIsFree(db, r.vehicle_id ?? "", v?.blocked_dates ?? [], new Date(r.pickup_at), new Date(r.return_at), r.id);
  if (!free) {
    const { data: u } = await db.from("prereservations").update({ ...money, status: "paid_conflict", review_reason: "Car no longer available after payment" })
      .eq("id", r.id).eq("status", r.status).select("id");
    if (u?.length) await notify("owner_paid_conflict", "", "en", { id: r.id, car: r.vehicle_name, detail: `URGENT: paid booking ${r.id.slice(0, 8).toUpperCase()} conflicts with another booking — contact the client` });
    return u?.length ? "paid_conflict" : "duplicate";
  }

  if (r.flow === "gp_request") {
    // Paid in full (charge, not a hold) → request goes to the owner like any other.
    const { data: st } = await db.from("settings").select("*").eq("id", 1).maybeSingle();
    const { DEFAULT_SETTINGS, holdExpiresAt } = await import("@/lib/pricing");
    const now = new Date();
    const { data: g } = await db.from("prereservations").update({ ...money, status: "pending_approval", captured_at: now.toISOString(),
      expires_at: holdExpiresAt(now, new Date(r.pickup_at), { ...DEFAULT_SETTINGS, ...(st ?? {}) }).toISOString() })
      .eq("id", r.id).eq("status", r.status).select("id");
    if (!g?.length) return "duplicate";
    await notify("owner_new", st?.owner_notification_email ?? "", "pt", { id: r.id, car: r.vehicle_name, link: "/admin", detail: `${r.payment_mode === "full" ? "Paid in full" : "Historical order amount paid"} via Global Pays: ${p.amountUsd} USD (${p.method ?? ""}) — approve or decline` });
    await notify("customer_received", r.email, r.language as "en", { id: r.id, car: r.vehicle_name, link: `/${r.language}/booking/${r.token}` });
    await (await import("./measureone-email.server")).measureOneAfterPayment(db, r.id);
    return "pending_approval" as SettleResult;
  }
  const { data: u } = await db.from("prereservations").update({ ...money, status: "confirmed", decided_at: new Date().toISOString() })
    .eq("id", r.id).eq("status", r.status).select("id");
  if (!u?.length) return "duplicate";

  // Same post-approval automation as the Stripe flow, worded for paid in full.
  await notify("owner_confirmed", "", "en", { id: r.id, car: r.vehicle_name, link: "/admin", detail: `Paid in full: ${p.amountUsd} USD (${p.method ?? "Global Pays"})` });
  await enqueueSistemaGestao(db, r.id);
  await customerMessage("confirmed", r);
  return "confirmed";
}

/** Writes the SistemaGestao intake job (client + reservation + documents + contract). Sender is disabled for now. */
export async function enqueueSistemaGestao(db: Admin, bookingId: string) {
  const { data: r } = await db.from("prereservations").select("*").eq("id", bookingId).single();
  if (!r) return;
  const payload = {
    booking_id: r.id, booking_number: r.id.slice(0, 8).toUpperCase(), source: "oniccarrentals.com", flow: "instant",
    client: { first_name: r.first_name, last_name: r.last_name, email: r.email, phone: r.phone, country: r.country, date_of_birth: r.date_of_birth, address: r.address, language: r.language },
    reservation: { vehicle_id: r.vehicle_id, vehicle_name: r.vehicle_name, base_city: r.base_city, service_city: r.service_city, pickup_at: r.pickup_at, return_at: r.return_at,
      pickup_location: r.pickup_location, return_location: r.return_location, flight_number: r.flight_number, addons: r.addons, price_breakdown: r.price_breakdown,
      payment: { provider: r.payment_provider, order_id: r.provider_order_id, paid_amount_usd: r.paid_amount_usd, gross_amount: r.gross_amount, gross_currency: r.gross_currency, fee: r.fee_amount, method: r.payment_method } },
    documents: r.documents,
    actions: ["create_client", "create_reservation", "attach_documents", "generate_contract"],
  };
  await db.from("sistemagestao_outbox").upsert({ booking_id: r.id, payload: payload as Json, status: "pending" }, { onConflict: "booking_id", ignoreDuplicates: true });
  if (!SISTEMAGESTAO_OUTBOX_ENABLED) {
    await db.from("prereservations").update({ sistemagestao_status: "pending", sistemagestao_error: "SistemaGestao integration disabled" }).eq("id", r.id);
  }
}

/** Instant checkout holds past hold_until → payment_failed (car released, no messages). */
export async function expireInstantHolds(db: Admin) {
  const { data } = await db.from("prereservations").update({ status: "payment_failed", decided_at: new Date().toISOString(), review_reason: "Checkout hold expired (abandoned)" })
    .eq("status", "checkout_hold").or(`hold_until.lt.${new Date().toISOString()},created_at.lt.${(await import("@/lib/pricing")).unpaidHoldCutoff().toISOString()}`).select("id");
  return data?.length ?? 0;
}

/** Global Pays has no refund API: a paid gp_request booking that is declined/expired/cancelled gets a manual refund task + owner alert. */
export async function gpRefundTask(db: Admin, r: { id: string; payment_provider: string | null; flow: string; paid_amount_usd: number | null; vehicle_name: string; gp_refund_due_usd?: number | null }, reason: string, amountUsd?: number) {
  if (r.payment_provider !== "globalpays" || r.flow !== "gp_request" || !r.paid_amount_usd) return false;
  const due = Math.round((amountUsd ?? Number(r.paid_amount_usd)) * 100) / 100;
  if (due <= 0) return false;
  // A mock order is an immutable provider marker: never simulate a real order's refund.
  const { data: current } = await db.from("prereservations").select("provider_order_id, refunded_at, gp_refund_due_usd, gp_refund_marked_at").eq("id", r.id).maybeSingle();
  if (current?.provider_order_id?.startsWith("mock_")) {
    if (amountUsd == null && current.refunded_at) return false;
    const now = new Date().toISOString();
    const { data: u, error } = await db.from("prereservations").update({
      ...(amountUsd == null ? { refunded_at: now } : {}),
      refund_note: `Automatic Global Pays TEST refund: $${due.toFixed(2)} — ${reason}`,
      paid_amount_usd: Math.round(Math.max(0, Number(r.paid_amount_usd) - due) * 100) / 100,
    }).eq("id", r.id).select("id");
    if (error) throw error;
    if (u?.length) await logPaymentEvent(db, { booking_id: r.id, provider_order_id: current.provider_order_id, status: "refunded", outcome: amountUsd == null ? "mock:automatic_full_refund" : "mock:automatic_difference_refund", payload: { amount_usd: due, reason } });
    return !!u?.length;
  }
  // Full refund replaces any difference task with the complete original payment, never double-counts it.
  const taskDue = amountUsd == null ? due : Math.round((Number(current?.gp_refund_due_usd ?? 0) + due) * 100) / 100;
  if (amountUsd == null && Number(current?.gp_refund_due_usd) === taskDue && !current?.gp_refund_marked_at) return false;
  await db.from("prereservations").update({ gp_refund_due_usd: taskDue, gp_refund_marked_at: null, refund_note: `REFUND IN GLOBAL PAYS: $${taskDue.toFixed(2)} — ${reason}` }).eq("id", r.id);
  await notify("owner_refunded", "", "en", { id: r.id, car: r.vehicle_name, link: "/admin", detail: `ACTION NEEDED — REFUND IN GLOBAL PAYS: $${taskDue.toFixed(2)} (${reason}). Refund it in the Global Pays portal, then click "Mark refunded" on the booking.` });
  return true;
}

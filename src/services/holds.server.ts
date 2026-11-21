// Server-only hold lifecycle helpers (expire / approve / decline). Called from admin
// server functions and the scheduled expiry route, always with the service-role client.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cancelIntent, captureIntent, refundIntent, retrieveIntent, retrieveSession, stripeConnected } from "./stripe.server";
import { customerMessage, notify } from "./notify.server";

type Admin = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["prereservations"]["Row"];

/** Links the card-form session to its payment and stores the hold status. Returns the payment id (or null if not paid yet). */
export async function syncHoldFromSession(db: Admin, r: Pick<Row, "id" | "stripe_session_id" | "stripe_payment_intent_id">) {
  if (r.stripe_payment_intent_id) return r.stripe_payment_intent_id;
  if (!r.stripe_session_id || !stripeConnected()) return null;
  const cs = await retrieveSession(r.stripe_session_id);
  if (!cs.payment_intent) return null;
  const pi = await retrieveIntent(cs.payment_intent);
  await db.from("prereservations").update({ stripe_payment_intent_id: pi.id, stripe_status: pi.status, ...(pi.status === "succeeded" ? { captured_at: new Date().toISOString(), paid_amount_usd: pi.amount / 100 } : {}) }).eq("id", r.id).is("stripe_payment_intent_id", null);
  return pi.id;
}

/** Accepted substitute difference: provider-verified, recorded once. */
export async function syncSubstituteDifference(db: Admin, r: Pick<Row, "id" | "balance_session_id" | "balance_paid_at" | "prereservation_amount_usd" | "balance_amount_usd" | "vehicle_name">) {
  const { data: offer } = await db.from("prereservations").select("substitute_status").eq("id", r.id).maybeSingle();
  if (offer?.substitute_status !== "substitute_accepted") return false;
  if (r.balance_paid_at) return true;
  if (!r.balance_session_id || !stripeConnected()) return false;
  const cs = await retrieveSession(r.balance_session_id);
  if (cs.payment_status !== "paid" || !cs.payment_intent) return false;
  const { data: upd } = await db.from("prereservations").update({
    balance_paid_at: new Date().toISOString(), balance_payment_intent_id: cs.payment_intent,
    paid_amount_usd: Number(r.prereservation_amount_usd) + Number(r.balance_amount_usd ?? 0),
  }).eq("id", r.id).is("balance_paid_at", null).select("id");
  if (upd?.length) {
    await notify("owner_approved", "", "pt", { id: r.id, car: r.vehicle_name, link: "/admin/payments", detail: `Substitute difference paid: $${Number(r.balance_amount_usd ?? 0).toFixed(2)}` });
    const { data: paid } = await db.from("prereservations").select("*").eq("id", r.id).maybeSingle();
    if (paid) await customerMessage("confirmed", paid);
  }
  return true;
}

/** Owner refund from Admin → Payments (full refund of the captured signal; reason stored). */
export async function refundBooking(db: Admin, id: string, reason: string) {
  const { data: r } = await db.from("prereservations").select("*").eq("id", id).maybeSingle();
  if (!r) throw new Error("Not found");
  if (r.refunded_at) throw new Error("Already refunded");
  const pi = r.stripe_payment_intent_id;
  if (!pi) throw new Error("No card payment on this booking");
  const cur = await retrieveIntent(pi);
  let status: string;
  if (cur.status === "requires_capture") status = (await cancelIntent(pi)).status;
  else if (cur.status === "succeeded") { const rf = await refundIntent(pi, reason); await db.from("prereservations").update({ stripe_refund_id: rf.id }).eq("id", id); status = "refunded"; }
  else throw new Error(`Nothing to refund (status: ${cur.status})`);
  await db.from("prereservations").update({ stripe_status: status, refunded_at: new Date().toISOString(), refund_note: reason }).eq("id", id).is("refunded_at", null);
  return { status };
}

async function safeCancel(pi: string | null) {
  if (!pi || !stripeConnected()) return null;
  try {
    const cur = await retrieveIntent(pi);
    if (["requires_capture", "requires_payment_method", "requires_confirmation", "requires_action"].includes(cur.status)) {
      return (await cancelIntent(pi)).status;
    }
    if (cur.status === "succeeded") { await refundIntent(pi, "Request declined or expired"); return "refunded"; }
    return cur.status;
  } catch (e) {
    console.error("[holds] cancel failed", pi, e);
    await notify("owner_hold_failed", "", "en", { car: pi, detail: `Could not refund payment or cancel historical authorization: ${e instanceof Error ? e.message : String(e)}` });
    return "cancel_failed";
  }
}

export async function expireDue(db: Admin) {
  await (await import("./substitute.server")).processSubstitutes(db);
  const { data: due } = await db.from("prereservations").select("*")
    .in("status", ["draft", "pending_approval"]).lt("expires_at", new Date().toISOString()).limit(100);
  let n = 0;
  for (const r of due ?? []) {
    const stripe_status = await safeCancel(await syncHoldFromSession(db, r).catch(() => r.stripe_payment_intent_id));
    const { data: upd } = await db.from("prereservations")
      .update({ status: "expired", decided_at: new Date().toISOString(), ...(stripe_status ? { stripe_status } : {}), ...(stripe_status === "refunded" || stripe_status === "canceled" ? { refunded_at: new Date().toISOString(), refund_note: "Automatic full release/refund — expired" } : {}) })
      .eq("id", r.id).eq("status", r.status).select("id");
    if (upd?.length) {
      n++;
      await (await import("./instant.server")).gpRefundTask(db, r, "request expired");
      await notify("owner_expired", "", "en", { car: r.vehicle_name, link: "/admin/reservations", detail: `${r.first_name} ${r.last_name}` });
      if (stripe_status === "cancel_failed") await notify("owner_hold_failed", "", "en", { car: r.vehicle_name, detail: "Payment refund or historical authorization cancellation failed on expiry" });
      if (r.status === "pending_approval") await customerMessage("expired", r);
    }
  }
  return n;
}

export async function approve(db: Admin, id: string) {
  const { data: r } = await db.from("prereservations").select("*").eq("id", id).maybeSingle();
  if (!r) throw new Error("Not found");
  if (r.status !== "pending_approval") throw new Error(`Cannot approve a request that is ${r.status}`);
  if (new Date(r.expires_at) < new Date()) throw new Error("This request has expired");

  let stripe_status = r.stripe_status;
  let captured_at: string | null = r.captured_at;
  if (r.stripe_payment_intent_id) {
    if (!stripeConnected()) throw new Error("Stripe is not connected — cannot verify the payment");
    const cur = await retrieveIntent(r.stripe_payment_intent_id).catch(async (e) => {
      await notify("owner_hold_failed", "", "en", { car: r.vehicle_name, detail: `Could not verify Stripe payment: ${e instanceof Error ? e.message : String(e)}` });
      throw e;
    });
    if (cur.status === "requires_capture") {
      stripe_status = (await captureIntent(r.stripe_payment_intent_id)).status; // idempotent key: capture-<pi>
      captured_at = new Date().toISOString();
    } else if (cur.status === "succeeded") {
      stripe_status = "succeeded"; // already paid — never capture twice
      captured_at = r.captured_at ?? new Date().toISOString();
    } else {
      await notify("owner_hold_failed", "", "en", { car: r.vehicle_name, detail: `Payment not completed (status: ${cur.status})` });
      throw new Error(`Payment not completed (status: ${cur.status})`);
    }
  }
  const { data: upd } = await db.from("prereservations")
    .update({ status: "approved", decided_at: new Date().toISOString(), stripe_status, captured_at })
    .eq("id", id).eq("status", "pending_approval").select("id");
  if (!upd?.length) throw new Error("Request was already processed");
  await notify("owner_approved", "", "en", { id, car: r.vehicle_name, link: "/admin" });
  await customerMessage("approved", r);
  return { ok: true };
}

export async function decline(db: Admin, id: string) {
  const { data: r } = await db.from("prereservations").select("*").eq("id", id).maybeSingle();
  if (!r) throw new Error("Not found");
  if (!["pending_approval", "draft"].includes(r.status)) throw new Error(`Cannot decline a request that is ${r.status}`);
  const stripe_status = await safeCancel(await syncHoldFromSession(db, r).catch(() => r.stripe_payment_intent_id));
  const { data: upd } = await db.from("prereservations")
    .update({ status: "declined", decided_at: new Date().toISOString(), ...(stripe_status ? { stripe_status } : {}), ...(stripe_status === "refunded" || stripe_status === "canceled" ? { refunded_at: new Date().toISOString(), refund_note: "Automatic full release/refund — declined" } : {}) })
    .eq("id", id).eq("status", r.status).select("id");
  if (!upd?.length) throw new Error("Request was already processed");
  await (await import("./instant.server")).gpRefundTask(db, r, "declined by owner");
  await notify("owner_declined", "", "en", { car: r.vehicle_name, link: "/admin/reservations" });
  await customerMessage("declined", r);
  return { ok: true };
}


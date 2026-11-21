import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listPrereservations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { expireDue } = await import("./holds.server");
    await expireDue(db);
    const { expireInstantHolds } = await import("./instant.server");
    await expireInstantHolds(db);
    const { data, error } = await context.supabase.from("prereservations").select("*, vehicle:vehicles(name,color,city,internal_label,photos,body_category,category)").not("status", "in", "(draft,checkout_hold)").order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const documentLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: r } = await context.supabase.from("prereservations").select("documents").eq("id", data.id).maybeSingle();
    const docs = (r?.documents ?? {}) as Record<string, string>;
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const out: Record<string, string> = {};
    for (const [k, path] of Object.entries(docs)) {
      if (!["licenseFront", "licenseBack", "passport", "secondLicense"].includes(k) || typeof path !== "string") continue;
      const { data: s } = await db.storage.from("customer-documents").createSignedUrl(path, 300); // 5 minutes
      if (s?.signedUrl) out[k] = s.signedUrl;
    }
    if (typeof docs["insurancePolicy"] === "string") {
      const { data: s } = await db.storage.from("customer-documents").createSignedUrl(docs["insurancePolicy"], 300);
      if (s?.signedUrl) out["insurancePolicy"] = s.signedUrl;
    }
    // Additional driver (free first driver): labelled separately so admins never confuse his files with the main driver's.
    const add = (r?.documents as { additionalDriver?: Record<string, string> } | null)?.additionalDriver;
    if (add && typeof add === "object") {
      const labels: Record<string, string> = { licenseFront: "license front", licenseBack: "license back", passport: "passport" };
      for (const [k, label] of Object.entries(labels)) {
        const path = add[k];
        if (typeof path !== "string") continue;
        const { data: s } = await db.storage.from("customer-documents").createSignedUrl(path, 300);
        if (s?.signedUrl) out[`Additional driver (${add["fullName"] ?? ""}) — ${label}`] = s.signedUrl;
      }
    }
    return out;
  });

export const reviewDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; decision: string }) => z.object({ id: z.string().uuid(), decision: z.enum(["approved", "rejected"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { error } = await db.from("prereservations").update({ documents_status: data.decision } as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    const { audit } = await import("./substitute.server");
    await audit(db, data.id, `documents_${data.decision}`, context.userId);
    return { ok: true };
  });

export const updateInsuranceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: string; reason?: string | null }) => z.object({ id: z.string().uuid(), status: z.enum(["pending_review", "verified", "denied"]), reason: z.enum(["not_active", "missing_collision_comprehensive", "liability_below_minimum", "deductible_too_high"]).nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { setInsuranceStatus, liveInsuranceDeps } = await import("./insurance.server");
    const r = await setInsuranceStatus(await liveInsuranceDeps(db), data.id, data.status, data.reason ?? null);
    const { audit } = await import("./substitute.server");
    await audit(db, data.id, `insurance_${data.status}`, context.userId);
    return r;
  });

export const approvePrereservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { approve } = await import("./holds.server");
    return approve(supabaseAdmin, data.id);
  });

export const declinePrereservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decline } = await import("./holds.server");
    return decline(supabaseAdmin, data.id);
  });

export const adminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const { stripeConnected } = await import("./stripe.server");
    const { emailHealth } = await import("./resend-email.server");
    const email = data ? await emailHealth() : { connected: false, status: "not_connected" };
    return { isAdmin: !!data, stripeConnected: stripeConnected(), emailConnected: email.connected, emailStatus: email.status };
  });

/** Settings-resolved owner-only delivery check; never references or changes a booking. */
export const testBookingEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { sendResendEmail, OWNER_EMAIL } = await import("./resend-email.server");
    const { bookingNotificationEmail } = await import("@/lib/bookingEmail");
    const { data: settings, error: settingsError } = await db.from("settings").select("owner_notification_email").eq("id", 1).maybeSingle();
    if (settingsError) throw new Error("Could not read booking notification email");
    const recipient = bookingNotificationEmail(settings?.owner_notification_email);
    const { emailHtml } = await import("@/lib/emailLayout");
    const { logNotification } = await import("./whatsapp.server");
    const { SITE_URL } = await import("./notify.server");
    const subject = "TESTE — Onic Car Rentals · nova configuração de notificações de reservas";
    const base = { channel: "email", kind: "owner_email_test", recipient };
    try {
      const result = await sendResendEmail({ to: recipient, subject,
        html: emailHtml({ siteUrl: SITE_URL(), lang: "pt", subject, lines: ["Teste de envio do Onic Car Rentals. Nenhuma reserva ou pagamento foi alterado."], footer: OWNER_EMAIL }),
        idempotencyKey: `owner-email-test-${recipient}-${new Date().toISOString().slice(0, 10)}` });
      await logNotification(db, { ...base, status: "sent", detail: `Resend id=${result.id}` });
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await logNotification(db, { ...base, status: "failed", detail: reason });
      return { sent: false as const, reason };
    }
  });

/** Refunds are made in the Global Pays portal; this records it here (note required). */
export const markRefunded = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; note: string }) => z.object({ id: z.string().uuid(), note: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: u } = await db.from("prereservations").update({ status: "refunded", refunded_at: new Date().toISOString(), refund_note: data.note })
      .eq("id", data.id).eq("flow", "instant").neq("status", "refunded").select("id");
    if (!u?.length) throw new Error("Not an instant booking, or already refunded");
    const { logPaymentEvent } = await import("./instant.server");
    await logPaymentEvent(db, { booking_id: data.id, status: "refunded", outcome: "admin:mark_refunded", payload: { note: data.note } });
    return { ok: true };
  });

/** Closes a "REFUND IN GLOBAL PAYS" task (refund done by the owner in the Global Pays portal). Status is not changed. */
export const markGpRefunded = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; note: string }) => z.object({ id: z.string().uuid(), note: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { data: u } = await db.from("prereservations").update({ gp_refund_marked_at: now, refunded_at: now, refund_note: data.note })
      .eq("id", data.id).not("gp_refund_due_usd", "is", null).is("gp_refund_marked_at", null).select("id, gp_refund_due_usd");
    if (!u?.length) throw new Error("No open Global Pays refund task");
    const { logPaymentEvent } = await import("./instant.server");
    await logPaymentEvent(db, { booking_id: data.id, status: "refunded", outcome: "admin:gp_refund_marked", payload: { note: data.note, amount: u[0]!.gp_refund_due_usd } });
    return { ok: true };
  });

/** Global Pays status for Settings: mode + which secrets are set (never values). */
export const globalPaysStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { gpConfig, loadGpSwitch } = await import("./globalpays.server");
    await loadGpSwitch();
    const c = gpConfig();
    return { liveOn: c.liveOn, hasCreds: c.hasCreds, mode: c.mode, declared: c.declared, secrets: c.secrets, webhookEnabled: c.webhookEnabled, cutoff: c.cutoff?.toISOString() ?? null };
  });

export const globalPaysTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { testAuth, loadGpSwitch } = await import("./globalpays.server");
    await loadGpSwitch();
    return testAuth();
  });

/** Owner sets the delivery fee on a "to be confirmed" booking. Same-city → itemized; cross-city → embedded in the daily price. */
export const setDeliveryFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; fee: number }) => z.object({ id: z.string().uuid(), fee: z.number().min(0).max(10000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { allInPrice, composeTotals } = await import("@/lib/pricing");
    const { data: r } = await db.from("prereservations").select("*").eq("id", data.id).maybeSingle();
    if (!r || !["quote_pending", "set_by_owner"].includes(r.delivery_status ?? "")) throw new Error("This booking has no delivery quote to set");
    if (!["draft", "pending_approval", "approved"].includes(r.status)) throw new Error("Booking is closed");
    const pb = (r.price_breakdown ?? {}) as Record<string, any>;
    const days = Number(pb["days"] ?? 1), addons = Number(pb["addonsTotal"] ?? 0);
    const cross = r.logistics_mode != null;
    const fixed = { basicInsurance: Number(pb["basicInsurance"] ?? 0), tolls: Number(pb["tolls"] ?? 0), solidWaste: Number(pb["solidWaste"] ?? 0), addonsTotal: addons, discount: Number(pb["discount"] ?? 0), taxRatePct: Number(pb["taxRate"] ?? 0), applied: (pb["customFees"] ?? []) as never[], days };
    const baseDaily = r.base_daily_usd != null ? Number(r.base_daily_usd) : null;
    let upd: Record<string, unknown>;
    const base = baseDaily != null ? baseDaily * days : Number(pb["base"] ?? 0);
    const np = { ...pb, dailyRate: baseDaily ?? pb["dailyRate"], base, deliveryFee: data.fee,
      ...composeTotals({ ...fixed, base, deliveryFee: data.fee }),
      delivery: { ...(pb["delivery"] ?? {}), status: "set_by_owner", fee: data.fee } };
    upd = { delivery_fee_usd: data.fee, ...(cross ? { logistics_fee_usd: data.fee, all_in_daily_usd: null } : {}), price_breakdown: np };
    await db.from("prereservations").update({ ...upd, delivery_status: "set_by_owner" }).eq("id", data.id);
    // Normal customer update: their booking link, which shows the recalculated total.
    const { notify, SITE_URL } = await import("./notify.server");
    const lang = (["en", "pt", "es"].includes(r.language) ? r.language : "en") as "en" | "pt" | "es";
    const npb = (upd["price_breakdown"] ?? {}) as { total?: number | null };
    await notify("customer_link", r.email, lang, { id: r.id, car: r.vehicle_name, link: `${SITE_URL()}/${lang}/booking/${r.token}`, detail: npb.total != null ? `total $${npb.total.toFixed(2)}` : "" });
    return { ok: true, total: npb.total ?? null };
  });

/** Owner edits a fleet base: geocode first; only a located address (with lat/lng) is saved, otherwise the old base stays. Every change is logged. */
export const setFleetBase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fleet: string; address: string }) => z.object({ fleet: z.enum(["orlando", "miami"]), address: z.string().trim().min(5).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { geocodeBase } = await import("./distance.server");
    const g = await geocodeBase(data.address);
    if (!g) return { ok: false as const, error: "Address could not be located — the previous base was kept." };
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: st } = await db.from("settings").select("delivery_config").eq("id", 1).single();
    const cfg = ((st?.delivery_config ?? {}) as Record<string, any>);
    const bases = { ...(cfg["bases"] ?? {}) } as Record<string, { address: string; lat: number; lng: number }>;
    const old = bases[data.fleet] ?? null;
    const next = { address: data.address, lat: Math.round(g.lat * 1e6) / 1e6, lng: Math.round(g.lng * 1e6) / 1e6 };
    bases[data.fleet] = next;
    const { error } = await db.from("settings").update({ delivery_config: { ...cfg, bases }, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) return { ok: false as const, error: "Could not save — the previous base was kept." };
    const email = String((context as any).claims?.email ?? "");
    await db.from("fleet_base_changes").insert({ changed_by: context.userId, changed_by_email: email, fleet: data.fleet, old_base: old, new_base: { ...next, resolved: g.address, provider: g.provider } });
    return { ok: true as const, base: next, resolved: g.address, provider: g.provider };
  });

/** Owner-only Global Pays "real payments" switch. Turning ON requires the exact typed phrase and saved credentials. */
export const setGlobalPaysLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { on: boolean; phrase?: string }) => z.object({ on: z.boolean(), phrase: z.string().max(100).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { LIVE_CONFIRM_PHRASE, gpConfig } = await import("./globalpays.server");
    if (data.on && data.phrase !== LIVE_CONFIRM_PHRASE) return { ok: false as const, error: `Type exactly: ${LIVE_CONFIRM_PHRASE}` };
    if (data.on && !gpConfig().hasCreds) return { ok: false as const, error: "Global Pays production credentials are not saved yet." };
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    await db.from("settings").update({ globalpays_live: data.on, globalpays_live_changed_at: new Date().toISOString(), globalpays_live_changed_by: String((context as any).claims?.email ?? "") }).eq("id", 1);
    return { ok: true as const, on: data.on };
  });

/** Admin → Payments: every booking with money on it + the latest provider events. */
export const listPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const [{ data: rows }, { data: events }] = await Promise.all([
      db.from("prereservations").select("id, created_at, status, flow, vehicle_name, first_name, last_name, is_test, payment_provider, payment_mode, prereservation_amount_usd, price_breakdown, stripe_status, stripe_payment_intent_id, captured_at, refunded_at, refund_note, balance_amount_usd, balance_paid_at, paid_amount_usd, provider_order_id, email, payment_method, gp_amount_brl, gp_installments, gp_quote, settled_at, gp_refund_due_usd")
        .or("stripe_session_id.not.is.null,payment_provider.not.is.null").order("created_at", { ascending: false }).limit(200),
      db.from("payment_events").select("created_at, provider, booking_id, status, outcome, provider_order_id").order("created_at", { ascending: false }).limit(100),
    ]);
    const { stripeConnected, stripeMode } = await import("./stripe.server");
    const { gpAdminRows } = await import("@/lib/gpPayments");
    return { rows: rows ?? [], gp: gpAdminRows((rows ?? []) as never), events: events ?? [], stripeConnected: stripeConnected(), stripeTest: stripeConnected() && stripeMode() === "sandbox" };
  });

export const refundPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; reason: string }) => z.object({ id: z.string().uuid(), reason: z.string().trim().min(3).max(400) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { refundBooking } = await import("./holds.server");
    try { return { ok: true as const, ...(await refundBooking(db, data.id, data.reason)) }; }
    catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : String(e) }; }
  });

export const substituteOptionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; allowCheaper: boolean }) => z.object({ id: z.string().uuid(), allowCheaper: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return (await import("./substitute.server")).substituteOptions(supabaseAdmin, data.id, data.allowCheaper);
  });

export const offerSubstituteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; vehicleId: string }) => z.object({ id: z.string().uuid(), vehicleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return (await import("./substitute.server")).offerSubstitute(supabaseAdmin, data.id, data.vehicleId, `admin:${context.userId}`);
  });

export const bookingAuditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows } = await context.supabase.from("booking_audit").select("created_at, actor, action, detail").eq("prereservation_id", data.id).order("created_at");
    return (rows ?? []).map((r) => ({ created_at: r.created_at, actor: r.actor, action: r.action, detail: JSON.stringify(r.detail) }));
  });

/** Orphaned payments (paid in Stripe, no booking) + bookings paid in Stripe but still unfinished. */
export const listPaymentProblems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const [{ data: orphans }, { data: stuck }] = await Promise.all([
      db.from("payment_orphans").select("id, created_at, stripe_session_id, stripe_payment_intent_id, booking_id, amount_usd, customer_name, customer_email, reason, status").eq("status", "open").order("created_at", { ascending: false }).limit(200),
      db.from("prereservations").select("id, created_at, vehicle_name, first_name, last_name, email, prereservation_amount_usd, paid_amount_usd, stripe_session_id, stripe_payment_intent_id, stripe_status, status, captured_at")
        .in("status", ["draft"]).or("stripe_status.in.(succeeded,requires_capture),captured_at.not.is.null").order("created_at", { ascending: false }).limit(200),
    ]);
    return { orphans: orphans ?? [], stuck: stuck ?? [] };
  });

/** Idempotent recovery: creates the booking from the verified paid payment (never twice). */
export const recoverPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orphanId?: string; bookingId?: string }) => z.object({ orphanId: z.string().uuid().optional(), bookingId: z.string().uuid().optional() }).refine((v) => v.orphanId || v.bookingId).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { finalizePaidBooking } = await import("./finalize.server");
    let bookingId = data.bookingId ?? null;
    let orphan: { id: string; booking_id: string | null; stripe_session_id: string | null; stripe_payment_intent_id: string | null } | null = null;
    if (data.orphanId) {
      orphan = (await db.from("payment_orphans").select("id, booking_id, stripe_session_id, stripe_payment_intent_id").eq("id", data.orphanId).maybeSingle()).data;
      if (!orphan) return { ok: false as const, error: "Record not found" };
      bookingId = orphan.booking_id;
      if (!bookingId && orphan.stripe_session_id) bookingId = (await db.from("prereservations").select("id").eq("stripe_session_id", orphan.stripe_session_id).maybeSingle()).data?.id ?? null;
      if (!bookingId && orphan.stripe_payment_intent_id) bookingId = (await db.from("prereservations").select("id").eq("stripe_payment_intent_id", orphan.stripe_payment_intent_id).maybeSingle()).data?.id ?? null;
      if (!bookingId && orphan.stripe_session_id) {
        try {
          const { retrieveSession } = await import("./stripe.server");
          const m = (await retrieveSession(orphan.stripe_session_id)).metadata?.["prereservation_id"];
          if (m) bookingId = (await db.from("prereservations").select("id").eq("id", m).maybeSingle()).data?.id ?? null;
        } catch { /* reported below */ }
      }
      if (!bookingId) return { ok: false as const, error: "No booking details (car, dates, driver) were saved for this payment, so it cannot be turned into a booking automatically. Contact the customer, then book manually or refund in Stripe." };
    }
    try {
      const res = await finalizePaidBooking(db, bookingId!, { source: "admin" });
      if (res.outcome === "finalized" || res.outcome === "already") {
        if (orphan) await db.from("payment_orphans").update({ status: "recovered", booking_id: bookingId, resolved_at: new Date().toISOString() }).eq("id", orphan.id);
        return { ok: true as const, outcome: res.outcome, bookingId };
      }
      if (res.outcome === "not_paid") return { ok: false as const, error: `Stripe does not show this payment as paid (status: ${res.stripeStatus})` };
      if (res.outcome === "inactive") return { ok: false as const, error: `The booking is ${res.status}; it was not reopened automatically.` };
      return { ok: false as const, error: res.outcome === "blocked" ? "This booking is locked (processed manually)" : "Booking not found" };
    } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : String(e) }; }
  });

export const dismissOrphan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    await db.from("payment_orphans").update({ status: "dismissed", resolved_at: new Date().toISOString() }).eq("id", data.id).eq("status", "open");
    return { ok: true };
  });

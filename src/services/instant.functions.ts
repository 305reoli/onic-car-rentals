import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { createSchema, docsRow, hasRequiredDocs } from "./booking-schema";

/** Public checkout never falls back to the built-in simulator. */
async function instantAvailableForCaller() {
  const { gpConfig, loadGpSwitch, hostedCheckoutAvailable } = await import("./globalpays.server");
  await loadGpSwitch();
  const c = gpConfig();
  return { ok: hostedCheckoutAvailable(c), mock: c.mode !== "production" };
}

/** Global Pays option for a booking request: real hosted checkout, or the simulator for a signed-in admin only (test). */
async function gpAvailableForCaller() {
  const gp = await import("./globalpays.server");
  await gp.loadGpSwitch();
  const c = gp.gpConfig();
  if (gp.hostedCheckoutAvailable(c)) return { ok: true, test: c.mode !== "production" };
  if (c.mode === "mock" && (await (await import("./booking-core.server")).callerIsAdmin())) return { ok: true, test: true };
  return { ok: false, test: true };
}

/** The ONLY public signal about a car's flow: "instant" or "request". Nothing else is returned. */
export const getCheckoutFlow = createServerFn({ method: "GET" })
  .inputValidator((d: { vehicleId: string }) => z.object({ vehicleId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<"instant" | "request"> => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: v } = await db.from("vehicles").select("instant_full_booking, daily_price_usd").eq("id", data.vehicleId).eq("active", true).maybeSingle();
    if (!v?.instant_full_booking || !(Number(v.daily_price_usd) > 0)) return "request";
    return (await instantAvailableForCaller()).ok ? "instant" : "request";
  });

/** Step 1 of the instant flow: validates everything server-side and places a 15-minute hold on the car and dates. */
export const startInstantCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof createSchema>) => createSchema.parse(d))
  .handler(async ({ data }) => {
    await (await import("./globalpays.server")).loadGpSwitch();
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { validateBooking, carIsFree } = await import("./booking-core.server");
    const { INSTANT_HOLD_MINUTES } = await import("@/lib/pricing");
    const avail = await instantAvailableForCaller();
    if (!avail.ok) throw new Error("FLOW_UNAVAILABLE");
    const { v, city, pickup, ret, q, now, delivery, bookingFields, breakdown } = await validateBooking(db, data).catch((e) => { console.error("[instant] validate", e instanceof Error ? e.message : e); throw e; });
    if (!v.instant_full_booking || q.total == null) throw new Error("FLOW_UNAVAILABLE");
    // No automatic delivery price → cannot charge a full total; the client switches to the request flow.
    if (delivery.status !== "priced") throw new Error("DELIVERY_QUOTE");
    const holdUntil = new Date(now.getTime() + INSTANT_HOLD_MINUTES * 60000);
    const { data: row, error } = await db.from("prereservations").insert({
      status: "checkout_hold", flow: "instant", payment_provider: "globalpays", hold_until: holdUntil.toISOString(), expires_at: holdUntil.toISOString(),
      checkout_capture_token: data.captureToken ?? null,
      vehicle_id: v.id, vehicle_name: v.name,
      first_name: data.driver.firstName, last_name: data.driver.lastName, email: data.driver.email, phone: data.driver.phone,
      country: data.driver.country, date_of_birth: data.driver.dateOfBirth, address: data.driver.address, flight_number: data.driver.flightNumber || null,
      pickup_at: pickup.toISOString(), return_at: ret.toISOString(),
      addons: data.addons, price_breakdown: breakdown, ...bookingFields, service_city: city.slug, base_city: v.city,
      prereservation_amount_usd: q.total,
      documents: docsRow(data.documents),
      whatsapp_opt_in: data.whatsappOptIn, language: data.language, is_test: avail.mock,
    }).select("id, token, created_at").single();
    if (error || !row) { console.error("[instant] insert", error?.message); throw new Error("Could not start checkout"); }
    // Race guard: if another blocking booking slipped in at the same moment, the later hold gives way.
    const { data: rivals } = await db.from("prereservations").select("id, created_at").eq("vehicle_id", v.id).neq("id", row.id)
      .eq("status", "checkout_hold").gt("hold_until", now.toISOString()).gt("created_at", (await import("@/lib/pricing")).unpaidHoldCutoff(now).toISOString()).lt("pickup_at", ret.toISOString()).gt("return_at", pickup.toISOString());
    const lost = (rivals ?? []).some((x) => x.created_at < row.created_at || (x.created_at === row.created_at && x.id < row.id));
    if (lost || !(await carIsFree(db, v.id, v.blocked_dates ?? [], pickup, ret, row.id))) {
      await db.from("prereservations").update({ status: "payment_failed", review_reason: "Lost hold race" }).eq("id", row.id);
      throw new Error("UNAVAILABLE");
    }
    return { token: row.token, total: q.total, holdUntil: holdUntil.toISOString() };
  });

/** Step 2: terms accepted → availability re-checked → Global Pays order created → hosted checkout URL. */
export const payInstant = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; accepted: boolean }) => z.object({ token: z.string().min(20).max(100), accepted: z.literal(true) }).parse(d))
  .handler(async ({ data }) => {
    await (await import("./globalpays.server")).loadGpSwitch();
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { carIsFree } = await import("./booking-core.server");
    const { createOrder, returnUrl, calculateQuote, scrub, gpConfig, hostedCheckoutAvailable } = await import("./globalpays.server");
    const { gpExpectedUsd } = await import("./instant.server");
    const config = gpConfig();
    const { data: r } = await db.from("prereservations").select("*").eq("token", data.token).maybeSingle();
    // Simulator only for admin test bookings; real modes need full hosted checkout protection.
    if (!hostedCheckoutAvailable(config) && !(config.mode === "mock" && r?.is_test && (await gpAvailableForCaller()).ok)) throw new Error("FLOW_UNAVAILABLE");
    if (!r || !["instant", "gp_request"].includes(r.flow) || r.status !== "checkout_hold") throw new Error("HOLD_EXPIRED");
    if (!r.hold_until || new Date(r.hold_until) < new Date() || new Date(r.created_at) <= (await import("@/lib/pricing")).unpaidHoldCutoff()) throw new Error("HOLD_EXPIRED");
    if (!hasRequiredDocs(r.documents, (r as { identity_verification?: unknown }).identity_verification)) throw new Error("DOCS_REQUIRED");
    const { data: v } = await db.from("vehicles").select("blocked_dates").eq("id", r.vehicle_id ?? "").maybeSingle();
    if (!(await carIsFree(db, r.vehicle_id ?? "", v?.blocked_dates ?? [], new Date(r.pickup_at), new Date(r.return_at), r.id))) throw new Error("UNAVAILABLE");
    if (r.provider_order_id && r.provider_checkout_url) return { url: r.provider_checkout_url }; // same order on retry
    const { data: st } = await db.from("settings").select("terms_version").eq("id", 1).maybeSingle();
    const ip = (getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? "").split(",")[0]!.trim();
    await db.from("prereservations").update({ terms_accepted_at: new Date().toISOString(), terms_ip: ip || null, terms_version: st?.terms_version ?? "v0" }).eq("id", r.id);
    const origin = new URL(getRequest().url).origin;
    const amount = Number(gpExpectedUsd(r));
    if (!(amount > 0)) throw new Error("PAYMENT_UNAVAILABLE");
    try {
      const quote = config.mode === "mock" ? null : await calculateQuote(amount);
      const o = await createOrder({
        amount, invoice: r.id.slice(0, 8).toUpperCase(),
        description: `Sua Locadora — ${r.vehicle_name} (${r.pickup_at.slice(0, 10)} → ${r.return_at.slice(0, 10)})`,
        callback: returnUrl(origin, r.language, r.token),
        client: { name: `${r.first_name} ${r.last_name}`, email: r.email, phone: r.phone, doc: "" },
      }, origin);
      await db.from("prereservations").update({ provider_order_id: o.orderId, provider_checkout_url: o.url, gp_quote: (quote ?? null) as never }).eq("id", r.id).is("provider_order_id", null);
      return { url: o.url };
    } catch (e) {
      console.error("[globalpays] order failed", scrub(e instanceof Error ? e.message : String(e)));
      throw new Error("PAYMENT_UNAVAILABLE");
    }
  });

/** Return page poll. Never trusts the browser: if still open, asks Global Pays directly (fallback for a late webhook). */
export const getInstantStatus = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().min(20).max(100) }).parse(d))
  .handler(async ({ data }) => {
    await (await import("./globalpays.server")).loadGpSwitch();
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { expireInstantHolds, settle, logPaymentEvent } = await import("./instant.server");
    const { consultOrder } = await import("./globalpays.server");
    let { data: r } = await db.from("prereservations").select("id, status, flow, provider_order_id").eq("token", data.token).maybeSingle();
    if (!r || !["instant", "gp_request"].includes(r.flow)) return null;
    if (r.status === "checkout_hold" && r.provider_order_id) {
      const o = await consultOrder(r.provider_order_id).catch(() => null);
      if (o?.status) {
        const out = await settle(db, r.id, o);
        await logPaymentEvent(db, { booking_id: r.id, provider_order_id: r.provider_order_id, status: o.status, outcome: `consult:${out}` });
      }
    }
    await expireInstantHolds(db);
    ({ data: r } = await db.from("prereservations").select("id, status, flow, provider_order_id").eq("token", data.token).maybeSingle());
    return { status: r?.status ?? "unknown" };
  });

/** Brazilian client on a full-payment category (Sports/Exotics, request flow): Global Pays full CHARGE (Pix or card in installments),
 * then the request waits for owner approval. Same 15-minute checkout hold as the instant flow. While the live switch is OFF the
 * option is unavailable. Sandbox bookings are marked as tests. client_type is stored and used for nothing else. */
export const startGpRequest = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof createSchema>) => createSchema.parse(d))
  .handler(async ({ data }) => {
    const avail = await gpAvailableForCaller();
    if (!avail.ok) throw new Error("FLOW_UNAVAILABLE");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { validateBooking, carIsFree } = await import("./booking-core.server");
    const { INSTANT_HOLD_MINUTES, paymentMode, dueAtBooking } = await import("@/lib/pricing");
    const { v, s, city, pickup, ret, q, now, delivery, bookingFields, breakdown } = await validateBooking(db, data);
    if (v.instant_full_booking || q.total == null) throw new Error("FLOW_UNAVAILABLE");
    // Full-payment categories: full total. Regular cars: the due-today amount as a PAYMENT (not a hold).
    const due = dueAtBooking(q, paymentMode(v, (s as { payment_modes?: unknown }).payment_modes));
    if (delivery.status !== "priced") throw new Error("DELIVERY_QUOTE");
    const holdUntil = new Date(now.getTime() + INSTANT_HOLD_MINUTES * 60000);
    const { data: row, error } = await db.from("prereservations").insert({
      status: "checkout_hold", flow: "gp_request", payment_provider: "globalpays", client_type: "brazilian", payment_mode: due.mode,
      checkout_capture_token: data.captureToken ?? null,
      hold_until: holdUntil.toISOString(), expires_at: holdUntil.toISOString(), vehicle_id: v.id, vehicle_name: v.name,
      first_name: data.driver.firstName, last_name: data.driver.lastName, email: data.driver.email, phone: data.driver.phone,
      country: data.driver.country, date_of_birth: data.driver.dateOfBirth, address: data.driver.address, flight_number: data.driver.flightNumber || null,
      pickup_at: pickup.toISOString(), return_at: ret.toISOString(),
      addons: data.addons, price_breakdown: breakdown, ...bookingFields, service_city: city.slug, base_city: v.city,
      prereservation_amount_usd: due.amount,
      documents: docsRow(data.documents),
      whatsapp_opt_in: data.whatsappOptIn, language: data.language, is_test: avail.test,
    }).select("id, token").single();
    if (error || !row) { console.error("[gp_request] insert", error?.message); throw new Error("Could not start checkout"); }
    if (!(await carIsFree(db, v.id, v.blocked_dates ?? [], pickup, ret, row.id))) {
      await db.from("prereservations").update({ status: "payment_failed", review_reason: "Car not free" }).eq("id", row.id);
      throw new Error("UNAVAILABLE");
    }
    return { token: row.token, total: q.total, amount: due.amount, mode: due.mode, holdUntil: holdUntil.toISOString() };
  });

/** Provider quote ("Calcular valores") for the amount Global Pays would charge. Read-only; null → page shows USD only. */
export const getGpQuote = createServerFn({ method: "POST" })
  .inputValidator((d: { amount: number }) => z.object({ amount: z.number().min(1).max(100000) }).parse(d))
  .handler(async ({ data }) => {
    const gp = await import("./globalpays.server");
    return gp.calculateQuote(data.amount);
  });

/** Installment label data for the Brazilian option (interest-free count = admin setting, matches the Global Pays merchant config). */
export const getGpOption = createServerFn({ method: "GET" }).handler(async () => {
  const gp = await import("./globalpays.server");
  await gp.loadGpSwitch();
  const c = gp.gpConfig();
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: st } = await db.from("settings").select("gp_interest_free_installments").eq("id", 1).maybeSingle();
  const a = await gpAvailableForCaller();
  return { available: a.ok, mock: a.test || c.mode !== "production", interestFree: st?.gp_interest_free_installments ?? 6 };
});

/** Meta Purchase for bookings paid on the outside payment page. Event id = booking id (one per booking, shared by browser and server).
 * Only after a successful settlement; the server event is sent once per booking (guarded in payment_events). */
export const trackInstantPurchase = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; sourceUrl: string; fbp?: string | undefined; fbc?: string | undefined }) => z.object({ token: z.string().min(20).max(100), sourceUrl: z.string().url().max(2000), fbp: z.string().max(300).optional(), fbc: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: r } = await db.from("prereservations").select("id, flow, status, settled_at, paid_amount_usd, price_breakdown, vehicle_id").eq("token", data.token).maybeSingle();
    if (!r || !["instant", "gp_request"].includes(r.flow) || !r.settled_at || !["confirmed", "pending_approval", "approved"].includes(r.status)) return null;
    const value = r.paid_amount_usd;
    if (value == null || value <= 0) return null;
    const { data: v } = await db.from("vehicles").select("slug").eq("id", r.vehicle_id ?? "").maybeSingle();
    const contentId = v?.slug ?? "";
    const { data: sent } = await db.from("payment_events").select("id").eq("booking_id", r.id).eq("outcome", "meta_capi_purchase").limit(1);
    if (!sent?.length) {
      const { sendMetaPurchase } = await import("./meta-capi.server");
      const ip = (getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? "").split(",")[0]!.trim();
      const attempted = await sendMetaPurchase({ eventId: r.id, value, contentId, sourceUrl: data.sourceUrl, ip, ua: getRequestHeader("user-agent") ?? "", country: getRequestHeader("cf-ipcountry") ?? null, gpc: getRequestHeader("sec-gpc") === "1", fbp: data.fbp, fbc: data.fbc });
      if (attempted) await db.from("payment_events").insert({ provider: "meta", booking_id: r.id, status: "", outcome: "meta_capi_purchase", payload: {} });
    }
    return { eventId: r.id, value, contentId };
  });

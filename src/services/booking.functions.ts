import { INSURANCE_PATH, initialInsurance, measureOneLink, usInsuranceFlow } from "@/lib/insurance";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { additionalDriverSchema, createSchema, docsInFolder, docsRow, hasRequiredDocs } from "./booking-schema";
import { holdExpiresAt } from "@/lib/pricing";

const DOC_KINDS = ["licenseFront", "licenseBack", "passport", "secondLicense", "addLicenseFront", "addLicenseBack", "addPassport", "insurancePolicy"] as const;
const ADD_KINDS: readonly string[] = ["addLicenseFront", "addLicenseBack", "addPassport"];

export const getStripePublic = createServerFn({ method: "GET" }).handler(async () => {
  const { stripeConnected, stripeMode } = await import("./stripe.server");
  const ok = stripeConnected();
  return { connected: ok, stripeMode: stripeMode(), adminTest: !ok && (await (await import("./booking-core.server")).callerIsAdmin()) };
});

/** "My booking" lookup by email + booking code. Emails the private link; returns it directly only when both match. */
export const lookupBooking = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; code: string; lang: "en" | "pt" | "es" }) =>
    z.object({ email: z.string().trim().email().max(200), code: z.string().trim().regex(/^[0-9a-fA-F-]{6,36}$/), lang: z.enum(["en", "pt", "es"]) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { notify } = await import("./notify.server");
    const { data: rows } = await db.from("prereservations").select("id, token, email, language, vehicle_name")
      .ilike("email", data.email.replace(/[%_\\]/g, "")).neq("status", "draft").order("created_at", { ascending: false }).limit(50);
    const code = data.code.toLowerCase().replace(/-/g, "");
    const r = (rows ?? []).find((x) => x.id.replace(/-/g, "").startsWith(code) && code.length >= 8);
    if (!r) return { found: false as const, token: null };
    await notify("customer_link", r.email, data.lang, { car: r.vehicle_name, link: `/${data.lang}/booking/${r.token}` });
    return { found: true as const, token: r.token };
  });

/** Signed upload URLs into the PRIVATE customer-documents bucket (one per document). */
export const getDocumentUploadUrls = createServerFn({ method: "POST" })
  .inputValidator((d: { exts: Record<string, string>; folder?: string; capability?: string }) =>
    z.object({ exts: z.record(z.enum(["jpg", "jpeg", "png", "heic", "heif", "pdf"])), folder: z.string().regex(/^uploads\/[0-9a-f-]{36}$/).optional(), capability: z.string().length(64).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { documentCapability } = await import("./document-ai.server");
    if (data.folder && (!data.capability || await documentCapability(data.folder) !== data.capability)) throw new Error("Invalid upload authorization");
    const folder = data.folder || `uploads/${crypto.randomUUID()}`;
    const out: Record<string, { path: string; token: string }> = {};
    for (const kind of DOC_KINDS) {
      const ext = data.exts[kind];
      if (!ext) continue;
      if (ADD_KINDS.includes(kind) && !["jpg", "jpeg", "png"].includes(ext)) throw new Error("Additional driver documents must be JPEG or PNG");
      if (ext === "pdf" && kind !== "insurancePolicy") throw new Error("PDF is accepted only for the insurance policy");
      const path = `${folder}/${kind}.${ext}`;
      const { data: s, error } = await supabaseAdmin.storage.from("customer-documents").createSignedUploadUrl(path);
      if (error || !s) throw new Error("Upload unavailable");
      out[kind] = { path, token: s.token };
    }
    return { folder, urls: out, capability: await documentCapability(folder) };
  });

/** Creates a draft pre-reservation with server-computed prices and (when Stripe is connected) a full-total charge. */
export const createPrereservation = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof createSchema>) => createSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { createCardSession, stripeConnected, stripeMode } = await import("./stripe.server");
    const { createHold } = await import("./sistemagestao-adapter.server");
    const { validateBooking } = await import("./booking-core.server");

    // No payment possible while Stripe is off: only the signed-in owner may create TEST requests.
    const isTest = !stripeConnected();
    if (isTest && !(await (await import("./booking-core.server")).callerIsAdmin())) throw new Error("BOOKING_OFFLINE");

    const { v, s, city, pickup, ret, q, now, delivery, bookingFields, breakdown } = await validateBooking(db, data);
    // Every new booking charges 100% immediately, for every category.
    const { dueAtBooking, paymentMode, stripeBookingIsHold } = await import("@/lib/pricing");
    const due = dueAtBooking(q, paymentMode(v, (s as { payment_modes?: unknown }).payment_modes));
    if (q.total == null || due.amount <= 0 || delivery.status !== "priced") throw new Error("PAYMENT_UNAVAILABLE");
    const hold = stripeBookingIsHold(v.body_category);

    const { data: row, error } = await db.from("prereservations").insert({
      status: "draft", vehicle_id: v.id, vehicle_name: v.name,
      checkout_capture_token: data.captureToken ?? null,
      first_name: data.driver.firstName, last_name: data.driver.lastName, email: data.driver.email, phone: data.driver.phone,
      country: data.driver.country, date_of_birth: data.driver.dateOfBirth, address: data.driver.address, flight_number: data.driver.flightNumber || null,
      pickup_at: pickup.toISOString(), return_at: ret.toISOString(),
      addons: data.addons, price_breakdown: breakdown, ...bookingFields, service_city: city.slug, base_city: v.city, prereservation_amount_usd: due.amount, payment_mode: due.mode, ...(due.mode === "full" ? { client_type: "international" } : {}),
      documents: docsRow(data.documents),
      whatsapp_opt_in: data.whatsappOptIn,
      language: data.language, expires_at: holdExpiresAt(now, pickup, s).toISOString(), is_test: isTest,
    }).select("id, token").single();
    if (error || !row) throw new Error("Could not create request");

    let clientSecret: string | null = null;
    if (stripeConnected()) {
      const cs = await createCardSession({
        amountUsd: due.amount, name: due.mode === "full" ? `Full payment due today — ${v.name}` : `Pre-reservation — ${v.name}`, email: data.driver.email, hold,
        meta: { prereservation_id: row.id, kind: hold ? "hold" : "full_payment" }, idem: `hold-${row.id}`,
      }).catch(async (e) => {
        const { notify } = await import("./notify.server");
        await notify("owner_hold_failed", "", "en", { car: v.name, detail: `Could not start full payment: ${e instanceof Error ? e.message : String(e)}` });
        throw e;
      });
      await db.from("prereservations").update({ stripe_session_id: cs.id, payment_provider: "stripe", stripe_status: "requires_payment_method" }).eq("id", row.id);
      clientSecret = cs.client_secret;
    }
    await createHold(row.id);
    return { token: row.token, amount: due.amount, mode: due.mode, clientSecret, stripeConnected: stripeConnected(), stripeMode: stripeMode() };
  });

/** Terms acceptance → request goes to the owner for approval. */
export const submitPrereservation = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; accepted: boolean; meta?: { eventId: string; contentId: string; sourceUrl: string; fbp?: string | undefined; fbc?: string | undefined } | undefined }) => z.object({ token: z.string().min(20), accepted: z.literal(true), meta: z.object({ eventId: z.string().uuid(), contentId: z.string().max(200), sourceUrl: z.string().url().max(2000), fbp: z.string().max(300).optional(), fbc: z.string().max(500).optional() }).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { notify } = await import("./notify.server");
    const { data: r } = await db.from("prereservations").select("*").eq("token", data.token).maybeSingle();
    if (!r || !["draft", "pending_approval", "approved", "confirmed"].includes(r.status)) throw new Error("Request not found");
    const ip = (getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? "").split(",")[0]!.trim();
    // Same shared finalize step as the webhook; a booking already created from the payment is a success, not an error.
    if (r.status === "draft" && !hasRequiredDocs(r.documents, (r as { identity_verification?: unknown }).identity_verification)) throw new Error("DOCS_REQUIRED");
    const { finalizePaidBooking } = await import("./finalize.server");
    const res = await finalizePaidBooking(db, r.id, { source: "client", ip });
    if (res.outcome === "not_paid") {
      await notify("owner_hold_failed", "", "en", { car: r.vehicle_name, detail: `Payment not completed (status: ${res.stripeStatus})` });
      throw new Error("CARD_NOT_AUTHORIZED");
    }
    if (res.outcome !== "finalized" && res.outcome !== "already") throw new Error("Request not found");
    const { purchaseFromBooking } = await import("@/lib/funnel");
    const { data: paid } = await db.from("prereservations").select("id, status, captured_at, settled_at, paid_amount_usd, vehicle_id, vehicle_name, is_test").eq("id", r.id).maybeSingle();
    const { data: vehicle } = await db.from("vehicles").select("body_category, category").eq("id", r.vehicle_id ?? "").maybeSingle();
    const purchase = paid ? purchaseFromBooking(paid, vehicle?.body_category ?? vehicle?.category ?? "") : null;
    if (data.meta && purchase) {
      const { sendMetaPurchase } = await import("./meta-capi.server");
      await sendMetaPurchase({ ...data.meta, eventId: purchase.transaction_id, value: purchase.value, ip, ua: getRequestHeader("user-agent") ?? "", country: getRequestHeader("cf-ipcountry") ?? null, gpc: getRequestHeader("sec-gpc") === "1" });
    }
    return { ok: true, purchase };
  });

export const getBooking = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().min(20).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { expireDue } = await import("./holds.server");
    await expireDue(db);
    const { expireInstantHolds } = await import("./instant.server");
    await expireInstantHolds(db);
    const { data: pre } = await db.from("prereservations").select("id, status, stripe_session_id").eq("token", data.token).maybeSingle();
    if (pre?.status === "draft" && pre.stripe_session_id) await (await import("./finalize.server")).finalizePaidBooking(db, pre.id, { source: "booking_page" }).catch((e) => console.error("[getBooking] finalize failed", e));
    const { data: r } = await db.from("prereservations")
      .select("id, status, flow, vehicle_name, vehicle_id, is_test, settled_at, first_name, pickup_at, return_at, pickup_location, return_location, price_breakdown, prereservation_amount_usd, expires_at, created_at, sistemagestao_link, balance_amount_usd, balance_paid_at, paid_amount_usd, captured_at, refunded_at, payment_provider, service_city, base_city, payment_mode, original_vehicle_name, substitute_status, substitute_deadline, substitute_explicit, substitute_refund_usd, substitute_info, insurance_us_flow, insurance_choice")
      .eq("token", data.token).maybeSingle();
    if (!r) return null;
    const { data: st } = await db.from("settings").select("gp_interest_free_installments, rentalcover_affiliate_link, measureone_static_link").eq("id", 1).maybeSingle();
    const { purchaseFromBooking } = await import("@/lib/funnel");
    const { data: vehicle } = await db.from("vehicles").select("name, body_category, category, is_convertible").eq("id", r.vehicle_id ?? "").maybeSingle();
    return { ...r, rentalcover_affiliate_link: st?.rentalcover_affiliate_link ?? "", measureone_static_link: st?.measureone_static_link ?? "", rentalcover_car: vehicle, purchase: purchaseFromBooking(r, vehicle?.body_category ?? vehicle?.category ?? ""), gpInterestFree: st?.gp_interest_free_installments ?? 6, ref: r.id.slice(0, 8).toUpperCase(), id: undefined };
  });

/** Called by the card form when the customer finishes: reads the session server-side (never trusts the browser). */
export const confirmHold = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().min(20).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { syncHoldFromSession } = await import("./holds.server");
    const { data: r } = await db.from("prereservations").select("*").eq("token", data.token).maybeSingle();
    if (!r) throw new Error("Request not found");
    await syncHoldFromSession(db, r).catch((e) => console.error("[confirmHold] hold sync failed", r.id, e));
    // Safety net (the webhook is the primary path): a confirmed payment creates the booking now, idempotently.
    const { finalizePaidBooking } = await import("./finalize.server");
    const ip = (getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? "").split(",")[0]!.trim();
    const res = await finalizePaidBooking(db, r.id, { source: "confirm", ip }).catch((e) => { console.error("[confirmHold] finalize failed", r.id, e); return null; });
    if (res?.outcome === "finalized" || res?.outcome === "already") return { authorized: true };
    const { data: u } = await db.from("prereservations").select("stripe_status").eq("id", r.id).single();
    const { stripeBookingReady } = await import("@/lib/pricing");
    const { retrieveSession } = await import("./stripe.server");
    const session = r.stripe_session_id ? await retrieveSession(r.stripe_session_id) : null;
    return { authorized: stripeBookingReady(u?.stripe_status ?? "", session?.metadata?.["kind"] === "hold") };
  });

/** Accepted substitute price difference only; never a rental balance payment. */
export const startSubstituteDifferencePayment = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().min(20).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { createCardSession, stripeConnected, stripeMode } = await import("./stripe.server");
    const { paymentDifference } = await import("@/lib/pricing");
    const { data: r } = await db.from("prereservations").select("*").eq("token", data.token).maybeSingle();
    if (!r || !["approved", "confirmed"].includes(r.status) || r.substitute_status !== "substitute_accepted") throw new Error("NO_SUBSTITUTE_DIFFERENCE");
    if (r.balance_paid_at) throw new Error("BALANCE_ALREADY_PAID");
    if (!stripeConnected()) throw new Error("STRIPE_NOT_CONNECTED");
    const pb = r.price_breakdown as { total?: number | null; substitute_difference?: number };
    const amount = Math.min(Number(pb.substitute_difference ?? 0), paymentDifference(pb.total, Number(r.prereservation_amount_usd)) ?? 0);
    if (amount == null || amount <= 0) throw new Error("BALANCE_NOT_AVAILABLE");
    const cs = await createCardSession({
      amountUsd: amount, name: `Substitute price difference — ${r.vehicle_name}`, email: r.email, hold: false,
      meta: { prereservation_id: r.id, kind: "substitute_difference" }, idem: `substitute-difference-${r.id}-${Math.round(amount * 100)}-${Date.now()}`,
    });
    await db.from("prereservations").update({ balance_session_id: cs.id, balance_amount_usd: amount }).eq("id", r.id).is("balance_paid_at", null);
    return { clientSecret: cs.client_secret, amount, stripeMode: stripeMode() };
  });

/** Card form finished for an accepted substitute difference: confirm server-side with the provider. */
export const confirmSubstituteDifference = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().min(20).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { syncSubstituteDifference } = await import("./holds.server");
    const { data: r } = await db.from("prereservations").select("*").eq("token", data.token).maybeSingle();
    if (!r) throw new Error("Request not found");
    return { paid: await syncSubstituteDifference(db, r) };
  });

/** Client answers a substitute offer from the booking page (token = private booking link). */
export const respondSubstitute = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; accept: boolean }) => z.object({ token: z.string().min(20).max(100), accept: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: r } = await db.from("prereservations").select("id, status").eq("token", data.token).maybeSingle();
    if (!r || r.status !== "substitute_offered") throw new Error("NO_OFFER");
    const { acceptSubstitute, refuseSubstitute } = await import("./substitute.server");
    return data.accept ? acceptSubstitute(db, r.id, "client") : refuseSubstitute(db, r.id);
  });

/** Attaches the uploaded documents (private bucket folder) and/or a verified Stripe identity to the customer's draft/hold booking. */
const pathRe = (k: string) => new RegExp(`^uploads/[0-9a-f-]{36}/${k}\\.(jpg|jpeg|png|heic|heif)$`);
export const attachDocuments = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; capability?: string | undefined; documents?: { folder: string; licenseFront?: string | undefined; licenseBack?: string | undefined; passport?: string | undefined; secondLicense?: string | undefined; insurancePolicy?: string | undefined; additionalDriver?: { fullName: string; licenseFront: string; licenseBack: string; passport: string } | undefined } | undefined; insuranceChoice?: "own" | "ben" | undefined; usInsurance?: { opened?: boolean | undefined } | undefined; identity?: { sessionId: string; ref: string } | undefined; driverDocs?: { licenseNumber?: string | undefined; licenseExpiry?: string | undefined; passportNumber?: string | undefined } }) => z.object({
    token: z.string().min(20).max(100), capability: z.string().length(64).optional(),
    driverDocs: z.object({ licenseNumber: z.string().max(100).optional(), licenseExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), passportNumber: z.string().max(100).optional() }).optional(),
    documents: z.object({ folder: z.string().regex(/^uploads\/[0-9a-f-]{36}$/), licenseFront: z.string().regex(pathRe("licenseFront")).optional(), licenseBack: z.string().regex(pathRe("licenseBack")).optional(), passport: z.string().regex(pathRe("passport")).optional(), secondLicense: z.string().optional(), insurancePolicy: z.string().regex(INSURANCE_PATH).optional(), additionalDriver: additionalDriverSchema.optional() }).optional(),
    insuranceChoice: z.enum(["own", "ben"]).optional(),
    usInsurance: z.object({ opened: z.boolean().optional() }).optional(),
    identity: z.object({ sessionId: z.string().regex(/^vs_[A-Za-z0-9]{8,80}$/), ref: z.string().uuid() }).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const d = data.documents;
    if (d) {
      const { documentCapability } = await import("./document-ai.server");
      if (!data.capability || await documentCapability(d.folder) !== data.capability) throw new Error("Invalid upload authorization");
      if (!docsInFolder(d as never)) throw new Error("Invalid documents");
    }
    let identity: unknown = null;
    let idOutcome: "verified" | "pending" | "failed" | null = null;
    if (data.identity) {
      const { loadAttachableIdentity } = await import("./identity.functions");
      const got = await loadAttachableIdentity(db as never, data.identity.sessionId, data.identity.ref);
      if (!got) throw new Error("IDENTITY_NOT_VERIFIED");
      identity = got.identity; idOutcome = got.outcome;
    }
    // Verified clients: the main-driver licence never travels as loose files.
    const row: Record<string, unknown> = identity
      ? { ...(d?.passport ? { passport: d.passport } : {}), ...(d?.insurancePolicy ? { insurancePolicy: d.insurancePolicy } : {}), ...(d?.additionalDriver ? { additionalDriver: { fullName: d.additionalDriver.fullName.trim(), licenseFront: d.additionalDriver.licenseFront, licenseBack: d.additionalDriver.licenseBack, passport: d.additionalDriver.passport } } : {}) }
      : docsRow(d as never);
    if (!hasRequiredDocs(row, identity)) throw new Error("DOCS_REQUIRED");
    const { data: r } = await db.from("prereservations").select("id, status").eq("token", data.token).maybeSingle();
    if (!r || !["draft", "checkout_hold"].includes(r.status)) throw new Error("Request not found");
    const { data: extracted } = d ? await db.from("document_checks").select("results").eq("folder", d.folder).maybeSingle() : { data: null };
    // US license: the MeasureOne link is sent after payment, so a configured link (server-side) records pending; nothing is opened in checkout.
    let usFlow: Record<string, unknown> = {};
    if (data.usInsurance) {
      const { data: st } = await db.from("settings").select("measureone_static_link").eq("id", 1).maybeSingle();
      const flow = usInsuranceFlow(true, !!measureOneLink(st?.measureone_static_link), d?.insurancePolicy);
      usFlow = { insurance_us_flow: flow, ...(flow === "measureone_pending_after_payment" && data.insuranceChoice !== "ben" ? { insurance_choice: "own" } : {}) };
    }
    const { error } = await db.from("prereservations").update({ documents: row, identity_verification: identity, ...initialInsurance(data.insuranceChoice, d?.insurancePolicy), ...usFlow, ...(extracted ? { document_ai: extracted.results } : {}), ...(data.driverDocs?.licenseNumber ? { license_number: data.driverDocs.licenseNumber } : {}), ...(data.driverDocs?.licenseExpiry ? { license_expiry: data.driverDocs.licenseExpiry } : {}), ...(data.driverDocs?.passportNumber ? { passport_number: data.driverDocs.passportNumber } : {}) } as never).eq("id", r.id).in("status", ["draft", "checkout_hold"]);
    if (error) throw new Error("Could not save documents");
    if (identity && data.identity) {
      // Link the check to the booking; if the webhook resolved before the booking existed, send its emails now (once each).
      await db.from("identity_verifications").update({ booking_id: r.id }).eq("session_id", data.identity.sessionId);
      try {
        const n = await import("./identity-notify.server");
        const { stripeMode } = await import("./stripe.server");
        const deps = await n.liveIdentityNotifyDeps(db as never, stripeMode());
        if (idOutcome === "verified") await n.handleIdentityVerified(deps, { id: data.identity.sessionId, metadata: { booking_id: r.id } });
        else if (idOutcome === "failed") await n.handleIdentityFailed(deps, { id: data.identity.sessionId, metadata: { booking_id: r.id } });
      } catch (e) { console.error("[identity] owner notify after attach failed", e instanceof Error ? e.message : e); }
    }
    return { ok: true };
  });

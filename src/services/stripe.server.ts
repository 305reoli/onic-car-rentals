// Built-in payments (Stripe) — fetch-based REST client routed through Lovable's connector gateway.
// Preparation only: sandbox remains the default. Live requires a Lovable-provisioned gateway connection.
// STRIPE_LIVE_API_KEY is NOT a raw Stripe Dashboard sk_live_ key; never send one to the gateway.
import { selectStripeMode } from "@/lib/stripeMode";

const GATEWAY = "https://connector-gateway.lovable.dev/stripe";
const env = (k: string) => (process.env[k] ?? "").trim();

export const stripeMode = () => selectStripeMode(!!env("STRIPE_LIVE_API_KEY"));
const connectionKey = () => env(stripeMode() === "live" ? "STRIPE_LIVE_API_KEY" : "STRIPE_SANDBOX_API_KEY");
export const stripeConnected = () => !!connectionKey() && !!env("LOVABLE_API_KEY");

type Params = Record<string, string | number | boolean | undefined>;
function form(obj: Params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) p.append(k, String(v));
  return p;
}

async function call<T = any>(path: string, method: "GET" | "POST", body?: Params, idempotencyKey?: string): Promise<T> {
  if (!stripeConnected()) throw new Error("STRIPE_NOT_CONNECTED");
  const key = connectionKey();
  if (/^(sk|rk)_/.test(key)) throw new Error("Stripe requires a Lovable-managed gateway connection. Complete Stripe go-live in Lovable Payments; do not paste a Stripe Dashboard secret key into STRIPE_LIVE_API_KEY.");
  const res = await fetch(`${GATEWAY}/v1${path}`, {
    method,
    headers: {
      "X-Connection-Api-Key": key,
      "Lovable-API-Key": env("LOVABLE_API_KEY"),
      "Stripe-Version": "2026-03-25.dahlia",
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(body ? { body: form(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Payment provider error ${res.status}`);
  return json as T;
}

export interface PaymentIntent { id: string; status: string; amount: number; amount_received?: number; latest_charge?: string | null }
export interface CheckoutSession { id: string; client_secret: string | null; status: string; payment_status: string; payment_intent: string | null; metadata: Record<string, string> }
export interface Refund { id: string; status: string; amount: number }

const meta = (m: Record<string, string>, prefix = "metadata") =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [`${prefix}[${k}]`, v]));

/**
 * Embedded card form session (USD). `hold` = manual capture (authorized now, captured on approval).
 * Tax is already itemized by the app (6.5% FL), so no provider tax automation is added.
 */
export const createCardSession = (o: { amountUsd: number; name: string; email: string; hold: boolean; meta: Record<string, string>; idem: string }) =>
  call<CheckoutSession>("/checkout/sessions", "POST", {
    mode: "payment",
    ui_mode: "embedded_page",
    redirect_on_completion: "never",
    "payment_method_types[0]": "card",
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": Math.round(o.amountUsd * 100),
    "line_items[0][price_data][product_data][name]": o.name,
    customer_email: o.email,
    "payment_intent_data[description]": o.name,
    ...(o.hold ? { "payment_intent_data[capture_method]": "manual" } : {}),
    ...meta(o.meta),
    ...meta(o.meta, "payment_intent_data[metadata]"),
  }, o.idem);

export const retrieveSession = (id: string) => call<CheckoutSession>(`/checkout/sessions/${id}`, "GET");
export const retrieveIntent = (id: string) => call<PaymentIntent>(`/payment_intents/${id}`, "GET");
// Idempotency keys guarantee a hold is never captured, cancelled or refunded twice even on retries.
export const captureIntent = (id: string, amountUsd?: number) => call<PaymentIntent>(`/payment_intents/${id}/capture`, "POST", amountUsd != null ? { amount_to_capture: Math.round(amountUsd * 100) } : {}, `capture-${id}`);
export const cancelIntent = (id: string) => call<PaymentIntent>(`/payment_intents/${id}/cancel`, "POST", {}, `cancel-${id}`);
export const refundIntent = (id: string, reason?: string, amountUsd?: number) =>
  call<Refund>("/refunds", "POST", { payment_intent: id, ...(amountUsd != null ? { amount: Math.round(amountUsd * 100) } : {}), ...(reason ? { "metadata[reason]": reason.slice(0, 400) } : {}) }, amountUsd != null ? `refund-${id}-${Math.round(amountUsd * 100)}` : `refund-${id}`);

/** Verifies a Stripe-Signature header (v1, HMAC-SHA256) with Web Crypto. */
export async function verifyStripeSignature(payload: string, header: string | null, secret: string, toleranceSec = 300) {
  if (!header) return false;
  const ts = header.split(",").find((p) => p.startsWith("t="))?.slice(2);
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!ts || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSec) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => s.length === hex.length && s.split("").every((c, i) => c === hex[i]));
}

/** Out-of-order safety: a webhook can only move a hold forward, never back (e.g. a late "requires_capture" after "succeeded"). */
const RANK: Record<string, number> = { requires_payment_method: 0, requires_confirmation: 1, requires_action: 2, processing: 3, requires_capture: 4, succeeded: 5, canceled: 6, refunded: 7 };
export const isForward = (from: string | null | undefined, to: string) => (RANK[to] ?? 0) >= (RANK[from ?? ""] ?? -1);

// ---- Stripe Identity (same managed gateway connection; never a raw key) ----
export interface VerificationSession { id: string; status: string; url: string | null; client_secret: string | null; last_error: { code?: string; reason?: string } | null; last_verification_report: string | null; metadata: Record<string, string> }
export interface VerificationReport { id: string; created: number; document?: { first_name?: string | null; last_name?: string | null; number?: string | null; issuing_country?: string | null; type?: string | null; dob?: { day: number; month: number; year: number } | null; expiration_date?: { day: number; month: number; year: number } | null; status?: string } }
export const createVerificationSession = (o: { returnUrl: string; meta: Record<string, string>; idem: string }) =>
  call<VerificationSession>("/identity/verification_sessions", "POST", {
    type: "document",
    "options[document][require_matching_selfie]": true,
    return_url: o.returnUrl,
    ...meta(o.meta),
  }, o.idem);
export const retrieveVerificationSession = (id: string) => call<VerificationSession>(`/identity/verification_sessions/${encodeURIComponent(id)}`, "GET");
// Sensitive fields (number/expiry/dob) need a restricted key with Identity read permission; the managed
// gateway key gets 403 on them. Fall back to the plain report so a verified session is never lost.
export async function retrieveVerificationReport(id: string): Promise<VerificationReport> {
  const path = `/identity/verification_reports/${encodeURIComponent(id)}`;
  try { return await call<VerificationReport>(`${path}?expand[]=document.number&expand[]=document.expiration_date&expand[]=document.dob`, "GET"); }
  catch (e) { console.warn("[identity] sensitive report fields unavailable; using basic report", e instanceof Error ? e.message : e); return call<VerificationReport>(path, "GET"); }
}

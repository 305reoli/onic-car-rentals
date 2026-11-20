// Global Pays provider (server-only). Mirrors the Sistema de Gestao pattern: auth → order → hosted checkout → webhook/consult.
// Modes: "production" | "sandbox" (real API) | "mock" (built-in simulator, admin-only, never in production).

export type GpMode = "production" | "sandbox" | "mock";
export function hostedCheckoutAvailable(config: { mode: GpMode; hasCreds: boolean; webhookEnabled: boolean }) {
  return config.mode !== "mock" && config.hasCreds && config.webhookEnabled;
}
const BASES = { sandbox: "https://apihml.tryglobalpays.com/v1", production: "https://api.tryglobalpays.com/v1" } as const;

const env = (k: string) => (process.env[k] ?? "").trim();

// Owner "real payments" switch (settings.globalpays_live, OFF by default). While OFF the simulator is always used,
// whatever secrets exist. Refreshed from the database by loadGpSwitch() at the start of every Global Pays entry point.
let liveOn = false;
export async function loadGpSwitch() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("settings").select("globalpays_live").eq("id", 1).maybeSingle();
  liveOn = data?.globalpays_live === true;
  return liveOn;
}
export const LIVE_CONFIRM_PHRASE = "ENABLE GLOBALPAYS LIVE";

export function gpConfig() {
  const raw = env("GLOBALPAYS_ENV").toLowerCase();
  const declared: GpMode = raw === "production" ? "production" : raw === "mock" ? "mock" : "sandbox";
  const hasCreds = !!env("GLOBALPAYS_PUBKEY") && !!env("GLOBALPAYS_MERCHANT_CODE");
  // Switch OFF → simulator. Switch ON → real API (production/sandbox) only with credentials; otherwise still simulator.
  const mode: GpMode = !liveOn || !hasCreds || declared === "mock" ? "mock" : declared;
  const cutoffRaw = env("GLOBALPAYS_WEBHOOK_CUTOFF");
  const cutoff = cutoffRaw && !isNaN(Date.parse(cutoffRaw)) ? new Date(cutoffRaw) : null;
  return {
    declared, mode, hasCreds, liveOn,
    configured: mode === "mock" || hasCreds,
    secrets: {
      GLOBALPAYS_ENV: !!raw, GLOBALPAYS_PUBKEY: !!env("GLOBALPAYS_PUBKEY"), GLOBALPAYS_MERCHANT_CODE: !!env("GLOBALPAYS_MERCHANT_CODE"),
      GLOBALPAYS_WEBHOOK_SECRET: !!env("GLOBALPAYS_WEBHOOK_SECRET"), GLOBALPAYS_WEBHOOK_CUTOFF: !!cutoff,
    },
    webhookEnabled: mode === "mock" || (!!env("GLOBALPAYS_WEBHOOK_SECRET") && !!cutoff),
    cutoff,
  };
}

/** Removes any secret=… from text before logging. */
export const scrub = (s: string) => s.replace(/([?&]secret=)[^&\s"]+/gi, "$1***");

/** Constant-time string compare. */
export function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Secret expected on the callback URL. Real modes: GLOBALPAYS_WEBHOOK_SECRET (+ cutoff). Mock: derived server-side key. */
export async function webhookSecret(): Promise<string | null> {
  const c = gpConfig();
  if (c.mode === "mock") {
    const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_PUBLISHABLE_KEY");
    const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode("globalpays-mock-webhook"));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return c.webhookEnabled ? env("GLOBALPAYS_WEBHOOK_SECRET") : null;
}

export async function callbackUrl(origin: string, bookingId: string) {
  const s = await webhookSecret();
  const u = new URL("/api/public/webhooks/globalpays", origin);
  u.searchParams.set("booking_id", bookingId);
  if (s) u.searchParams.set("secret", s);
  return u.toString();
}

// ---------- Auth (token cache, single in-flight call, 429 cool-down) ----------
let cached: { token: string; until: number } | null = null;
let inflight: Promise<string> | null = null;
let coolUntil = 0;

function base() {
  const m = gpConfig().mode;
  if (m === "mock") throw new Error("Global Pays is in mock mode");
  return BASES[m];
}

async function auth(force = false, envOverride?: "production" | "sandbox"): Promise<string> {
  if (!force && cached && Date.now() < cached.until) return cached.token;
  if (Date.now() < coolUntil) throw new Error(`Global Pays rate-limited; retry after ${Math.ceil((coolUntil - Date.now()) / 1000)}s`);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(`${envOverride ? BASES[envOverride] : base()}/paymentapi/auth`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubKey: env("GLOBALPAYS_PUBKEY"), merchantCode: env("GLOBALPAYS_MERCHANT_CODE") }),
      });
      if (res.status === 429) {
        const ra = Number(res.headers.get("retry-after") ?? "30");
        coolUntil = Date.now() + (isFinite(ra) && ra > 0 ? ra : 30) * 1000;
        throw new Error("Global Pays rate-limited (429)");
      }
      const j = (await res.json().catch(() => ({}))) as { token?: string; expirate?: string | number; data?: { token?: string; expirate?: string | number } };
      const token = j.token ?? j.data?.token;
      const exp = j.expirate ?? j.data?.expirate;
      if (!res.ok || !token) throw new Error(`Global Pays auth failed (HTTP ${res.status})`);
      const expMs = typeof exp === "number" ? (exp > 1e12 ? exp : exp * 1000) : Date.parse(String(exp ?? ""));
      const until = (isFinite(expMs) ? expMs : Date.now() + 10 * 60000) - 60000;
      cached = { token, until };
      return token;
    } finally { inflight = null; }
  })();
  return inflight;
}

export async function testAuth() {
  const c = gpConfig();
  if (c.mode === "mock") return { ok: false, mode: c.mode, message: "Not configured — running the built-in simulator (mock)." };
  if (c.mode === "production") return { ok: false, mode: c.mode, message: "Connection test runs only in sandbox." };
  try { await auth(true); return { ok: true, mode: c.mode, message: "Sandbox authentication succeeded." }; }
  catch (e) { return { ok: false, mode: c.mode, message: scrub(e instanceof Error ? e.message : String(e)) }; }
}

export type OrderInput = { amount: number; invoice: string; description: string; callback: string; client: { name: string; email: string; phone: string; doc: string } };

export async function createOrder(o: OrderInput, origin: string): Promise<{ orderId: string; url: string }> {
  const c = gpConfig();
  if (c.mode === "mock") {
    const orderId = `mock_${crypto.randomUUID()}`;
    return { orderId, url: new URL(`/api/public/globalpays-mock?order=${encodeURIComponent(orderId)}`, origin).toString() };
  }
  const call = async (token: string) => fetch(`${base()}/paymentapi/order`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ amount: Math.round(o.amount * 100) / 100, currency: "USD", invoice: o.invoice, description: o.description, callback: o.callback, client: o.client }),
  });
  let res = await call(await auth());
  if (res.status === 401) res = await call(await auth(true));
  const j = (await res.json().catch(() => ({}))) as { data?: { orderId?: string; url?: string } };
  const orderId = j.data?.orderId, url = j.data?.url;
  if (!res.ok || !orderId || !url || !/^https:\/\//i.test(url)) throw new Error(`Global Pays order rejected (HTTP ${res.status})`);
  return { orderId: String(orderId), url };
}

export type OrderStatus = { status: string; amountUsd: number | null; gross: number | null; grossCurrency: string | null; fee: number | null; method: string | null; amountBrl?: number | null; installments?: number | null };

/** Customer return page. Global Pays appends ?orderId=… and the page consults the order server-side (never trusts the redirect). */
export function returnUrl(origin: string, lang: string, token: string) {
  return new URL(`/${lang}/booking/${encodeURIComponent(token)}?paid=1`, origin).toString();
}

import type { GpQuote, GpQuoteOption } from "@/lib/gpPayView";
export type { GpQuote, GpQuoteOption };

/** Normalises the provider's "Calcular valores" response. Every BRL figure comes from the provider; nothing is derived here. */
export function parseQuote(body: unknown, maxInstallments = 12): GpQuote | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const d = (b["data"] && typeof b["data"] === "object" ? b["data"] : b) as Record<string, unknown>;
  const opt = (o: unknown): GpQuoteOption | null => {
    const x = (o ?? {}) as Record<string, unknown>;
    const totalUsd = num(x["totalUSD"]), exchange = num(x["exchange"]), brl = num(x["valueBRL"]);
    if (totalUsd == null || exchange == null || brl == null) return null;
    return { totalUsd, feeUsd: num(x["valueClientRate"]) ?? 0, exchange, brl };
  };
  const card = (d["card"] ?? {}) as Record<string, unknown>;
  const inst = Array.isArray(card["installment"]) ? (card["installment"] as Record<string, unknown>[]) : [];
  const amountUsd = num(d["amount"]);
  const q: GpQuote = {
    amountUsd: amountUsd ?? 0, pix: opt(d["pix"]), card1x: opt(card["card1x"]),
    installments: inst.map((i) => ({ n: Number(i["installmentNumber"]), each: num(i["installmentValue"]) ?? NaN, total: num(i["totalInstallment"]) ?? NaN, interest: i["interest"] === true }))
      .filter((i) => i.n >= 1 && i.n <= maxInstallments && isFinite(i.each) && isFinite(i.total)),
  };
  return amountUsd != null && (q.pix || q.card1x) ? q : null;
}

/** Provider quote (read-only, no charge). Uses the configured real environment's credentials; null when unavailable. */
export async function calculateQuote(amountUsd: number): Promise<GpQuote | null> {
  const c = gpConfig();
  if (!c.hasCreds || c.declared === "mock") return null;
  const url = `${BASES[c.declared]}/paymentapi/calculate`;
  const call = async (token: string) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ amount: Math.round(amountUsd * 100) / 100 }) });
  try {
    let res = await call(await auth(false, c.declared));
    if (res.status === 401) res = await call(await auth(true, c.declared));
    if (!res.ok) return null;
    return parseQuote(await res.json().catch(() => null));
  } catch (e) { console.error("[globalpays] quote", scrub(e instanceof Error ? e.message : String(e))); return null; }
}

export async function consultOrder(orderId: string): Promise<OrderStatus | null> {
  if (gpConfig().mode === "mock") return null; // the simulator only reports via its webhook
  const res = await fetch(`${base()}/paymentapi/order/${encodeURIComponent(orderId)}`, { headers: { Authorization: `Bearer ${await auth()}` } });
  if (!res.ok) return null;
  return parsePayment(await res.json().catch(() => ({})));
}

const num = (x: unknown) => (x == null || x === "" ? null : isFinite(Number(x)) ? Number(x) : null);

/** Normalises a webhook/consult body. Accepts total_amount_usd, amount+currency, or total_amount_brl (+ rate). */
export function parsePayment(body: unknown): OrderStatus & { orderId: string | null } {
  const b = (body ?? {}) as Record<string, unknown>;
  const d = ((b["data"] && typeof b["data"] === "object" ? b["data"] : b) ?? {}) as Record<string, unknown>;
  const pick = (...k: string[]) => { for (const key of k) if (d[key] != null) return d[key]; for (const key of k) if (b[key] != null) return b[key]; return null; };
  const status = String(pick("status", "payment_status", "situation") ?? "").toLowerCase();
  const usdTotal = num(pick("total_amount_usd"));
  const amount = num(pick("amount", "total_amount"));
  const currency = String(pick("currency") ?? "").toUpperCase() || null;
  const brl = num(pick("total_amount_brl"));
  const rate = num(pick("exchange_rate", "rate"));
  const inst = num(pick("installment", "installments"));
  let amountUsd: number | null = usdTotal ?? (amount != null && currency === "USD" ? amount : null);
  if (amountUsd == null && brl != null && rate) amountUsd = Math.round((brl / rate) * 100) / 100;
  const gross = usdTotal ?? amount ?? brl;
  const grossCurrency = usdTotal != null ? "USD" : amount != null ? currency : brl != null ? "BRL" : null;
  return {
    orderId: pick("orderId", "order_id", "id") != null ? String(pick("orderId", "order_id", "id")) : null,
    status, amountUsd, gross, grossCurrency,
    fee: num(pick("fee", "fee_amount", "tax")),
    method: (pick("payment_method", "method", "paymentType") as string | null) ?? null,
    amountBrl: brl, installments: inst,
  };
}

export const SUCCESS = new Set(["paid", "approved", "completed", "succeeded", "success", "settled", "confirmed"]);
export const FAILED = new Set(["failed", "canceled", "cancelled", "expired", "refused", "denied", "abandoned", "error"]);
export const REFUNDED = new Set(["refunded", "chargeback", "reversed"]);

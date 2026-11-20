import { describe, expect, it } from "vitest";
import { hostedCheckoutAvailable, parsePayment, safeEqual, scrub } from "./globalpays.server";
import { blockingFilter, paidEnough, rowBlocks } from "@/lib/pricing";

describe("instant full booking rules", () => {
  it("never exposes the fake simulator as a customer payment option", () => {
    expect(hostedCheckoutAvailable({ mode: "mock", hasCreds: true, webhookEnabled: true })).toBe(false);
  });
  it("permits configured hosted sandbox checkout", () => {
    expect(hostedCheckoutAvailable({ mode: "sandbox", hasCreds: true, webhookEnabled: true })).toBe(true);
  });
  it("fails closed without callback protection", () => {
    expect(hostedCheckoutAvailable({ mode: "sandbox", hasCreds: true, webhookEnabled: false })).toBe(false);
  });
  it("confirms only when paid amount >= total", () => {
    expect(paidEnough(1200, 1200)).toBe(true);
    expect(paidEnough(1199.99, 1200)).toBe(false);
    expect(paidEnough(null, 1200)).toBe(false);
  });
  it("a checkout hold blocks the car only until hold_until", () => {
    const now = new Date("2026-11-06T12:00:00Z");
    expect(rowBlocks({ status: "checkout_hold", hold_until: "2026-11-06T12:10:00Z" }, now)).toBe(true);
    expect(rowBlocks({ status: "checkout_hold", hold_until: "2026-11-06T11:59:00Z" }, now)).toBe(false);
    expect(rowBlocks({ status: "confirmed" }, now)).toBe(true);
    expect(rowBlocks({ status: "payment_failed" }, now)).toBe(false);
    expect(blockingFilter(now)).toContain("hold_until.gt.2026-11-06T12:00:00.000Z");
  });
  it("reads USD from total_amount_usd, amount+currency, or BRL with a rate", () => {
    expect(parsePayment({ data: { orderId: "o1", status: "PAID", total_amount_usd: 500, fee: 17.5 } })).toMatchObject({ orderId: "o1", status: "paid", amountUsd: 500, fee: 17.5 });
    expect(parsePayment({ status: "paid", amount: 300, currency: "usd" }).amountUsd).toBe(300);
    expect(parsePayment({ status: "paid", total_amount_brl: 2750, exchange_rate: 5.5 }).amountUsd).toBe(500);
    expect(parsePayment({ status: "paid", total_amount_brl: 2750 }).amountUsd).toBeNull();
  });
  it("compares secrets exactly and scrubs them from logs", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(scrub("https://x/cb?booking_id=1&secret=TOPSECRET")).toBe("https://x/cb?booking_id=1&secret=***");
  });
});

// ---- Conversion round 2: Global Pays on the Payment step, bare-route webhook, admin list ----
import { parseQuote, SUCCESS } from "./globalpays.server";
import { handleGpWebhook, type GpWebhookDeps } from "./gpWebhook.server";
import { gpAdminRows, gpMethod } from "@/lib/gpPayments";
import { gpPayView } from "@/lib/gpPayView";
import { dueAtBooking } from "@/lib/pricing";
import { t } from "@/lib/i18n";

describe("Global Pays payment option amounts and copy", () => {
  const corolla = { total: 298.2, prereservation: 75 };
  const corvette = { total: 478.19, prereservation: 449 };
  it("regular car charges 100% of the total (EN + PT)", () => {
    const due = dueAtBooking(corolla, "signal");
    expect(due).toEqual({ amount: 298.2, mode: "full" });
    const en = gpPayView(t("en").checkout.route, due.amount, due.mode, null);
    expect(en.charge).toBe("Global Pays charge: $298.20 USD");
    expect(en.nature).toMatch(/100% of the rental total at booking/);
    const pt = gpPayView(t("pt").checkout.route, due.amount, due.mode, null);
    expect(pt.nature).toMatch(/100% do total da locação ao reservar/);
  });
  it("sports/exotic car charges the full total", () => {
    const due = dueAtBooking(corvette, "full");
    expect(due.amount).toBe(478.19);
    expect(gpPayView(t("en").checkout.route, due.amount, due.mode, null).charge).toBe("Global Pays charge: $478.19 USD");
  });
  it("labels both options in EN and PT", () => {
    expect(t("en").checkout.route.gpOpt).toBe("Pay in BRL — Pix or card up to 12x (Global Pays)");
    expect(t("pt").checkout.route.gpOpt).toBe("Pagar em reais — Pix ou cartão em até 12x (Global Pays)");
  });
  it("shows BRL only from the provider quote, otherwise USD + hosted-page note", () => {
    const none = gpPayView(t("en").checkout.route, 75, "signal", null);
    expect(none.quoteLines).toEqual([]);
    expect(none.quoteNote).toMatch(/final BRL total, fees and installments/);
    const q = parseQuote({ amount: 75, pix: { valueUSD: 75, valueClientRate: 0, totalUSD: 75, exchange: 5.6113, valueBRL: 450.61 }, card: { card1x: { valueUSD: 75, valueClientRate: 1.5, totalUSD: 76.5, exchange: 5.6392, valueBRL: 467.78 }, installment: [{ installmentNumber: 1, totalInstallment: "467.78", installmentValue: "467.78", interest: false }, { installmentNumber: 12, totalInstallment: "534.84", installmentValue: "44.57", interest: true }, { installmentNumber: 18, totalInstallment: "600", installmentValue: "33.33", interest: true }] } });
    const v = gpPayView(t("pt").checkout.route, 75, "signal", q);
    expect(v.quoteLines[0]).toBe("Pix: R$ 450,61 · câmbio R$ 5.6113");
    expect(v.quoteLines[2]).toBe("Cartão 12x de R$ 44,57 (total R$ 534,84)");
    expect(parseQuote({ amount: 75 })).toBeNull();
  });
});

function harness(over: Partial<{ mode: string; consult: { status: string; amountUsd: number | null } | null }> = {}) {
  const booking = { id: "11111111-2222-3333-4444-555555555555", created_at: "2026-11-10T20:00:00Z", provider_order_id: "15613", flow: "gp_request", status: "checkout_hold" };
  const settled: { status: string; amountUsd: number | null }[] = [];
  const logs: string[] = [];
  const deps: GpWebhookDeps = {
    gp: {
      loadGpSwitch: async () => true,
      gpConfig: () => ({ mode: over.mode ?? "production", cutoff: new Date("2026-11-07T00:00:00Z") }),
      webhookSecret: async () => "whsec_test_secret",
      safeEqual, parsePayment,
      consultOrder: async () => (over.consult === undefined ? { status: "approved", amountUsd: 75, gross: 75, grossCurrency: "USD", fee: 2.31, method: "Pix", amountBrl: 450.61, installments: 1 } : over.consult as never),
    },
    findById: async (id) => (id === booking.id ? booking : null),
    findByOrder: async (o) => (o === booking.provider_order_id ? booking : null),
    settle: async (_id, p) => { settled.push({ status: p.status, amountUsd: p.amountUsd }); if (SUCCESS.has(p.status) && booking.status === "checkout_hold") { booking.status = "pending_approval"; return "pending_approval"; } return "ignored"; },
    log: async (e) => { logs.push(e.outcome); },
  };
  return { booking, settled, logs, deps };
}
const post = (q: string, body: unknown) => new Request(`https://seudominio.com/api/public/webhooks/globalpays${q}`, { method: "POST", body: JSON.stringify(body) });

describe("Global Pays webhook (bare panel route)", () => {
  it("settles the booking resolved from the body orderId after consulting the transaction", async () => {
    const h = harness();
    const res = await handleGpWebhook(post("?secret=whsec_test_secret", { orderId: 15613, status: "approved", total_amount_usd: 75 }), h.deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, outcome: "pending_approval" });
    expect(h.booking.status).toBe("pending_approval");
    expect(h.settled).toEqual([{ status: "approved", amountUsd: 75 }]);
  });
  it("keeps the secret check: wrong or missing secret is rejected and nothing settles", async () => {
    const h = harness();
    expect((await handleGpWebhook(post("?secret=nope", { orderId: 15613, status: "approved" }), h.deps)).status).toBe(401);
    expect((await handleGpWebhook(post("", { orderId: 15613, status: "approved" }), h.deps)).status).toBe(401);
    expect(h.settled).toEqual([]);
  });
  it("is NOT marked paid before provider success: a body claiming approved is overridden by the consult", async () => {
    const h = harness({ consult: { status: "open", amountUsd: null } });
    await handleGpWebhook(post("?secret=whsec_test_secret", { orderId: 15613, status: "approved", total_amount_usd: 75 }), h.deps);
    expect(h.booking.status).toBe("checkout_hold");
    const h2 = harness({ consult: null });
    const r2 = await handleGpWebhook(post("?secret=whsec_test_secret", { orderId: 15613, status: "approved" }), h2.deps);
    expect(r2.status).toBe(503);
    expect(h2.settled).toEqual([]);
  });
  it("applies the cutoff and ignores unknown orders", async () => {
    const h = harness();
    h.booking.created_at = "2026-11-06T00:00:00Z";
    await handleGpWebhook(post("?secret=whsec_test_secret", { orderId: 15613, status: "approved" }), h.deps);
    expect(h.logs).toContain("ignored:before_cutoff");
    expect(h.settled).toEqual([]);
    const u = harness();
    await handleGpWebhook(post("?secret=whsec_test_secret", { orderId: 999, status: "approved" }), u.deps);
    expect(u.logs).toContain("ignored:unknown_order");
  });
  it("booking_id path settles the same way", async () => {
    const h = harness();
    await handleGpWebhook(post(`?booking_id=${h.booking.id}&secret=whsec_test_secret`, { orderId: "15613", status: "approved" }), h.deps);
    expect(h.booking.status).toBe("pending_approval");
  });
});

describe("admin Global Pays payments list", () => {
  const base = { first_name: "Ana", last_name: "Silva", email: "ana@example.com", vehicle_name: "Toyota Corolla", payment_provider: "globalpays", flow: "gp_request", price_breakdown: { total: 298.2 }, gp_installments: null, provider_order_id: "15613", is_test: false };
  it("shows reference, customer, USD + BRL, method and pending/paid/failed status", () => {
    const rows = gpAdminRows([
      { ...base, id: "abcdef12-0000-0000-0000-000000000000", created_at: "2026-11-10T20:00:00Z", status: "pending_approval", payment_mode: "signal", prereservation_amount_usd: 75, paid_amount_usd: 75, payment_method: "Pix", gp_amount_brl: 450.61, gp_quote: null, settled_at: "2026-11-10T20:05:00Z" },
      { ...base, id: "bbbbbbbb-0000-0000-0000-000000000000", created_at: "2026-11-10T20:00:00Z", status: "checkout_hold", payment_mode: "full", prereservation_amount_usd: 478.19, price_breakdown: { total: 478.19 }, paid_amount_usd: null, payment_method: null, gp_amount_brl: null, gp_quote: { pix: { brl: 2873.1 } }, settled_at: null },
      { ...base, id: "cccccccc-0000-0000-0000-000000000000", created_at: "2026-11-10T20:00:00Z", status: "payment_failed", payment_mode: "signal", prereservation_amount_usd: 75, paid_amount_usd: null, payment_method: "Cartão de Crédito", gp_amount_brl: null, gp_quote: null, settled_at: null },
      { ...base, payment_provider: "stripe", id: "dddddddd-0000-0000-0000-000000000000", created_at: "2026-11-10T20:00:00Z", status: "pending_approval", payment_mode: "signal", prereservation_amount_usd: 75, paid_amount_usd: null, payment_method: null, gp_amount_brl: null, gp_quote: null, settled_at: null },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ reference: "ABCDEF12", customer: "Ana Silva", usd: 75, brl: 450.61, brlSource: "payment", method: "Pix", status: "paid", kind: "historical amount at booking" });
    expect(rows[1]).toMatchObject({ usd: 478.19, brl: 2873.1, brlSource: "quote", status: "pending", kind: "full total" });
    expect(rows[2]).toMatchObject({ method: "Card", status: "failed" });
    expect(gpMethod("credit_card_12x")).toBe("Card");
  });
});

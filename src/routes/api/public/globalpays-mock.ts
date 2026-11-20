import { createFileRoute } from "@tanstack/react-router";

// Built-in Global Pays simulator (mock mode only; impossible when GLOBALPAYS_ENV=production).
// Shows a fake hosted page and posts a signed fake webhook to our own callback.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function load(orderId: string) {
  const gp = await import("@/services/globalpays.server");
  await gp.loadGpSwitch();
  if (gp.gpConfig().mode !== "mock" || !orderId.startsWith("mock_")) return null;
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: r } = await db.from("prereservations").select("id, token, language, vehicle_name, price_breakdown, status, is_test, flow, payment_mode, prereservation_amount_usd").eq("provider_order_id", orderId).maybeSingle();
  return r && r.is_test ? r : null;
}

export const Route = createFileRoute("/api/public/globalpays-mock")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const order = new URL(request.url).searchParams.get("order") ?? "";
        const r = await load(order);
        if (!r) return new Response("Not found", { status: 404 });
        const total = Number((await import("@/services/instant.server")).gpExpectedUsd(r) ?? 0).toFixed(2);
        const btn = (a: string, label: string) => `<button name="action" value="${a}">${label}</button>`;
        const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Global Pays — SIMULATOR</title>
<style>body{font-family:system-ui;background:#0A0A0B;color:#F5F3EF;max-width:420px;margin:40px auto;padding:0 16px}h1{font-size:20px}.b{display:grid;gap:10px}button{padding:14px;border-radius:999px;border:1px solid #333;background:#141416;color:#F5F3EF;font-size:15px}button[value^=pay]{background:#D4B27A;color:#0A0A0B;border:0}small{color:#A3A3A8}</style></head>
<body><small>TEST SIMULATOR — no real payment</small><h1>${esc((await import("@/lib/i18n")).globalPaysLabel(r.language as "en" | "pt" | "es"))}</h1><p>${esc(r.vehicle_name)}<br><b>USD ${total}</b></p>
<form method="post" class="b"><input type="hidden" name="order" value="${esc(order)}">${btn("pay_pix", "Pay with Pix")}${btn("pay_card1", "Pay card 1x")}${btn("pay_card12", "Pay card 12x")}${btn("pay_low", "Pay less than total (test)")}${btn("fail", "Fail")}${btn("abandon", "Abandon")}</form></body></html>`;
        return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      },
      POST: async ({ request }) => {
        const f = await request.formData();
        const order = String(f.get("order") ?? ""), action = String(f.get("action") ?? "");
        const r = await load(order);
        if (!r) return new Response("Not found", { status: 404 });
        const origin = new URL(request.url).origin;
        const back = `${origin}/${r.language}/booking/${r.token}?paid=1`;
        if (action === "abandon") return Response.redirect(`${origin}/${r.language}/booking/${r.token}`, 303);
        const total = Number((await import("@/services/instant.server")).gpExpectedUsd(r) ?? 0);
        const method = action === "pay_pix" ? "pix" : action === "pay_card12" ? "credit_card_12x" : "credit_card_1x";
        const body = action === "fail"
          ? { data: { orderId: order, status: "failed" } }
          : { data: { orderId: order, status: "paid", total_amount_usd: action === "pay_low" ? Math.round(total * 50) / 100 : total, fee: Math.round(total * 3.5) / 100, payment_method: method } };
        const gp = await import("@/services/globalpays.server");
  await gp.loadGpSwitch();
        await fetch(await gp.callbackUrl(origin, r.id), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        return Response.redirect(back, 303);
      },
    },
  },
});

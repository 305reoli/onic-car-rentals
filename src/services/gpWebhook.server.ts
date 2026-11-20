// Global Pays webhook core (server-only). Shared by the booking_id callback and the bare panel route
// (https://seudominio.com/api/public/webhooks/globalpays?secret=…), which carries only orderId in the body.
import type { OrderStatus } from "./globalpays.server";

type Row = { id: string; created_at: string; provider_order_id: string | null; flow: string };
export type GpWebhookDeps = {
  gp: {
    loadGpSwitch: () => Promise<boolean>;
    gpConfig: () => { mode: string; cutoff: Date | null };
    webhookSecret: () => Promise<string | null>;
    safeEqual: (a: string, b: string) => boolean;
    parsePayment: (b: unknown) => OrderStatus & { orderId: string | null };
    consultOrder: (orderId: string) => Promise<OrderStatus | null>;
  };
  findById: (id: string) => Promise<Row | null>;
  findByOrder: (orderId: string) => Promise<Row | null>;
  settle: (bookingId: string, p: OrderStatus) => Promise<string>;
  log: (e: { booking_id?: string | null; provider_order_id?: string | null; status?: string; outcome: string; payload?: unknown }) => Promise<void>;
};

export async function handleGpWebhook(request: Request, deps: GpWebhookDeps): Promise<Response> {
  const { gp } = deps;
  await gp.loadGpSwitch();
  const url = new URL(request.url);
  const bookingId = url.searchParams.get("booking_id") ?? "";
  const given = url.searchParams.get("secret") ?? "";
  const cfg = gp.gpConfig();
  const expected = await gp.webhookSecret();
  if (!expected) return new Response("Webhook disabled", { status: 403 });
  if (!given || !gp.safeEqual(given, expected)) return new Response("Forbidden", { status: 401 });
  if (bookingId && !/^[0-9a-f-]{36}$/i.test(bookingId)) return new Response("Bad request", { status: 400 });
  const raw = await request.text();
  if (raw.length > 100_000) return new Response("Too large", { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
  const p = gp.parsePayment(body);

  // Bare route: resolve the booking from the notification's orderId.
  let r: Row | null;
  if (bookingId) r = await deps.findById(bookingId);
  else {
    if (!p.orderId || !/^[A-Za-z0-9_-]{1,80}$/.test(p.orderId)) return new Response("Bad request", { status: 400 });
    r = await deps.findByOrder(p.orderId);
  }
  if (!r || !["instant", "gp_request"].includes(r.flow)) {
    await deps.log({ provider_order_id: p.orderId, status: p.status, outcome: "ignored:unknown_order" });
    return Response.json({ ignored: true });
  }
  if (cfg.mode !== "mock" && cfg.cutoff && new Date(r.created_at) < cfg.cutoff) {
    await deps.log({ booking_id: r.id, provider_order_id: p.orderId, status: p.status, outcome: "ignored:before_cutoff" });
    return Response.json({ ignored: true });
  }
  if (!r.provider_order_id || (p.orderId && String(p.orderId) !== r.provider_order_id)) {
    await deps.log({ booking_id: r.id, provider_order_id: p.orderId, status: p.status, outcome: "ignored:order_mismatch" });
    return Response.json({ ignored: true });
  }
  // The notification is only a hint: real modes settle from the provider's own consult of the transaction.
  let status: OrderStatus = p;
  if (cfg.mode !== "mock") {
    const o = await gp.consultOrder(r.provider_order_id).catch(() => null);
    if (!o?.status) {
      await deps.log({ booking_id: r.id, provider_order_id: r.provider_order_id, status: p.status, outcome: "deferred:consult_failed" });
      return new Response("Consult failed, retry later", { status: 503 });
    }
    status = { ...o, amountBrl: o.amountBrl ?? p.amountBrl ?? null, installments: o.installments ?? p.installments ?? null, method: o.method ?? p.method };
  }
  const outcome = await deps.settle(r.id, status);
  await deps.log({ booking_id: r.id, provider_order_id: r.provider_order_id, status: status.status, outcome, payload: { status: status.status, amountUsd: status.amountUsd, amountBrl: status.amountBrl ?? null, fee: status.fee, method: status.method, route: bookingId ? "booking_id" : "bare" } });
  console.log(`[globalpays:webhook] booking=${r.id.slice(0, 8)} status=${status.status} outcome=${outcome}`);
  return Response.json({ received: true, outcome });
}

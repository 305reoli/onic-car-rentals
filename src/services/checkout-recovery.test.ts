import { beforeEach, expect, it, vi } from "vitest";
const send = vi.hoisted(() => vi.fn(async (_input: { to: string; subject: string; html: string; idempotencyKey?: string }) => ({ sent: true, id: "receipt-test" })));
vi.mock("./resend-email.server", () => ({ emailConfigured: () => true, sendResendEmail: send }));
import { processCheckoutRecovery } from "./checkout-recovery.server";

function database(rows: any[]) {
  const notifications: any[] = [];
  return { notifications, from(table: string) {
    let updates: any = null, filters: ((r: any) => boolean)[] = [], single = false, inserting: any;
    const q: any = {
      select: () => q, update: (v: any) => { updates = v; return q; }, insert: (v: any) => { inserting = v; return q; },
      eq: (k: string, v: any) => { filters.push(r => r[k] === v); return q; },
      is: (k: string, v: any) => { filters.push(r => (r[k] ?? null) === v); return q; },
      lte: (k: string, v: any) => { filters.push(r => r[k] <= v); return q; },
      gt: (k: string, v: any) => { filters.push(r => r[k] > v); return q; },
      order: () => q, limit: () => q, maybeSingle: () => { single = true; return q; },
      then: (resolve: any) => {
        if (table === "notification_log") { notifications.push(inserting); return Promise.resolve({ error: null }).then(resolve); }
        const matched = rows.filter(r => filters.every(f => f(r)));
        if (updates) matched.forEach(r => Object.assign(r, updates));
        return Promise.resolve({ data: single ? matched[0] ?? null : matched, error: null }).then(resolve);
      },
    }; return q;
  } };
}
const pending = () => ({ id: "test", status: "pending_payment", created_at: "2026-11-09T00:00:00.000Z", expires_at: "2026-11-10T00:00:00.000Z", language: "pt", email: "preview@example.com", first_name: "Test", vehicle_name: "Defender", vehicle_slug: "land-rover-defender", base_city: "orlando", service_city: "orlando", pickup_at: "2026-12-15T15:00:00Z", return_at: "2026-12-18T15:00:00Z" });
beforeEach(() => send.mockClear());
it("claims once, sends through existing sender and records the receipt", async () => {
  const row = pending(), db = database([row]);
  await processCheckoutRecovery(db as never, new Date("2026-11-09T02:01:00Z"));
  await processCheckoutRecovery(db as never, new Date("2026-11-09T03:01:00Z"));
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[0]).toMatchObject({ subject: "Conclua sua reserva na Sua Locadora", idempotencyKey: "checkout-recovery-test" });
  expect(db.notifications[0]).toMatchObject({ kind: "checkout_recovery", status: "sent", detail: "receipt-test" });
});
it("expires at 24h silently, never contacts completed bookings", async () => {
  const row = pending(), db = database([row, { ...pending(), id: "paid", status: "completed" }]);
  await processCheckoutRecovery(db as never, new Date("2026-11-10T00:00:00Z"));
  expect(row.status).toBe("expired"); expect(send).not.toHaveBeenCalled(); expect(db.notifications).toHaveLength(0);
});
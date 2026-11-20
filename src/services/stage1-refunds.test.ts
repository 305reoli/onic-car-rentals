import { describe, expect, it, vi } from "vitest";
vi.mock("./notify.server", () => ({ notify: vi.fn(), customerMessage: vi.fn() }));
import { gpRefundTask } from "./instant.server";
function database(order: string) {
  const updates: Record<string, unknown>[] = [], events: Record<string, unknown>[] = [];
  const db = { from: (table: string) => {
    const chain: any = {
      select: () => chain, eq: () => chain,
      maybeSingle: async () => ({ data: { provider_order_id: order, refunded_at: null, gp_refund_due_usd: null } }),
      update: (u: Record<string, unknown>) => { updates.push(u); return chain; },
      insert: async (e: Record<string, unknown>) => { events.push(e); return {}; },
      then: (resolve: (x: unknown) => void) => resolve({ data: [{ id: "booking" }], error: null }),
    }; return chain;
  } };
  return { db, updates, events };
}
describe("Stage 1 Global Pays refund handling", () => {
 const row = { id: "booking", payment_provider: "globalpays", flow: "gp_request", paid_amount_usd: 4121.55, vehicle_name: "Ferrari Portofino" };
 it("decline/expiry automatically refunds the entire mock payment without a staff task", async () => {
  const x=database("mock_test"); await gpRefundTask(x.db as never,row,"substitute declined");
  expect(x.updates[0]?.['paid_amount_usd']).toBe(0);expect(x.updates[0]?.['refunded_at']).toBeTruthy();expect(x.updates[0]?.['gp_refund_due_usd']).toBeUndefined();
  expect(x.events[0]?.['outcome']).toBe("mock:automatic_full_refund");
 });
 it("live order creates a complete 4121.55 staff refund task, never a simulated refund",async()=>{
  const x=database("real_order");await gpRefundTask(x.db as never,row,"substitute expired");
  expect(x.updates[0]?.['gp_refund_due_usd']).toBe(4121.55);expect(x.updates[0]?.['refunded_at']).toBeUndefined();expect(x.events).toHaveLength(0);
 });
 it("cheaper mock substitute refunds exactly the difference immediately",async()=>{
  const x=database("mock_test");await gpRefundTask(x.db as never,{...row,paid_amount_usd:523.98},"difference",31.95);
  expect(x.updates[0]?.['paid_amount_usd']).toBe(492.03);expect(x.events[0]?.['payload']).toEqual({amount_usd:31.95,reason:"difference"});
 });
});

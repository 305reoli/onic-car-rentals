import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ results: [] as { data: unknown; error: unknown }[], filters: [] as [string, unknown][], tables: [] as string[] }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { inputValidator: (_v: unknown) => builder, handler: (fn: (args: unknown) => unknown) => fn };
  return builder;
} }));
function client() {
  return { from: (table: string) => {
    mocks.tables.push(table);
    const result = mocks.results.shift();
    const query: Record<string, unknown> = { then: (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve) };
    for (const method of ["select", "eq", "in", "or", "lt", "gt", "gte", "limit", "maybeSingle"]) query[method] = (value: unknown, extra?: unknown) => { mocks.filters.push([method, [value, extra]]); return query; };
    return query;
  } };
}
vi.mock("./public-client.server", () => ({ publicClient: client }));
vi.mock("@/integrations/supabase/client.server", () => ({ get supabaseAdmin() { return client(); } }));
import { getCheckoutStockHold, getModelScarcity } from "./scarcity.functions";

const vehicleId = "fc14f176-a78e-4f40-8d21-9c1009947d04";
const data = { vehicleId, pickup: "2026-11-17T10:00:00Z", ret: "2026-11-21T10:00:00Z" };
const target = { id: vehicleId, brand: "Toyota", model: "Corolla", city: "orlando", active: true, blocked_dates: [] };
const result = (data: unknown, error: unknown = null) => ({ data, error });
const callMetrics = getModelScarcity as unknown as (args: { data: typeof data }) => Promise<{ units: number | null; booked: number | null }>;
const callHold = getCheckoutStockHold as unknown as (args: { data: typeof data & { token: string } }) => Promise<{ status: string; holdUntil: string } | null>;
beforeEach(() => { mocks.results.length = 0; mocks.filters.length = 0; mocks.tables.length = 0; });
describe("aggregate-only scarcity reads", () => {
  it("returns real model counts without exposing any booking row", async () => {
    mocks.results.push(result(target), result([target, { ...target, id: "b" }]), result([{ vehicle_id: "b", status: "confirmed", pickup_at: data.pickup, return_at: data.ret }]), result([{ is_test: false, status: "confirmed", created_at: new Date().toISOString(), paid_amount_usd: 298.2 }]), result([]));
    expect(await callMetrics({ data })).toEqual({ units: 1, booked: 1 });
  });
  it("reads only local vehicles and bookings for availability", async () => {
    mocks.results.push(result(target), result([target, { ...target, id: "b" }]), result([]), result([]));
    expect((await callMetrics({ data })).units).toBe(2);
    expect(mocks.tables).toEqual(["vehicles", "vehicles", "prereservations", "prereservations"]);
  });
  it("omits unavailable metrics on database errors instead of treating them as empty bookings", async () => {
    mocks.results.push(result(target), result([target]), result(null, "query failed"), result(null, "query failed"), result([]));
    expect(await callMetrics({ data })).toEqual({ units: null, booked: null });
  });
  it("omits a potentially truncated overlap result", async () => {
    mocks.results.push(result(target), result([target]), result(Array(1000).fill({ vehicle_id: vehicleId, status: "confirmed", pickup_at: data.pickup, return_at: data.ret })), result([]), result([]));
    expect(await callMetrics({ data })).toEqual({ units: null, booked: null });
  });
  it("does not call the database for invalid dates", async () => {
    expect(await callMetrics({ data: { ...data, ret: "invalid" } })).toEqual({ units: null, booked: null });
    expect(mocks.tables).toEqual([]);
  });
});
describe("actual checkout stock hold lookup", () => {
  const holdData = { ...data, token: "private-checkout-capability-token" };
  it("returns the stored hold_until only for the matching checkout_hold and rental dates", async () => {
    mocks.results.push(result({ status: "checkout_hold", hold_until: "2026-11-11T04:27:00Z", pickup_at: data.pickup, return_at: data.ret }));
    const hold = await callHold({ data: holdData });
    expect(hold?.holdUntil).toBe("2026-11-11T04:27:00Z");
    expect(mocks.filters).toContainEqual(["eq", ["token", holdData.token]]);
    expect(mocks.filters).toContainEqual(["eq", ["vehicle_id", vehicleId]]);
  });
  it.each(["draft", "confirmed", "payment_failed"])("never represents %s as a held car", async status => {
    mocks.results.push(result({ status, hold_until: "2026-11-11T04:27:00Z", pickup_at: data.pickup, return_at: data.ret }));
    expect(await callHold({ data: holdData })).toBeNull();
  });
  it("does not reuse the old hold when checkout dates change", async () => {
    mocks.results.push(result({ status: "checkout_hold", hold_until: "2026-11-11T04:27:00Z", pickup_at: "2026-11-18T10:00:00Z", return_at: data.ret }));
    expect(await callHold({ data: holdData })).toBeNull();
  });
});
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const mocks = vi.hoisted(() => ({ tables: [] as string[], results: [] as unknown[] }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { inputValidator: () => builder, handler: (handler: unknown) => handler };
  return builder;
} }));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeader: vi.fn(), getCookie: vi.fn() }));
function db() {
  return { from: (table: string) => {
    mocks.tables.push(table);
    const value = mocks.results.shift();
    const query: Record<string, unknown> = { then: (resolve: (data: unknown) => unknown) => Promise.resolve({ data: value, error: null }).then(resolve) };
    for (const method of ["select", "eq", "neq", "or", "order", "limit", "lt", "gt", "gte", "maybeSingle"]) query[method] = () => query;
    return query;
  } };
}
vi.mock("./public-client.server", () => ({ publicClient: db }));
vi.mock("@/integrations/supabase/client.server", () => ({ get supabaseAdmin() { return db(); } }));
import { getVehicles, getVehicle, getBookedDays } from "./catalog.functions";
import { carIsFree } from "./booking-core.server";
const vehicle = { id: "fc14f176-a78e-4f40-8d21-9c1009947d04", name: "Cadillac Escalade ESV", daily_price_usd: 399, security_deposit_usd: 300, city: "miami", slug: "cadillac-escalade-esv", active: true };
const pickup = new Date("2026-12-03T10:00:00Z"), ret = new Date("2026-12-10T10:00:00Z");
beforeEach(() => { mocks.tables.length = 0; mocks.results.length = 0; });
describe("database-owned fleet after partner retirement", () => {
  it("loads the public catalog directly from vehicles with its stored rate", async () => {
    mocks.results.push([vehicle]);
    const call = getVehicles as unknown as (args: { data: {} }) => Promise<typeof vehicle[]>;
    expect(await call({ data: {} })).toMatchObject([{ name: vehicle.name, daily_price_usd: 399 }]);
    expect(mocks.tables).toEqual(["vehicles"]);
  });
  it("loads car detail directly from vehicles", async () => {
    mocks.results.push(vehicle);
    const call = getVehicle as unknown as (args: { data: { city: string; slug: string } }) => Promise<typeof vehicle>;
    expect(await call({ data: { city: "miami", slug: vehicle.slug } })).toMatchObject({ id: vehicle.id, daily_price_usd: 399 });
    expect(mocks.tables).toEqual(["vehicles"]);
  });
  it("calendar combines local blocked dates and local confirmed rental dates only", async () => {
    mocks.results.push({ blocked_dates: ["2026-12-01"] }, [{ pickup_at: "2026-12-03T10:00:00Z", return_at: "2026-12-04T10:00:00Z" }]);
    const call = getBookedDays as unknown as (args: { data: { vehicleId: string } }) => Promise<string[]>;
    expect(await call({ data: { vehicleId: vehicle.id } })).toEqual(["2026-12-01", "2026-12-03", "2026-12-04"]);
    expect(mocks.tables).toEqual(["vehicles", "prereservations"]);
  });
  it("booking availability succeeds without any remote availability query", async () => {
    mocks.results.push([]);
    expect(await carIsFree(db() as unknown as SupabaseClient<Database>, vehicle.id, [], pickup, ret)).toBe(true);
    expect(mocks.tables).toEqual(["prereservations"]);
  });
  it("booking availability still rejects a local overlap", async () => {
    mocks.results.push([{ id: "local-booking" }]);
    expect(await carIsFree(db() as unknown as SupabaseClient<Database>, vehicle.id, [], pickup, ret)).toBe(false);
  });
  it("booking availability still rejects local manually blocked dates", async () => {
    mocks.results.push([]);
    expect(await carIsFree(db() as unknown as SupabaseClient<Database>, vehicle.id, ["2026-12-06"], pickup, ret)).toBe(false);
  });
});

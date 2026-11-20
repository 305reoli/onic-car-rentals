import { describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { receiveFleetEvent } from "./fleet-sync.server";
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

const SECRET = "s3cret";
const RC = "887ddb36-4497-4e47-b2e6-2170d1f8771c";
const STORED = "c1d59b70-e63c-4a61-94ab-97a1e6fd23e2";
const OTHER = "d757a8a1-3321-4ab9-9ba9-7f1af5c0de6d";
const req = (body: unknown) => new Request("https://x/api/public/fleet-sync", { method: "POST", headers: { "x-site-booking-secret": SECRET }, body: JSON.stringify(body) });
const avail = (site_vehicle_id: string, rc = RC, event_id = "ev-1") => ({ schema_version: 2, origin_system: "sistemagestao", origin_vehicle_id: rc, occurred_at: "2026-11-17T16:00:00Z", event_id, source_revision: 200, event_type: "vehicle.availability_changed", site_vehicle_id, availability: { available: false, reason: "rental_overlap", ranges: [{ start_at: "2026-11-30T13:00:00Z", end_at: "2026-12-12T13:00:00Z", reason: "rental_overlap" }] } });

/** In-memory links table + availability rows, shaped like the Supabase query builder calls the intake makes. */
function fakeDb(links: { origin_vehicle_id: string; site_vehicle_id: string }[], cars: string[]) {
  const remote = new Map<string, unknown>();
  const inserts: unknown[] = [];
  const query = (table: string) => {
    const f: Record<string, string> = {};
    const b = {
      select: () => b, limit: () => b,
      eq: (k: string, v: string) => { f[k] = v; return b; },
      maybeSingle: async () => {
        if (table === "vehicles") return { data: cars.includes(f["id"]!) ? { id: f["id"] } : null, error: null };
        const row = links.find(l => (f["origin_vehicle_id"] === undefined || l.origin_vehicle_id === f["origin_vehicle_id"]) && (f["site_vehicle_id"] === undefined || l.site_vehicle_id === f["site_vehicle_id"]));
        return { data: row ?? null, error: null };
      },
      insert: async (row: { origin_vehicle_id: string; site_vehicle_id: string }) => { inserts.push(row); links.push(row); return { error: null }; },
    };
    return b;
  };
  const rpc = vi.fn(async (_fn: string, a: { e: { origin_vehicle_id: string }; avail: unknown }) => {
    const l = links.find(x => x.origin_vehicle_id === a.e.origin_vehicle_id);
    if (!l) return { data: null, error: { message: "vehicle_not_mapped" } };
    remote.set(l.site_vehicle_id, a.avail);
    return { data: { ok: true, duplicate: false, site_vehicle_id: l.site_vehicle_id, action: "availability_applied" }, error: null };
  });
  return { db: { from: query, rpc } as never, rpc, remote, links, inserts };
}

describe("fleet-sync pairing mismatch guard", () => {
  it("refuses a mismatched availability update with a clear reply and changes nothing", async () => {
    const t = fakeDb([{ origin_vehicle_id: RC, site_vehicle_id: STORED }], [STORED, OTHER]);
    const res = await receiveFleetEvent(req(avail(OTHER)), SECRET, async () => t.db);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "pairing_mismatch", sistemagestao_vehicle_id: RC, named_site_vehicle_id: OTHER, stored_site_vehicle_id: STORED });
    expect(body.message).toContain(OTHER);
    expect(body.message).toContain(STORED);
    expect(t.rpc).not.toHaveBeenCalled();
    expect(t.remote.size).toBe(0);
    expect(t.inserts).toHaveLength(0);
    expect(t.links).toEqual([{ origin_vehicle_id: RC, site_vehicle_id: STORED }]);
  });
  it("applies a matched availability update normally", async () => {
    const t = fakeDb([{ origin_vehicle_id: RC, site_vehicle_id: STORED }], [STORED]);
    const res = await receiveFleetEvent(req(avail(STORED)), SECRET, async () => t.db);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, action: "availability_applied", site_vehicle_id: STORED });
    expect(t.remote.get(STORED)).toMatchObject({ available: false });
  });
  it("a first-time car still learns its pairing from the update", async () => {
    const t = fakeDb([], [STORED]);
    const res = await receiveFleetEvent(req(avail(STORED, "rc-new")), SECRET, async () => t.db);
    expect(res.status).toBe(200);
    expect(t.inserts).toEqual([expect.objectContaining({ origin_vehicle_id: "rc-new", site_vehicle_id: STORED })]);
    expect(t.remote.get(STORED)).toMatchObject({ available: false });
  });
});

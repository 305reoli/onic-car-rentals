import { describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { findDivergences, outboundEnvelope, remoteBlocks, rulesPatch, fleetV2Schema, RULE_FIELDS } from "./fleet-sync";
import { receiveFleetEvent, flushFleetEvents } from "./fleet-sync.server";
import { runFleetCheck, type CheckDeps } from "./fleet-check.server";
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

const SECRET = "s3cret";
const base = { schema_version: 2, origin_system: "sistemagestao", origin_vehicle_id: "03c26086-de38-4192-902d-e7a7ac3d9bc9", occurred_at: "2026-11-12T23:00:00Z" };
const req = (body: unknown) => new Request("https://x/api/public/fleet-sync", { method: "POST", headers: { "x-site-booking-secret": SECRET }, body: JSON.stringify(body) });

/** In-memory model of apply_sistemagestao_fleet_v2: event-id idempotency (hash conflict), stale revisions, patch-only writes, no outbox (inbound flag). */
function fakeDb() {
  const events = new Map<string, { hash: string; action: string }>();
  const car: Record<string, unknown> = { daily_price_usd: 10, security_deposit_usd: 10, insurance_deductible_usd: null, min_days: null, min_age: 25, body_category: "suv" };
  const state = { car, remote: null as unknown, outbox: [] as unknown[], rev: 0 };
  const rpc = vi.fn(async (_fn: string, a: { e: { event_id: string; source_revision: number; event_type: string }; hash: string; patch: Record<string, unknown>; avail: unknown }) => {
    const prior = events.get(a.e.event_id);
    if (prior) return { data: prior.hash !== a.hash ? { ok: false, error: "conflicting_event_id" } : { ok: true, duplicate: true, site_vehicle_id: "eb6d5582", action: prior.action }, error: null };
    let action: string;
    if (a.e.source_revision <= state.rev) action = "stale_ignored";
    else { state.rev = a.e.source_revision; if (a.e.event_type === "vehicle.availability_changed") { state.remote = a.avail; action = "availability_applied"; } else { Object.assign(car, a.patch); action = "rules_applied"; } }
    events.set(a.e.event_id, { hash: a.hash, action });
    return { data: { ok: true, duplicate: false, site_vehicle_id: "eb6d5582", action }, error: null };
  });
  return { state, db: { rpc } as never };
}

describe("v2 inbound price/rules (each of the six fields)", () => {
  const values = { daily_price: 12, security_deposit: 20, deductible: 1000, minimum_days: 4, minimum_age: 30, category: "luxury" } as const;
  const column = { daily_price: "daily_price_usd", security_deposit: "security_deposit_usd", deductible: "insurance_deductible_usd", minimum_days: "min_days", minimum_age: "min_age", category: "body_category" } as const;
  it.each(RULE_FIELDS.filter(f => f !== "daily_price").map(f => [f]))("%s applies alone; other fields untouched", async (field) => {
    const { db, state } = fakeDb();
    const res = await receiveFleetEvent(req({ ...base, event_id: `e-${field}`, event_type: "vehicle.updated", source_revision: 5, changed_fields: [field], snapshot: { ...values, daily_price: 999 } }), SECRET, async () => db);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, duplicate: false, warnings: [] });
    expect(state.car[column[field]]).toBe(values[field]);
    expect(state.car["daily_price_usd"]).toBe(10);
    expect(state.outbox).toHaveLength(0); // loop guard: inbound never queues outbound
  });
  it("NULL minimum days/age preserve; out-of-bounds and $0 deposit are not applied", () => {
    const ev = fleetV2Schema.parse({ ...base, event_id: "x", event_type: "vehicle.updated", source_revision: 1, changed_fields: ["minimum_days", "minimum_age", "security_deposit"], snapshot: { minimum_days: null, minimum_age: 12, security_deposit: 0 } });
    const r = rulesPatch(ev as never);
    expect(r.patch).toEqual({});
    expect(r.warnings).toEqual(["minimum_age_out_of_bounds", "security_deposit_zero_not_applied"]);
  });
});

describe("v2 inbound availability + idempotency", () => {
  it("unavailable then available again; replay duplicate:true; conflicting id 409; stale ignored", async () => {
    const { db, state } = fakeDb();
    const off = { ...base, event_id: "a1", event_type: "vehicle.availability_changed", source_revision: 10, availability: { available: false, reason: "booking", ranges: [{ start_at: "2026-12-01T15:00:00Z", end_at: "2026-12-04T15:00:00Z", reason: "booking" }] } };
    expect(await (await receiveFleetEvent(req(off), SECRET, async () => db)).json()).toMatchObject({ ok: true, duplicate: false, action: "availability_applied", warnings: [] });
    expect(remoteBlocks(state.remote as never, new Date("2026-12-02T00:00:00Z"), new Date("2026-12-03T00:00:00Z"))).toBe(true);
    expect((await (await receiveFleetEvent(req(off), SECRET, async () => db)).json()).duplicate).toBe(true);
    const conflict = await receiveFleetEvent(req({ ...off, source_revision: 11 }), SECRET, async () => db);
    expect(conflict.status).toBe(409);
    const on = { ...off, event_id: "a2", source_revision: 12, availability: { available: true, reason: "available", ranges: [] } };
    expect((await (await receiveFleetEvent(req(on), SECRET, async () => db)).json()).action).toBe("availability_applied");
    expect(remoteBlocks(state.remote as never, new Date("2026-12-02T00:00:00Z"), new Date("2026-12-03T00:00:00Z"))).toBe(false);
    const stale = await (await receiveFleetEvent(req({ ...off, event_id: "a3", source_revision: 9 }), SECRET, async () => db)).json();
    expect(stale.action).toBe("stale_ignored");
    expect(remoteBlocks(state.remote as never, new Date("2026-12-02T00:00:00Z"), new Date("2026-12-03T00:00:00Z"))).toBe(false);
    expect(state.outbox).toHaveLength(0);
  });
  it("wrong secret 401", async () => {
    const { db } = fakeDb();
    expect((await receiveFleetEvent(new Request("https://x", { method: "POST", body: "{}" }), SECRET, async () => db)).status).toBe(401);
  });
});

describe("v2 outbound envelopes", () => {
  const row = { event_id: "o1", vehicle_id: "eb6d5582-d6c3-414f-bd3b-1264a74bc427", source_revision: 7, occurred_at: "2026-11-12T23:00:00Z" };
  it("rules event carries schema 2, changed_fields and the six-field snapshot", () => {
    const snap = { daily_price: 11, security_deposit: 10, deductible: null, minimum_days: null, minimum_age: 25, category: "suv" };
    expect(outboundEnvelope({ ...row, event_type: "vehicle.updated", schema_version: 2, changed_fields: ["daily_price"], snapshot: snap })).toEqual({ schema_version: 2, ...row, event_type: "vehicle.updated", origin_system: "site", origin_vehicle_id: row.vehicle_id, vehicle_id: undefined, changed_fields: ["daily_price"], snapshot: snap });
  });
  it("availability event replaces snapshot with availability; v1 unchanged", () => {
    const a = { available: false, reason: "inactive", ranges: [] };
    const env = outboundEnvelope({ ...row, event_type: "vehicle.availability_changed", schema_version: 2, snapshot: {}, availability: a });
    expect(env).toMatchObject({ schema_version: 2, availability: a });
    expect(env).not.toHaveProperty("snapshot");
    const v1 = outboundEnvelope({ ...row, event_type: "vehicle.created", schema_version: 1, snapshot: { name: "x" } });
    expect(v1).not.toHaveProperty("schema_version");
  });
  it("flush sends v2 events, learns the SistemaGestao counterpart and marks unmapped 422 terminal", async () => {
    const ev = [{ ...row, event_type: "vehicle.availability_changed", schema_version: 2, snapshot: {}, availability: { available: true, reason: "available", ranges: [] } }, { ...row, event_id: "o2", source_revision: 8, vehicle_id: "11111111-1111-4111-8111-111111111111", event_type: "vehicle.availability_changed", schema_version: 2, snapshot: {}, availability: { available: true, ranges: [] } }];
    const updates: unknown[] = []; const upserts: unknown[] = [];
    const db = { rpc: async () => ({ data: ev, error: null }), from: () => ({ update: (u: unknown) => ({ eq: async () => { updates.push(u); return { error: null }; } }), upsert: (u: unknown) => ({ then: (f: (x: { error: null }) => void) => { upserts.push(u); f({ error: null }); } }) }) } as never;
    process.env["SISTEMAGESTAO_INTAKE_SECRET"] = SECRET;
    const sent: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => { const b = JSON.parse(String(init.body)); sent.push(b); return b.event_id === "o1" ? Response.json({ ok: true, duplicate: false, warnings: [], sistemagestao_vehicle_id: "03c26086-de38-4192-902d-e7a7ac3d9bc9" }) : Response.json({ ok: false, error: "vehicle_not_mapped" }, { status: 422 }); }));
    await flushFleetEvents(db, null, "https://rc.example/api/public/fleet-sync");
    vi.unstubAllGlobals();
    expect((sent[0] as { schema_version: number }).schema_version).toBe(2);
    expect(upserts).toEqual([expect.objectContaining({ origin_vehicle_id: "03c26086-de38-4192-902d-e7a7ac3d9bc9", provenance: "site" })]);
    expect(updates.map(u => (u as { status: string }).status)).toEqual(["sent", "unmapped"]);
  });
});

describe("daily divergence check", () => {
  const pair = { site_vehicle_id: "eb6d5582-d6c3-414f-bd3b-1264a74bc427", sistemagestao_vehicle_id: "03c26086-de38-4192-902d-e7a7ac3d9bc9" };
  const site = { vehicle_id: pair.site_vehicle_id, exists: true, daily_price: 10, security_deposit: 10, deductible: 1500, minimum_days: null, minimum_age: 25, category: "suv", availability: { available: true } };
  const rc = { vehicle_id: pair.sistemagestao_vehicle_id, exists: true, daily_price: 10, security_deposit: 10, deductible: 1000, minimum_days: null, minimum_age: null, category: "suv", availability: { available: true } };
  it("lists field, both IDs and both values; null min days/age not compared", () => {
    expect(findDivergences([pair], [site], [rc]).divergences).toEqual([{ ...pair, field: "deductible", site: 1500, sistemagestao: 1000 }]);
  });
  function deps(remote: typeof rc) {
    const sendOwner = vi.fn(async () => ({ sent: true, detail: "ok" })); const log = vi.fn(async () => {});
    const db = { from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: [{ origin_vehicle_id: pair.sistemagestao_vehicle_id, site_vehicle_id: pair.site_vehicle_id }], error: null }) }), in: async () => ({ data: [{ id: site.vehicle_id, name: "TEST SYNC", body_category: "suv", daily_price_usd: 10, security_deposit_usd: 10, insurance_deductible_usd: null, min_days: null, min_age: 25 }], error: null }) }) }), rpc: async () => ({ data: { available: true, reason: "available", ranges: [] } }) } as never;
    return { d: { db, fetchRemote: async () => [remote], sendOwner, log } as CheckDeps, sendOwner, log };
  }
  it("divergent run sends ONE owner e-mail listing each car", async () => {
    const { d, sendOwner } = deps(rc);
    const r = await runFleetCheck(d, false);
    expect(sendOwner).toHaveBeenCalledTimes(1);
    expect((sendOwner.mock.calls[0] as unknown as [string, string[]])[1][0]).toContain("03c26086-de38-4192-902d-e7a7ac3d9bc9");
    expect((r as { emailed?: boolean }).emailed).toBe(true);
  });
  it("clean run sends no e-mail and only logs", async () => {
    const { d, sendOwner, log } = deps({ ...rc, deductible: 1500 });
    const r = await runFleetCheck(d, false);
    expect(r.divergences).toEqual([]);
    expect(sendOwner).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ status: "clean" }));
  });
  it("dry run never e-mails or logs", async () => {
    const { d, sendOwner, log } = deps(rc);
    expect((await runFleetCheck(d, true)).divergences).toHaveLength(1);
    expect(sendOwner).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled();
  });
});

describe("SistemaGestao v2 wire rules", () => {
  const ev = (snapshot: Record<string, unknown>, changed: string[]) => ({ event_id: "e", event_type: "vehicle.updated", vehicle_id: "v", source_revision: 1, occurred_at: "2026-11-13T00:00:00Z", schema_version: 2, changed_fields: changed, snapshot });
  const d = { deductible: 1500, minimumDays: 3, minimumAge: 25 };
  it("fills unchanged blanks with effective values so all six are present", async () => {
    const { outboundEnvelope, wireRulesEnvelope } = await import("./fleet-sync");
    const out = wireRulesEnvelope(outboundEnvelope(ev({ daily_price: 199, security_deposit: 300, deductible: null, minimum_days: null, minimum_age: 21, category: "suv" }, ["security_deposit"])), d) as unknown as { changed_fields: string[]; snapshot: Record<string, unknown> };
    expect(out.changed_fields).toEqual(["security_deposit"]);
    expect(out.snapshot).toEqual({ security_deposit: 300, deductible: 1500, minimum_days: 3, minimum_age: 21, category: "suv", photos: [] });
  });
  it("drops a changed field cleared to blank and skips when nothing remains", async () => {
    const { outboundEnvelope, wireRulesEnvelope } = await import("./fleet-sync");
    expect(wireRulesEnvelope(outboundEnvelope(ev({ daily_price: null }, ["daily_price"])), d)).toBeNull();
  });
  it("treats a 400 payload rejection as terminal, 429 as retryable", async () => {
    const { postFleetEvent } = await import("./fleet-sync");
    const f = (status: number) => (async () => new Response(JSON.stringify({ ok: false }), { status })) as unknown as typeof fetch;
    expect((await postFleetEvent("https://x.test/f", "s", {}, f(400))).status).toBe("rejected");
    expect((await postFleetEvent("https://x.test/f", "s", {}, f(429))).status).toBe("failed");
  });
});

describe("compare three-part availability", () => {
  it("shows remote availability even when local car is inactive", async () => {
    const { threePartAvailability } = await import("./fleet-sync");
    const r = threePartAvailability({ available: false, reason: "inactive", ranges: [] }, { available: true, reason: "available", ranges: [] });
    expect(r.local_availability?.available).toBe(false);
    expect(r.remote_availability).toEqual({ available: true, reason: "available", ranges: [] });
    expect(r.effective_availability.available).toBe(false);
  });
});

describe("fleet sync hardening (Nov 13)", () => {
  const d = { deductible: 2500, minimumDays: 3, minimumAge: 21 };
  const base = { event_id: "e1", event_type: "vehicle.updated", vehicle_id: "v1", source_revision: 5, occurred_at: "2026-11-13T10:00:00Z", schema_version: 2 };
  it("outbound vehicle.updated carries all six fields and the photos array", async () => {
    const { outboundEnvelope, wireRulesEnvelope } = await import("./fleet-sync");
    const out = wireRulesEnvelope(outboundEnvelope({ ...base, changed_fields: ["security_deposit"], snapshot: { daily_price: 199, security_deposit: 300, deductible: null, minimum_days: 2, minimum_age: 25, category: "suv", photos: ["https://seudominio.com/api/public/photo/cars/a.jpg", "not-a-url"] } }), d) as unknown as { snapshot: Record<string, unknown> };
    expect(Object.keys(out.snapshot).sort()).toEqual(["category", "deductible", "minimum_age", "minimum_days", "photos", "security_deposit"]);
    expect(out.snapshot["photos"]).toEqual(["https://seudominio.com/api/public/photo/cars/a.jpg"]);
  });
  it("delete is sent only when the site row is verifiably gone; archive only while still inactive", async () => {
    const { lifecycleStillValid } = await import("./fleet-sync");
    expect(lifecycleStillValid("vehicle.deleted", null)).toBe(true);
    expect(lifecycleStillValid("vehicle.deleted", { active: true })).toBe(false);
    expect(lifecycleStillValid("vehicle.archived", { active: false })).toBe(true);
    expect(lifecycleStillValid("vehicle.archived", { active: true })).toBe(false);
    expect(lifecycleStillValid("vehicle.archived", null)).toBe(false);
  });
  it("SistemaGestao permanent 409s become terminal with the reason recorded", async () => {
    const { postFleetEvent } = await import("./fleet-sync");
    const f = (async () => new Response(JSON.stringify({ ok: false, error: "mapping_not_found" }), { status: 409 })) as unknown as typeof fetch;
    expect(await postFleetEvent("https://example.com/fleet", "x", {}, f)).toMatchObject({ ok: false, status: "rejected", error: "fleet sync rejected (HTTP 409: mapping_not_found)" });
    const g = (async () => new Response(JSON.stringify({ ok: false, error: "sync_failed" }), { status: 500 })) as unknown as typeof fetch;
    expect(await postFleetEvent("https://example.com/fleet", "x", {}, g)).toMatchObject({ status: "failed" });
  });
  it("inbound v2 accepts an optional site_vehicle_id and still applies deposit/deductible rules", async () => {
    const { fleetV2Schema, rulesPatch } = await import("./fleet-sync");
    const ev = fleetV2Schema.parse({ schema_version: 2, event_id: "x", origin_system: "sistemagestao", origin_vehicle_id: "rc1", source_revision: 9, occurred_at: "2026-11-13T10:00:00Z", event_type: "vehicle.updated", site_vehicle_id: "0e95b79c-d664-4d13-9d56-44df0284f826", changed_fields: ["security_deposit", "deductible"], snapshot: { security_deposit: 400, deductible: 2000 } });
    expect(ev.site_vehicle_id).toBe("0e95b79c-d664-4d13-9d56-44df0284f826");
    if (ev.event_type !== "vehicle.updated") throw new Error("type");
    expect(rulesPatch(ev).patch).toEqual({ security_deposit_usd: 400, insurance_deductible_usd: 2000 });
  });
});

describe("price freeze (owner decision Nov 13)", () => {
  const d = { deductible: 2500, minimumDays: 3, minimumAge: 21 };
  const base = { event_id: "e1", event_type: "vehicle.updated", vehicle_id: "v1", source_revision: 5, occurred_at: "2026-11-13T10:00:00Z" };
  it("a price-only site edit sends nothing", async () => {
    const { outboundEnvelope, wireRulesEnvelope } = await import("./fleet-sync");
    expect(wireRulesEnvelope(outboundEnvelope({ ...base, schema_version: 2, changed_fields: ["daily_price"], snapshot: { daily_price: 250, security_deposit: 300 } }), d)).toBeNull();
  });
  it("mixed edit drops daily_price from changed_fields and snapshot", async () => {
    const { outboundEnvelope, wireRulesEnvelope } = await import("./fleet-sync");
    const out = wireRulesEnvelope(outboundEnvelope({ ...base, schema_version: 2, changed_fields: ["daily_price", "deductible"], snapshot: { daily_price: 250, deductible: 2000 } }), d) as unknown as { changed_fields: string[]; snapshot: Record<string, unknown> };
    expect(out.changed_fields).toEqual(["deductible"]);
    expect("daily_price" in out.snapshot).toBe(false);
  });
  it("v1 update/archive/delete snapshots carry no price", async () => {
    const { outboundEnvelope } = await import("./fleet-sync");
    for (const t of ["vehicle.updated", "vehicle.archived", "vehicle.deleted"]) {
      const out = outboundEnvelope({ ...base, event_type: t, snapshot: { name: "X", daily_price: 199, security_deposit: 300 } }) as { snapshot: Record<string, unknown> };
      expect(out.snapshot).toEqual({ name: "X", security_deposit: 300 });
    }
  });
  it("inbound SistemaGestao daily_price is ignored; deposit still applies", async () => {
    const { fleetV2Schema, rulesPatch } = await import("./fleet-sync");
    const ev = fleetV2Schema.parse({ schema_version: 2, event_id: "x", origin_system: "sistemagestao", origin_vehicle_id: "rc1", source_revision: 9, occurred_at: "2026-11-13T10:00:00Z", event_type: "vehicle.updated", changed_fields: ["daily_price", "security_deposit"], snapshot: { daily_price: 999, security_deposit: 400 } });
    if (ev.event_type !== "vehicle.updated") throw new Error("type");
    const r = rulesPatch(ev);
    expect(r.patch).toEqual({ security_deposit_usd: 400 });
    expect(r.warnings).toContain("daily_price_frozen_not_applied");
  });
});

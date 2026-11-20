import { describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { copyFleetPhotos, fleetCategory, fleetEnvelopeSchema, inboundVehicle, postFleetEvent, validFleetSecret } from "./fleet-sync";
import { receiveFleetEvent, flushFleetEvents } from "./fleet-sync.server";
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

const snapshot = { name: "Sync test", brand: "Example", model: "Unit", color: "Black", category: "luxury", photos: ["https://example.com/car.jpg"], status: "active" as const };
const envelope = { event_id: "event-1", event_type: "vehicle.created" as const, origin_system: "sistemagestao" as const, origin_vehicle_id: "rc-unit", source_revision: 1, occurred_at: "2026-11-12T21:58:00Z", snapshot };
describe("fleet category crosswalk", () => {
  it.each([["luxury", "luxury"], ["suv", "suv"], ["Suv", "suv"], ["SUV FULL SIZE", "suv"], ["SUV MID", "suv"], ["MINIVAN", "suv"], ["van", "suv"], ["Van", "suv"], ["sedan", "sedan"], ["Sedan Full", "sedan"], ["Sedan Economy", "sedan"], ["ESPORTIVOS", "sports"], ["ESPORTIVO CONVERSÍVEL - EXOTIC", "exotics"], ["economy", "suv"]])("%s → %s", (from, to) => expect(fleetCategory(from)).toBe(to));
  it.each([["ESPORTIVO CONVERSÍVEL - EXOTIC",799,750], ["luxury",299,300], ["ESPORTIVOS",159,250], ["suv",99,150], ["sedan",55,150]])("%s create defaults", (category, rate, deposit) => {
    const row = inboundVehicle({ ...snapshot, category: String(category) });
    expect(row.vehicle.daily_price_usd).toBe(rate);
    expect(row.vehicle.security_deposit_usd).toBe(deposit);
  });
  it("defaults missing city to Orlando and flags economy", () => {
    const result = inboundVehicle({ ...snapshot, category: "economy" });
    expect(result.vehicle.city).toBe("orlando");
    expect(result.flags).toContain("base_city_defaulted_to_orlando");
    expect(result.flags).toContain("economy_mapped_to_suv");
  });
  it("preserves supplied values, photos and inactive status; never invents year/deductible", () => {
    const result = inboundVehicle({ ...snapshot, base_city: "miami", daily_price: 0, security_deposit: 123, year: 2021, deductible: 9000, status: "inactive" });
    expect(result.vehicle.daily_price_usd).toBe(0);
    expect(result.vehicle.security_deposit_usd).toBe(123);
    expect(result.vehicle.photos).toEqual(snapshot.photos);
    expect(result.vehicle.active).toBe(false);
    expect(result.vehicle).not.toHaveProperty("year");
    expect(result.vehicle).not.toHaveProperty("deductible");
    expect(result.vehicle.internal_label).toBe("LUX-MIA-BLK");
  });
});
describe("sync defaults and photo copy", () => {
  it("treats a $0 deposit as missing and applies the $150 SUV default, keeping the sent rate", () => {
    const r = inboundVehicle({ ...snapshot, category: "suv", daily_price: 59, security_deposit: 0, base_city: "orlando" });
    expect(r.vehicle.security_deposit_usd).toBe(150);
    expect(r.vehicle.daily_price_usd).toBe(59);
    expect(r.flags).toContain("category_deposit_default_used");
  });
  it("marks a defaulted Orlando as provisional on the vehicle note and link", () => {
    const r = inboundVehicle({ ...snapshot, category: "suv" });
    expect(r.vehicle.link_reason).toBe("base_city_orlando_provisional");
    expect(r.vehicle.admin_note).toContain("PROVISIONAL");
  });
  it("copies photos into site storage and keeps the original when a copy fails", async () => {
    const fetcher = vi.fn(async (u: string) => u.includes("bad") ? new Response("x", { status: 404 }) : new Response(new Uint8Array([1, 2]), { headers: { "content-type": "image/jpeg" } }));
    const store = vi.fn(async () => true);
    const r = await copyFleetPhotos(["https://rc.example/a.jpeg?token=t", "https://rc.example/bad.jpeg"], "kia-sedona", "322549a9-xx", store, fetcher as never);
    expect(r.photos[0]).toMatch(/^cars\/kia-sedona\/rc-322549a9-[0-9a-f]{12}\.jpeg$/);
    expect(r.photos[1]).toBe("https://rc.example/bad.jpeg");
    expect(r.failed).toBe(1);
  });
});
describe("fleet inbound authentication and envelope", () => {
  it("rejects missing/wrong secret before accessing database", async () => {
    const loadDb = vi.fn();
    for (const headers of [{}, { "x-site-booking-secret": "incorrect" }]) {
      const response = await receiveFleetEvent(new Request("https://example.com", { method: "POST", headers }), "fixture-only", loadDb);
      expect(response.status).toBe(401);
    }
    expect(loadDb).not.toHaveBeenCalled();
    expect(await validFleetSecret("fixture-only", "fixture-only")).toBe(true);
  });
  it("rejects non-HTTPS photos, bad revision and non-sistemagestao origin", () => {
    expect(fleetEnvelopeSchema.safeParse({ ...envelope, snapshot: { ...snapshot, photos: ["/car.jpg"] } }).success).toBe(false);
    expect(fleetEnvelopeSchema.safeParse({ ...envelope, source_revision: 1.5 }).success).toBe(false);
    expect(fleetEnvelopeSchema.safeParse({ ...envelope, origin_system: "site" }).success).toBe(false);
  });
  it("returns 400 before database access for malformed JSON", async () => {
    const loadDb = vi.fn();
    const response = await receiveFleetEvent(new Request("https://example.com", { method: "POST", headers: { "x-site-booking-secret": "fixture" }, body: "{" }), "fixture", loadDb);
    expect(response.status).toBe(400);
    expect(loadDb).not.toHaveBeenCalled();
  });
  it("returns 200 for durable duplicate result", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, site_vehicle_id: "unit-id", action: "duplicate_ignored" }, error: null });
    const response = await receiveFleetEvent(new Request("https://example.com", { method: "POST", headers: { "x-site-booking-secret": "fixture" }, body: JSON.stringify(envelope) }), "fixture", async () => ({ rpc, from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }) as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, site_vehicle_id: "unit-id", action: "duplicate_ignored", duplicate: true, warnings: [] });
    expect(rpc).toHaveBeenCalledWith("apply_sistemagestao_fleet_event", expect.objectContaining({ e: envelope }));
  });
});
describe("fleet outbound never fails vehicle save", () => {
  it("no-ops with exact unconfigured message and no network", async () => {
    const fetcher = vi.fn();
    expect(await postFleetEvent(undefined, "fixture", envelope, fetcher)).toMatchObject({ status: "pending", error: "fleet sync target not configured" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([401,422,503])("HTTP %s remains retryable", async status => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status }));
    expect(await postFleetEvent("https://example.com/fleet", "fixture", envelope, fetcher)).toMatchObject({ ok: false, status: "failed", httpStatus: status });
  });
  it("posts unchanged envelope with the shared header and origin site", async () => {
    const outbound = { ...envelope, origin_system: "site" };
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true, action: "duplicate_ignored" }));
    expect(await postFleetEvent("https://example.com/fleet", "fixture", outbound, fetcher)).toMatchObject({ ok: true, status: "sent" });
    expect(fetcher).toHaveBeenCalledWith("https://example.com/fleet", expect.objectContaining({ body: JSON.stringify(outbound), headers: { "Content-Type": "application/json", "x-site-booking-secret": "fixture" }, redirect: "manual" }));
  });
  it("catches transport failure", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("private detail"));
    expect(await postFleetEvent("https://example.com/fleet", "fixture", envelope, fetcher)).toMatchObject({ ok: false, error: "fleet sync transport failed" });
  });
  it("uses the exact production default without sending when the queue is empty", async () => {
    vi.stubEnv("SISTEMAGESTAO_FLEET_INTAKE_URL", "");
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    try {
      expect(await flushFleetEvents({ rpc } as never)).toEqual({ ok: true, queued: true, sent: 0 });
      expect(rpc).toHaveBeenCalledWith("claim_site_fleet_events", { v_id: null });
      expect(fetcher).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
  });
  it("posts to production with the existing header and retains failed events for retry", async () => {
    vi.stubEnv("SISTEMAGESTAO_FLEET_INTAKE_URL", "");
    vi.stubEnv("SISTEMAGESTAO_INTAKE_SECRET", "fixture-only");
    const event = { ...envelope, vehicle_id: "site-unit" };
    const rpc = vi.fn().mockResolvedValue({ data: [event], error: null });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    try {
      expect(await flushFleetEvents({ rpc, from } as never)).toEqual({ ok: true, queued: true, sent: 0 });
      expect(fetcher).toHaveBeenCalledWith("https://seu-sistema.com/api/public/fleet-sync", expect.objectContaining({ headers: { "Content-Type": "application/json", "x-site-booking-secret": "fixture-only" } }));
      expect(from).toHaveBeenCalledWith("fleet_sync_outbox");
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", http_status: 404, sent_at: null, next_attempt_at: expect.any(String) }));
      expect(eq).toHaveBeenCalledWith("event_id", "event-1");
    } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
  });
});
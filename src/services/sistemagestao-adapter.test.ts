import { describe, it, expect, vi, beforeEach } from "vitest";
import { Blob as ServerBlob } from "node:buffer";
import { BLOCKED_BOOKING_ID } from "./sistemagestao-payload";
const state = vi.hoisted(() => ({ row: {} as Record<string, unknown>, download: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "vehicles" ? { slug: "honda-pilot-sport", city: "miami", security_deposit_usd: 0 } : state.row }) }) }) }),
  storage: { from: () => ({ download: state.download }) },
} }));
import { sendConfirmed, SISTEMAGESTAO_TEST_INTAKE_URL } from "./sistemagestao-adapter.server";
beforeEach(() => {
  vi.stubEnv("SISTEMAGESTAO_INTAKE_SECRET", "test-only-secret");
  state.row = { id: "test", status: "approved", is_test: true, vehicle_id: "v", first_name: "TestSecond", last_name: "TestLast", pickup_at: "2027-01-10T15:00:00Z", return_at: "2027-01-13T15:00:00Z", documents: { passport: "uploads/11111111-1111-4111-8111-111111111111/passport.png" }, price_breakdown: { base: 507, subtotal: 552, basicInsurance: 30, tolls: 15, tax: 35.88, total: 587.88 } };
  state.download.mockReset().mockResolvedValue({ data: new ServerBlob(["abc"], { type: "image/png" }) });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ rental_id: "r", duplicate: false }), { status: 200 })));
});
describe("server-only Phase B document sender", () => {
  it("hard blocks 237535b1 before storage/network", async () => {
    expect(await sendConfirmed(BLOCKED_BOOKING_ID, true)).toMatchObject({ ok: false, error: "blocked: booking already processed manually in SistemaGestao" });
    expect(fetch).not.toHaveBeenCalled(); expect(state.download).not.toHaveBeenCalled();
  });
  it("sends actual private document bytes to preview with the exact total and preserves deposit zero", async () => {
    await sendConfirmed("test", true);
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe(SISTEMAGESTAO_TEST_INTAKE_URL);
    const payload = JSON.parse(String(init?.body));
    expect(payload.documents[0]).toMatchObject({ kind: "passport", data_base64: "YWJj", size_bytes: 3 });
    expect(payload.rental.current_vehicle_deposit_usd).toBe(0);
    expect(Math.round(payload.rental.total_usd * 100)).toBe(58788);
  });
  it("known-success duplicate does not read or retransmit documents", async () => {
    state.row["sistemagestao_rental_id"] = "r";
    await sendConfirmed("test", true);
    expect(state.download).not.toHaveBeenCalled();
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body)).documents).toEqual([]);
  });
  it("rejects real bookings for preview-test sends", async () => {
    state.row["is_test"] = false;
    expect(await sendConfirmed("test", true)).toMatchObject({ ok: false });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never sends a booking with unreadable or partial documents", async () => {
    state.download.mockResolvedValue({ error: new Error("failed"), data: null });
    expect(await sendConfirmed("test", true)).toMatchObject({ ok: false, error: "payload Private document download failed" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
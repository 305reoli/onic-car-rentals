import { describe, expect, it, vi } from "vitest";
import { BLOCKED_BOOKING_ID, buildIntakePayload, postIntake } from "./sistemagestao-payload";

const booking = {
  id: "11111111-1111-4111-8111-111111111111", first_name: "TestFirst", last_name: "TestLast", email: "testfirst@example.com", phone: "+1 555-500-1111",
  whatsapp_opt_in: false, vehicle_id: "0e95b79c-d664-4d13-9d56-44df0284f826", vehicle_name: "Ford New Mustang", service_city: "miami", base_city: "miami",
  pickup_at: "2026-11-20T15:00:00.000Z", return_at: "2026-11-24T15:00:00.000Z", pickup_location: "321 Sua Avenida", return_location: "321 Sua Avenida",
  payment_provider: "stripe", stripe_session_id: "TEST-NO-CHARGE", captured_at: "2026-11-12T16:00:00+00:00",
  price_breakdown: { base: 518.4, dailyRate: 129.6, days: 4, basicInsurance: 40, tolls: 20, prepaidFuel: 65, discount: 0, subtotal: 643.4, tax: 41.82, total: 685.22, taxRate: 6.5, customFees: [],
    delivery: { legs: [{ direction: "pickup", fee: 0 }, { direction: "return", fee: 0 }] } },
};
const v = { slug: "ford-new-mustang", city: "miami", security_deposit_usd: 200 };

describe("SistemaGestao intake payload", () => {
  const p = buildIntakePayload(booking, v);
  it("uses exact sold lines with one tax line and subtotal + tax = total = paid", () => {
    expect(p.rental.itemized_lines).toEqual([
      { key: "rental", label: "Rental", amount_usd: 518.4 }, { key: "basic_insurance", label: "Basic insurance", amount_usd: 40 }, { key: "tolls", label: "Tolls", amount_usd: 20 }, { key: "prepaid_fuel", label: "Prepaid fuel", amount_usd: 65 }, { key: "tax", label: "Tax", amount_usd: 41.82 },
    ]);
    expect(p.rental.itemized_lines.filter((l) => l.key === "tax")).toHaveLength(1);
    expect(p.rental.subtotal_usd + p.rental.tax_usd).toBeCloseTo(p.rental.total_usd, 10);
    expect(p.rental.addons_total_usd).toBe(65);
    expect(Array.isArray(p.payments)).toBe(false);
    expect(p.rental.itemized_lines.every((l) => typeof l.label === "string" && l.label.length > 0)).toBe(true);
    expect(p.payments).toMatchObject({ paid_amount_usd: 685.22, amount_at_booking_usd: 685.22, provider: "stripe", status: "succeeded", payment_mode: "full", balance_amount_usd: null });
    expect(p.rental.current_vehicle_deposit_usd).toBe(200);
  });
  it("sends local date/time/timezone and never an iso field", () => {
    expect(p.rental.pickup).toEqual({ date: "2026-11-20", time: "10:00", timezone: "America/New_York" });
    expect(p.rental.return).toEqual({ date: "2026-11-24", time: "10:00", timezone: "America/New_York" });
    expect(JSON.stringify(p)).not.toMatch(/"iso"/);
  });
  it("always sends a vehicle slug and an offset captured_at", () => {
    expect(buildIntakePayload(booking, { ...v, slug: "" }).rental.vehicle_slug).toBe("ford-new-mustang");
    expect(buildIntakePayload({ ...booking, captured_at: "2026-11-12 16:00:00+00" }, v).payments.captured_at).toBe("2026-11-12T16:00:00.000Z");
    expect(buildIntakePayload({ ...booking, captured_at: "nope" }, v).payments.captured_at).toBeNull();
  });
  it("refuses lines that don't add up to the stored subtotal", () => {
    expect(() => buildIntakePayload({ ...booking, price_breakdown: { ...booking.price_breakdown, subtotal: 600 } }, v)).toThrow();
  });
});

const res = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
describe("SistemaGestao intake send", () => {
  it("never calls the endpoint for the manually processed booking", async () => {
    const f = res(200, {});
    expect(await postIntake({ booking_id: BLOCKED_BOOKING_ID }, "s", f)).toEqual({ ok: false, error: "blocked: booking already processed manually in SistemaGestao" });
    expect(f).not.toHaveBeenCalled();
  });
  it("treats duplicate:true as success with the same link", async () => {
    const r = await postIntake({ booking_id: "x" }, "s", res(200, { duplicate: true, rental_id: "r1", rental_number: "R-7" }));
    expect(r).toEqual({ ok: true, data: { link: "https://seu-sistema.com/rentals/r1", rental_id: "r1", rental_number: "R-7", duplicate: true } });
  });
  it("includes validation details in 400 errors", async () => {
    const r = await postIntake({ booking_id: "x" }, "s", res(400, { error: "invalid_payload", issues: [{ path: ["payments"], message: "Expected object" }] }));
    expect(r).toEqual({ ok: false, error: '400 invalid_payload — [{"path":["payments"],"message":"Expected object"}]' });
  });
  it("maps 401 and 422 errors", async () => {
    expect(await postIntake({ booking_id: "x" }, "s", res(401, { error: "unauthorized" }))).toEqual({ ok: false, error: "401 unauthorized" });
    expect(await postIntake({ booking_id: "x" }, "s", res(422, { error: "vehicle_not_mapped" }))).toEqual({ ok: false, error: "422 vehicle_not_mapped" });
  });
  it("preserves all receiver substatuses and zero agreement total", async () => {
    const sub = { documents_received: 3, documents_stored: ["license_front", "license_back", "passport"], agreement_status: "generated", agreement_number: "A-1", agreement_total: 0, email_sent: false, email_recipient: "testsecond@example.com", needs_owner_attention: false, reason: null };
    const r = await postIntake({ booking_id: "x" }, "secret", res(200, { rental_id: "r", ...sub }));
    expect(r.ok && r.data.substatus).toEqual(sub);
  });
  it("maps agreement_total_cents to the dollar agreement total", async () => {
    const r = await postIntake({ booking_id: "x" }, "secret", res(200, { rental_id: "r", agreement_total_cents: 58788 }));
    expect(r.ok && r.data.substatus?.agreement_total).toBe(587.88);
    const z = await postIntake({ booking_id: "x" }, "secret", res(200, { rental_id: "r", agreement_total_cents: 0 }));
    expect(z.ok && z.data.substatus?.agreement_total).toBe(0);
  });
  it("preserves owner-attention reason even on a failed receiver response", async () => {
    const r = await postIntake({ booking_id: "x" }, "secret", res(422, { error: "preconditions", needs_owner_attention: true, reason: "deductible missing", agreement_status: "not_created", email_sent: false }));
    expect(!r.ok && r.substatus).toMatchObject({ needs_owner_attention: true, reason: "deductible missing", agreement_status: "not_created", email_sent: false });
  });
  it("never persists document bytes or document URLs echoed by a receiver", async () => {
    const r = await postIntake({ booking_id: "x" }, "secret", res(200, { rental_id: "r", documents_stored: [{ kind: "passport", data_base64: "PRIVATE", url: "https://private.example/x", storage_path: "private/path" }] }));
    expect(r.ok && r.data.substatus?.documents_stored).toEqual([{ kind: "passport" }]);
  });
  it("uses only the existing authenticated intake channel and exact booking id on repeats", async () => {
    const f = res(200, { rental_id: "r", duplicate: true });
    await postIntake({ booking_id: booking.id }, "secret", f, "https://preview.example.com/api/public/site-booking-intake");
    expect((f.mock.calls as unknown as [string, RequestInit][])[0]?.[0]).toBe("https://preview.example.com/api/public/site-booking-intake");
    const init = (f.mock.calls as unknown as [string, RequestInit][])[0]?.[1];
    expect(init?.headers).toMatchObject({ "x-site-booking-secret": "secret" });
    expect(JSON.parse(String(init?.body)).booking_id).toBe(booking.id);
  });
});

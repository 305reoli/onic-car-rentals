import { describe, expect, it, vi } from "vitest";
import { finalizePaidBooking, handlePaidStripeEvent, type FinalizeDeps } from "./finalize.server";

type R = Record<string, any>;
// Tiny in-memory stand-in for the database client (eq/in/is filters, update/insert/select).
function fakeDb(tables: Record<string, R[]>) {
  const q = (t: string) => {
    const f: ((r: R) => boolean)[] = []; let op: "select" | "update" | "insert" = "select"; let patch: R = {}; let ret = false;
    const rows = () => (tables[t] ??= []).filter((r) => f.every((p) => p(r)));
    const run = () => {
      if (op === "insert") { const ex = tables[t]!.find((r) => r["ref"] && r["ref"] === patch["ref"]); if (ex) return { data: null, error: { message: "dup" } }; tables[t]!.push({ id: crypto.randomUUID(), status: "open", ...patch }); return { data: null, error: null }; }
      const m = rows(); if (op === "update") { m.forEach((r) => Object.assign(r, patch)); return { data: ret ? m.map((r) => ({ id: r["id"] })) : null, error: null }; }
      return { data: m, error: null };
    };
    const api: any = {
      select: () => { if (op !== "select") ret = true; return api; },
      update: (p: R) => { op = "update"; patch = p; return api; },
      insert: (p: R) => { op = "insert"; patch = p; return Promise.resolve(run()); },
      eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return api; },
      in: (k: string, v: unknown[]) => { f.push((r) => v.includes(r[k])); return api; },
      is: (k: string, v: unknown) => { f.push((r) => (r[k] ?? null) === v); return api; },
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) => Promise.resolve(run()).then(res, rej),
    };
    return api;
  };
  return { from: q } as never;
}
const ID = "11111111-2222-4333-8444-555555555555";
const draft = (): R => ({ id: ID, token: "t".repeat(30), status: "draft", vehicle_name: "Ford New Mustang", email: "a@b.co", language: "en", pickup_at: "2026-12-08T15:00:00Z", prereservation_amount_usd: 462, stripe_session_id: "cs_1", stripe_payment_intent_id: null, stripe_status: "requires_payment_method", captured_at: null, terms_accepted_at: null, terms_ip: null, terms_version: null, documents: {} });
function deps(over: Partial<FinalizeDeps> = {}) {
  const notify = vi.fn(async (..._a: unknown[]) => {});
  const d: FinalizeDeps = {
    stripeConnected: () => true,
    retrieveSession: async () => ({ id: "cs_1", payment_status: "paid", payment_intent: "pi_1", metadata: { prereservation_id: ID, kind: "full_payment" } }),
    retrieveIntent: async () => ({ id: "pi_1", status: "succeeded", amount: 46200, amount_received: 46200 }),
    syncHold: async () => "pi_1", notify, ...over,
  };
  return { d, notify };
}
const session = { id: "cs_1", payment_status: "paid", payment_intent: "pi_1", metadata: { prereservation_id: ID, kind: "full_payment" }, amount_total: 46200, customer_details: { name: "TestFirst", email: "a@b.co" } } as never;
const ownerNew = (n: { mock: { calls: unknown[][] } }) => n.mock.calls.filter((c) => c[0] === "owner_new").length;

describe("server-side booking finalization", () => {
  it("checkout.session.completed finalizes a paid draft into a visible booking once", async () => {
    const t = { prereservations: [draft()], settings: [], payment_orphans: [] as R[] }; const { d, notify } = deps();
    expect(await handlePaidStripeEvent(fakeDb(t), { type: "checkout.session.completed", obj: session, eventId: "evt_1" }, d)).toBe("booking_finalized");
    expect(t.prereservations[0]!["status"]).toBe("pending_approval");
    expect(t.prereservations[0]!["paid_amount_usd"]).toBe(462);
    expect(ownerNew(notify)).toBe(1);
  });
  it("duplicate session deliveries, payment_intent.succeeded and a late client submit never duplicate booking or owner email", async () => {
    const t = { prereservations: [draft()], settings: [], payment_orphans: [] as R[] }; const { d, notify } = deps(); const db = fakeDb(t);
    await handlePaidStripeEvent(db, { type: "checkout.session.completed", obj: session, eventId: "evt_1" }, d);
    expect(await handlePaidStripeEvent(db, { type: "checkout.session.completed", obj: session, eventId: "evt_1b" }, d)).toBe("already_finalized");
    expect(await handlePaidStripeEvent(db, { type: "payment_intent.succeeded", obj: { id: "pi_1", status: "succeeded", amount: 46200, metadata: { prereservation_id: ID } } as never, eventId: "evt_2" }, d)).toBe("already_finalized");
    expect((await finalizePaidBooking(db, ID, { source: "client" }, d)).outcome).toBe("already");
    expect(t.prereservations.length).toBe(1);
    expect(ownerNew(notify)).toBe(1);
    expect(notify.mock.calls.filter((c) => c[0] === "customer_received").length).toBe(1);
  });
  it("a paid session with no matching booking creates one visible orphan record and one owner alert", async () => {
    const t = { prereservations: [] as R[], settings: [], payment_orphans: [] as R[] }; const { d, notify } = deps(); const db = fakeDb(t);
    const orphan = { ...(session as R), metadata: {} } as never;
    expect(await handlePaidStripeEvent(db, { type: "checkout.session.completed", obj: orphan, eventId: "evt_9" }, d)).toBe("orphan_recorded");
    await handlePaidStripeEvent(db, { type: "checkout.session.completed", obj: orphan, eventId: "evt_9b" }, d);
    expect(t.payment_orphans.length).toBe(1);
    expect(t.payment_orphans[0]).toMatchObject({ stripe_session_id: "cs_1", stripe_payment_intent_id: "pi_1", amount_usd: 462, customer_name: "TestFirst", customer_email: "a@b.co", status: "open" });
    expect(notify.mock.calls.filter((c) => c[0] === "owner_hold_failed").length).toBe(1);
  });
  it("a hold-sync failure does not block finalization of a paid booking", async () => {
    const t = { prereservations: [draft()], settings: [], payment_orphans: [] as R[] }; const { d, notify } = deps({ syncHold: async () => { throw new Error("gateway timeout"); } });
    const res = await finalizePaidBooking(fakeDb(t), ID, { source: "webhook" }, d);
    expect(res).toMatchObject({ outcome: "finalized", holdSyncError: "gateway timeout" });
    expect(t.prereservations[0]!["status"]).toBe("pending_approval");
    expect(notify.mock.calls.some((c) => c[0] === "owner_hold_failed")).toBe(true);
  });
  it("an unpaid session does not create a booking", async () => {
    const t = { prereservations: [draft()], settings: [], payment_orphans: [] as R[] };
    const { d } = deps({ syncHold: async () => null, retrieveSession: async () => ({ id: "cs_1", payment_status: "unpaid", payment_intent: null, metadata: {} }) });
    expect((await finalizePaidBooking(fakeDb(t), ID, { source: "client" }, d)).outcome).toBe("not_paid");
    expect(t.prereservations[0]!["status"]).toBe("draft");
  });
  it("a paid booking that already expired is surfaced as an orphan, not reopened", async () => {
    const t = { prereservations: [{ ...draft(), status: "expired" }], settings: [], payment_orphans: [] as R[] }; const { d } = deps();
    expect(await handlePaidStripeEvent(fakeDb(t), { type: "checkout.session.completed", obj: session, eventId: "e" }, d)).toBe("orphan_recorded");
    expect(t.prereservations[0]!["status"]).toBe("expired");
    expect(t.payment_orphans[0]!["reason"]).toContain("expired");
  });
  it("(e) post-payment auto-submit finalizes once; a second submit and the webhook do not duplicate", async () => {
    const t = { prereservations: [draft()], settings: [], payment_orphans: [] as R[] }; const { d, notify } = deps(); const db = fakeDb(t);
    expect((await finalizePaidBooking(db, ID, { source: "client" }, d)).outcome).toBe("finalized"); // automatic, right after payment
    expect(t.prereservations[0]!["status"]).toBe("pending_approval"); // order received
    expect((await finalizePaidBooking(db, ID, { source: "client" }, d)).outcome).toBe("already"); // retry / double click
    expect(await handlePaidStripeEvent(db, { type: "checkout.session.completed", obj: session, eventId: "evt_late" }, d)).toBe("already_finalized");
    expect(t.prereservations.length).toBe(1);
    expect(ownerNew(notify)).toBe(1);
  });
});

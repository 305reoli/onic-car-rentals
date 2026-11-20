import { describe, expect, it, vi } from "vitest";
import { handleIdentityFailed, handleIdentityVerified, type IdentityNotifyDeps } from "./identity-notify.server";
type R = any;
const get = (r: R, k: string) => { const m = k.match(/^(\w+)->>(\w+)$/); return m ? r[m[1]!]?.[m[2]!] : r[k]; };
function fakeDb(tables: Record<string, R[]>) {
  return { from: (t: string) => {
    const f: ((r: R) => boolean)[] = []; let op = "select"; let patch: R = {}; let ret = false; let lim = Infinity;
    const run = () => {
      const rows = (tables[t] ??= []);
      if (op === "insert") { rows.push({ id: crypto.randomUUID(), ...patch }); return { data: null, error: null }; }
      const m = rows.filter((r) => f.every((p) => p(r))).slice(0, lim);
      if (op === "update") { m.forEach((r) => Object.assign(r, patch)); return { data: ret ? m.map((r) => ({ id: r.id })) : null, error: null }; }
      return { data: m, error: null };
    };
    const api: any = {
      select: () => { if (op !== "select") ret = true; return api; },
      update: (p: R) => { op = "update"; patch = p; return api; },
      insert: (p: R) => { op = "insert"; patch = p; return Promise.resolve(run()); },
      eq: (k: string, v: unknown) => { f.push((r) => get(r, k) === v); return api; },
      is: (k: string, v: unknown) => { f.push((r) => (r[k] ?? null) === v); return api; },
      gte: (k: string, v: string) => { f.push((r) => r[k] >= v); return api; },
      lte: (k: string, v: string) => { f.push((r) => r[k] <= v); return api; },
      or: (expr: string) => { const sid = expr.match(/session_id\.eq\.([^,]+)/)?.[1]; const nv = expr.includes("status.neq.verified"); f.push((r) => r.identity_verification == null || r.identity_verification.session_id === sid || (nv && r.identity_verification.status !== "verified")); return api; },
      limit: (n: number) => { lim = n; return api; },
      maybeSingle: () => Promise.resolve({ data: run().data?.[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    };
    return api;
  } };
}

const SID = "vs_1UbiV37iVPDZTRghMdrZAcX6";
const BOOKING = { id: "00000000-0000-4000-8000-000000000001", first_name: "Ana", last_name: "Exemplo", vehicle_name: "Cadillac Escalade", pickup_at: "2026-11-20T15:00:00Z", pickup_location: "Orlando base", return_at: "2026-11-23T15:00:00Z", return_location: "Orlando base", identity_verification: null };

function setup() {
  const tables: Record<string, R[]> = { prereservations: [{ ...BOOKING }], identity_verifications: [] };
  const send = vi.fn(async () => ({ sent: true }));
  let session: any = { id: SID, status: "requires_input", url: null, client_secret: null, last_error: null, last_verification_report: null, metadata: { booking_id: BOOKING.id } };
  const deps: IdentityNotifyDeps = {
    db: fakeDb(tables), mode: "sandbox", send, ownerEmail: async () => "info@oniccarrentals.com",
    retrieveSession: async () => session, retrieveReport: async () => report as never,
  };
  return { tables, send, deps, set: (s: any) => { session = { ...session, ...s }; } };
}
const mail = (send: any, i = 0) => send.mock.calls[i][0];

describe("identity failure → owner email", () => {
  it("(a) requires_input with last_error sends one failure email with code/message", async () => {
    const { send, deps, set, tables } = setup();
    set({ last_error: { code: "selfie_face_mismatch", reason: "The selfie did not match the document." } });
    expect(await handleIdentityFailed(deps, { id: SID })).toMatch(/^identity:failure_notified/);
    expect(send).toHaveBeenCalledTimes(1);
    const m = mail(send);
    expect(m.to).toBe("info@oniccarrentals.com");
    expect(m.subject).toBe("Identity verification NOT completed — Ana Exemplo — booking TESTE001");
    for (const s of ["selfie_face_mismatch", "The selfie did not match the document.", SID, "Cadillac Escalade", "still needs its identity verification completed"]) expect(m.html).toContain(s);
    expect(tables["identity_verifications"]![0]!.owner_failure_notified_at).toBeTruthy();
  });
  it("(b) canceled session sends one failure email", async () => {
    const { send, deps, set } = setup();
    set({ status: "canceled" });
    await handleIdentityFailed(deps, { id: SID });
    expect(send).toHaveBeenCalledTimes(1);
    expect(mail(send).html).toContain("canceled");
  });
  it("(c) requires_input without last_error (just created) sends nothing; plain abandon sends nothing", async () => {
    const { send, deps, set } = setup();
    expect(await handleIdentityFailed(deps, { id: SID })).toBe("identity:not_failed:requires_input");
    set({ last_error: { code: "abandoned", reason: "User exited" } });
    await handleIdentityFailed(deps, { id: SID });
    expect(send).not.toHaveBeenCalled();
  });
  it("(d) duplicate deliveries send no second email of either kind", async () => {
    const { send, deps, set } = setup();
    set({ last_error: { code: "document_expired", reason: "Expired" } });
    await handleIdentityFailed(deps, { id: SID });
    await Promise.all([handleIdentityFailed(deps, { id: SID }), handleIdentityFailed(deps, { id: SID })]);
    set({ status: "verified", last_error: null, last_verification_report: "vr_1" });
    await handleIdentityVerified(deps, { id: SID });
    await Promise.all([handleIdentityVerified(deps, { id: SID }), handleIdentityVerified(deps, { id: SID })]);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("(e) fails then verifies → exactly one failure + one verified email", async () => {
    const { send, deps, set, tables } = setup();
    set({ last_error: { code: "document_unverified_other", reason: "Unreadable" } });
    await handleIdentityFailed(deps, { id: SID });
    set({ status: "verified", last_error: null, last_verification_report: "vr_1" });
    await handleIdentityVerified(deps, { id: SID });
    await handleIdentityFailed(deps, { id: SID });
    expect(send).toHaveBeenCalledTimes(2);
    expect(mail(send, 0).subject).toMatch(/NOT completed/);
    expect(mail(send, 1).subject).toMatch(/completed — Ana/);
    const row = tables["identity_verifications"]![0]!;
    expect(row.owner_failure_notified_at && row.owner_notified_at).toBeTruthy();
    expect(row.status).toBe("verified");
  });
});
const report = { id: "vr_1", created: 1794700000, document: { type: "passport", first_name: "ANA", last_name: "EXEMPLO", number: "FX123456", issuing_country: "PT", dob: { day: 2, month: 3, year: 1990 }, expiration_date: { day: 1, month: 1, year: 2031 } } };

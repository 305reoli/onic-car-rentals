import { describe, expect, it, vi } from "vitest";
import { handleIdentityVerified, composeIdentityEmail, type IdentityNotifyDeps } from "./identity-notify.server";

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
      or: (expr: string) => { const sid = expr.split("eq.")[1]; f.push((r) => r.identity_verification == null || r.identity_verification.session_id === sid); return api; },
      limit: (n: number) => { lim = n; return api; },
      maybeSingle: () => Promise.resolve({ data: run().data?.[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    };
    return api;
  } };
}

const SID = "vs_1UbiV37iVPDZTRghMdrZAcX6";
const BOOKING = { id: "00000000-0000-4000-8000-000000000001", first_name: "Ana", last_name: "Exemplo", vehicle_name: "Cadillac Escalade", pickup_at: "2026-11-20T15:00:00Z", pickup_location: "Orlando base", return_at: "2026-11-23T15:00:00Z", return_location: "Orlando base", identity_verification: null };
const report = { id: "vr_1", created: 1794700000, document: { type: "passport", first_name: "ANA", last_name: "EXEMPLO", number: "FX123456", issuing_country: "PT", dob: { day: 2, month: 3, year: 1990 }, expiration_date: { day: 1, month: 1, year: 2031 } } };

function setup(opts: { meta?: Record<string, string>; idRow?: R | null; booking?: R }) {
  const tables: Record<string, R[]> = { prereservations: [{ ...(opts.booking ?? BOOKING) }], identity_verifications: opts.idRow ? [{ owner_notified_at: null, ...opts.idRow }] : [] };
  const send = vi.fn(async () => ({ sent: true }));
  const deps: IdentityNotifyDeps = {
    db: fakeDb(tables), mode: "sandbox", send, ownerEmail: async () => "info@oniccarrentals.com",
    retrieveSession: async () => ({ id: SID, status: "verified", url: null, client_secret: null, last_error: null, last_verification_report: "vr_1", metadata: opts.meta ?? {} }),
    retrieveReport: async () => report as never,
  };
  return { tables, send, deps };
}

describe("identity.verification_session.verified → owner email", () => {
  it("resolves via metadata booking_id (shared-link case TESTE001 / vs_1Ubi…), email has all fields, right mailbox and subject", async () => {
    const { tables, send, deps } = setup({ meta: { booking_id: "TESTE001" } });
    expect(await handleIdentityVerified(deps, { id: SID })).toBe("identity:notified(metadata.booking_id)");
    expect(send).toHaveBeenCalledTimes(1);
    const m = (send.mock.calls[0] as any)[0];
    expect(m.to).toBe("info@oniccarrentals.com");
    expect(m.subject).toBe("Identity verification completed — Ana Exemplo — booking TESTE001");
    for (const s of ["Ana Exemplo", BOOKING.id, "Cadillac Escalade", "Orlando base", "ANA", "EXEMPLO", "1990-03-02", "Passport", "FX123456", "PT", "2031-01-01", SID, new Date(1794700000 * 1000).toISOString()]) expect(m.html).toContain(s);
    // Stored for admin badge + SistemaGestao payload, flag set.
    expect(tables["prereservations"]![0]!.identity_verification).toMatchObject({ status: "verified", session_id: SID, document_number: "FX123456" });
    expect(tables["identity_verifications"]![0]!.owner_notified_at).toBeTruthy();
    expect(tables["identity_verifications"]![0]!.booking_id).toBe(BOOKING.id);
  });

  it("resolves via the stored identity check row by session ID (checkout case)", async () => {
    const { send, deps } = setup({ idRow: { id: "iv1", session_id: SID, license_country: "Portugal", booking_id: BOOKING.id } });
    expect(await handleIdentityVerified(deps, { id: SID })).toBe("identity:notified(identity_check.booking_id)");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("resolves via the booking already carrying this session", async () => {
    const { send, deps } = setup({ idRow: { id: "iv1", session_id: SID, license_country: "Portugal" }, booking: { ...BOOKING, identity_verification: { session_id: SID, status: "verified" } } });
    expect(await handleIdentityVerified(deps, { id: SID })).toBe("identity:notified(identity_check.session_id)");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("webhook delivered twice sends exactly one email", async () => {
    const { send, deps } = setup({ meta: { booking_id: BOOKING.id } });
    await handleIdentityVerified(deps, { id: SID });
    expect(await handleIdentityVerified(deps, { id: SID })).toMatch(/^identity:already_notified/);
    await Promise.all([handleIdentityVerified(deps, { id: SID }), handleIdentityVerified(deps, { id: SID })]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("no resolvable booking: no email, stores verified outputs", async () => {
    const { tables, send, deps } = setup({ meta: {} });
    expect(await handleIdentityVerified(deps, { id: SID })).toBe("identity:verified_unresolved");
    expect(send).not.toHaveBeenCalled();
    expect(tables["identity_verifications"]![0]!.status).toBe("verified");
  });

  it("send failure clears the flag so a retry can send", async () => {
    const { tables, send, deps } = setup({ meta: { booking_id: BOOKING.id } });
    send.mockRejectedValueOnce(new Error("Resend 500"));
    await expect(handleIdentityVerified(deps, { id: SID })).rejects.toThrow();
    expect(tables["identity_verifications"]![0]!.owner_notified_at).toBeNull();
    expect(await handleIdentityVerified(deps, { id: SID })).toMatch(/notified/);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("does not overwrite a booking verified under a different session", async () => {
    const { tables, deps } = setup({ meta: { booking_id: BOOKING.id }, booking: { ...BOOKING, identity_verification: { session_id: "vs_OTHER12345", status: "verified" } } });
    await handleIdentityVerified(deps, { id: SID });
    expect(tables["prereservations"]![0]!.identity_verification.session_id).toBe("vs_OTHER12345");
  });

  it("subject format", () => {
    expect(composeIdentityEmail(BOOKING, { provider: "stripe", session_id: SID, status: "verified", verified_at: null, license_country: "x", first_name: null, last_name: null, dob: null, document_number: null, document_expiry: null, document_country: null }, null).subject).toBe("Identity verification completed — Ana Exemplo — booking TESTE001");
  });
});

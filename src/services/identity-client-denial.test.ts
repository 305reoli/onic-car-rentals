import { describe, expect, it, vi } from "vitest";
import { denialCategory, handleIdentityFailed, handleIdentityVerified, type IdentityNotifyDeps } from "./identity-notify.server";
import { identityDenialText, identityText } from "@/lib/i18n";
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
    db: fakeDb(tables), mode: "sandbox", send, ownerEmail: async () => "dono@seudominio.com",
    retrieveSession: async () => session, retrieveReport: async () => report as never,
  };
  return { tables, send, deps, set: (s: any) => { session = { ...session, ...s }; } };
}
const mail = (send: any, i = 0) => send.mock.calls[i][0];


const BOOKED = { ...BOOKING, email: "ana@example.com", language: "pt", identity_verification: { provider: "stripe", session_id: SID, status: "pending", verified_at: null, license_country: "Portugal" } };
function withClient() {
  const t = setup();
  t.tables["prereservations"] = [{ ...BOOKED }];
  t.tables["identity_verifications"] = [{ id: "r1", session_id: SID, license_country: "Portugal", status: "processing", booking_id: BOOKED.id }];
  const clientSend = vi.fn(async () => ({ sent: true }));
  const createSession = vi.fn(async () => ({ id: "vs_FRESH0000000001", url: "https://verify.stripe.com/start/fresh" }));
  t.deps.client = { send: clientSend, createSession };
  return { ...t, clientSend, createSession };
}

describe("identity failure → client denial email (mocked sender)", () => {
  it("rejection with last_error sends ONE client email in the booking language with reason + fresh link + live-photo instruction", async () => {
    const { set, deps, clientSend, createSession, send, tables } = withClient();
    set({ last_error: { code: "selfie_face_mismatch", reason: "no match" } });
    await handleIdentityFailed(deps, { id: SID });
    await handleIdentityFailed(deps, { id: SID });
    expect(clientSend).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1); // owner email unchanged, once
    const m = (clientSend.mock.calls[0] as any)[0];
    expect(m.to).toBe("ana@example.com");
    expect(m.subject).toMatch(/não foi aprovada/);
    expect(m.html).toContain("A selfie não correspondeu");
    expect(m.html).toContain("https://verify.stripe.com/start/fresh");
    expect(m.html).toMatch(/nunca a foto de uma tela/);
    expect(tables["identity_verifications"]!.find((r: R) => r.session_id === "vs_FRESH0000000001")?.booking_id).toBe(BOOKED.id);
    expect(tables["prereservations"]![0]!.identity_verification.status).toBe("failed");
  });
  it("canceled sends one client email; plain requires_input without last_error sends none", async () => {
    const a = withClient(); a.set({ status: "canceled" });
    await handleIdentityFailed(a.deps, { id: SID });
    expect(a.clientSend).toHaveBeenCalledTimes(1);
    const b = withClient();
    await handleIdentityFailed(b.deps, { id: SID });
    expect(b.clientSend).not.toHaveBeenCalled();
  });
  it("reason categories map from Stripe codes", () => {
    expect(denialCategory("document_unverified_other")).toBe("photo_unclear");
    expect(denialCategory("document_type_not_supported")).toBe("type_not_accepted");
    expect(denialCategory("selfie_manipulated")).toBe("selfie_mismatch");
    expect(denialCategory("document_expired")).toBe("expired");
  });
  it("later verified webhook replaces the PENDING booking identity", async () => {
    const { set, deps, tables } = withClient();
    set({ status: "verified", last_verification_report: "vr_1" });
    await handleIdentityVerified(deps, { id: SID });
    expect(tables["prereservations"]![0]!.identity_verification.status).toBe("verified");
  });
  it("denial texts exist in EN/PT/ES with identical keys", () => {
    const k = (o: object) => JSON.stringify(Object.keys(o).sort());
    for (const l of ["pt", "es"] as const) { expect(k(identityDenialText[l])).toBe(k(identityDenialText.en)); expect(k(identityDenialText[l].reasons)).toBe(k(identityDenialText.en.reasons)); }
    for (const l of ["en", "pt", "es"] as const) expect(identityText[l].submitted.length).toBeGreaterThan(10);
  });
});
const report = { id: "vr_1", created: 1794700000, document: { type: "passport", first_name: "ANA", last_name: "EXEMPLO", number: "FX123456", issuing_country: "PT", dob: { day: 2, month: 3, year: 1990 }, expiration_date: { day: 1, month: 1, year: 2031 } } };

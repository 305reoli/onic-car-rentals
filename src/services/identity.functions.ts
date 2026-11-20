// Stripe Identity for non-Brazil licences. All Stripe calls go through the managed gateway in stripe.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { docMode, identityFromReport } from "@/lib/identity";

const toClient = (status: string, lastError: unknown) => status === "verified" ? "verified" : status === "processing" ? "processing" : status === "canceled" ? "canceled" : lastError ? "needs_attention" : "pending";

/** Starts a fresh VerificationSession (document + matching selfie). Returns the hosted URL and a private reference. */
export const startIdentity = createServerFn({ method: "POST" })
  .inputValidator((d: { licenseCountry: string; lang: "en" | "pt" | "es" }) => z.object({ licenseCountry: z.string().trim().min(2).max(80), lang: z.enum(["en", "pt", "es"]) }).parse(d))
  .handler(async ({ data }) => {
    if (docMode(data.licenseCountry) === "brazil") throw new Error("NOT_REQUIRED");
    const s = await import("./stripe.server");
    if (!s.stripeConnected()) return { error: "IDENTITY_UNAVAILABLE" as const };
    const origin = new URL(getRequest().url).origin;
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    try {
      const idem = crypto.randomUUID();
      const vs = await s.createVerificationSession({ returnUrl: `${origin}/api/public/identity-return?lang=${data.lang}`, meta: { source: "checkout", license_country: data.licenseCountry.slice(0, 80) }, idem });
      const { data: row, error } = await db.from("identity_verifications").insert({ session_id: vs.id, license_country: data.licenseCountry, mode: s.stripeMode(), status: vs.status }).select("client_ref").single();
      if (error || !row) throw new Error("save failed");
      return { sessionId: vs.id, ref: row.client_ref as string, url: vs.url, status: toClient(vs.status, vs.last_error) };
    } catch (e) {
      console.error("[identity] start failed", e instanceof Error ? e.message : e);
      return { error: "IDENTITY_UNAVAILABLE" as const };
    }
  });

/** Reads live status; on "verified" fetches the verified outputs server-side and stores them once. */
export const checkIdentity = createServerFn({ method: "POST" })
  .inputValidator((d: { sessionId: string; ref: string }) => z.object({ sessionId: z.string().regex(/^vs_[A-Za-z0-9]{8,80}$/), ref: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: row } = await db.from("identity_verifications").select("*").eq("session_id", data.sessionId).eq("client_ref", data.ref).maybeSingle();
    if (!row) throw new Error("NOT_FOUND");
    if (row.status === "verified" && row.outputs) return { status: "verified" as const, url: null };
    const s = await import("./stripe.server");
    try {
      const vs = await s.retrieveVerificationSession(data.sessionId);
      if (vs.status === "verified" && vs.last_verification_report) {
        const report = await s.retrieveVerificationReport(vs.last_verification_report);
        const verifiedAt = new Date((report.created ?? Date.now() / 1000) * 1000).toISOString();
        const outputs = identityFromReport({ sessionId: vs.id, licenseCountry: row.license_country, verifiedAt, report });
        await db.from("identity_verifications").update({ status: "verified", verified_at: verifiedAt, outputs, updated_at: new Date().toISOString() }).eq("id", row.id);
        return { status: "verified" as const, url: null };
      }
      await db.from("identity_verifications").update({ status: vs.status, updated_at: new Date().toISOString() }).eq("id", row.id);
      return { status: toClient(vs.status, vs.last_error), url: vs.status === "requires_input" ? vs.url : null };
    } catch (e) {
      console.error("[identity] check failed", e instanceof Error ? e.message : e);
      return { status: "pending" as const, url: null };
    }
  });

/** Server-only: verified record for attaching to a booking (proof = session id + private reference). */
export async function loadVerifiedIdentity(db: { from: (t: string) => any }, sessionId: string, ref: string) {
  const { data: row } = await db.from("identity_verifications").select("status, outputs").eq("session_id", sessionId).eq("client_ref", ref).maybeSingle();
  return row?.status === "verified" && row.outputs ? row.outputs : null;
}

/** Server-only: identity to store on a booking. Verified → outputs; submitted but unresolved → PENDING; rejected after a
 *  submission → FAILED (booking continues, admin sees it). Never-submitted sessions return null (checkout still requires it). */
export async function loadAttachableIdentity(db: { from: (t: string) => any }, sessionId: string, ref: string): Promise<{ identity: unknown; outcome: "verified" | "pending" | "failed" } | null> {
  const { data: row } = await db.from("identity_verifications").select("id, status, outputs, license_country").eq("session_id", sessionId).eq("client_ref", ref).maybeSingle();
  if (!row) return null;
  if (row.status === "verified" && row.outputs) return { identity: row.outputs, outcome: "verified" };
  const base = { provider: "stripe" as const, session_id: sessionId, verified_at: null, license_country: row.license_country as string };
  try {
    const s = await import("./stripe.server");
    const vs = await s.retrieveVerificationSession(sessionId);
    if (vs.status === "verified" && vs.last_verification_report) {
      const report = await s.retrieveVerificationReport(vs.last_verification_report);
      const verifiedAt = new Date((report.created ?? Date.now() / 1000) * 1000).toISOString();
      const outputs = identityFromReport({ sessionId, licenseCountry: row.license_country, verifiedAt, report });
      await db.from("identity_verifications").update({ status: "verified", verified_at: verifiedAt, outputs, updated_at: new Date().toISOString() }).eq("id", row.id);
      return { identity: outputs, outcome: "verified" };
    }
    if (vs.status === "processing") return { identity: { ...base, status: "pending" }, outcome: "pending" };
    const { failedOutcome } = await import("./identity-notify.server");
    const f = failedOutcome(vs);
    if (f) return { identity: { ...base, status: "failed", failure_code: f.code }, outcome: "failed" };
    return null;
  } catch (e) {
    // Stripe unreachable: the client already saw a submitted status; keep the booking moving as PENDING (webhook resolves it).
    console.error("[identity] attach status read failed", e instanceof Error ? e.message : e);
    return ["processing", "requires_input"].includes(row.status) ? { identity: { ...base, status: "pending" }, outcome: "pending" } : null;
  }
}

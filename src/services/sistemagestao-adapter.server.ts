// SistemaGestao integration: only sendConfirmed is live (site → SistemaGestao booking intake).
import { BLOCKED_BOOKING_ID, buildIntakePayload, postIntake, type SendResult } from "./sistemagestao-payload";
import { identityVerified } from "@/lib/identity";
import { readAdditionalDriver, readIntakeDocuments } from "./sistemagestao-documents.server";
export const SISTEMAGESTAO_TEST_INTAKE_URL = "https://project--aabe2901-94c2-46e5-8018-bfc88a62d9b8-dev.lovable.app/api/public/site-booking-intake";
// Availability currently comes from this site's own pre-reservations + each car's manual blocked dates.

export const SISTEMAGESTAO_INTEGRATION_ENABLED = false;

type Result<T> = { enabled: false; reason: "disabled" } | { enabled: true; data: T };
const disabled = { enabled: false, reason: "disabled" } as const;

export async function checkAvailability(_vehicleId: string, _from: Date, _to: Date): Promise<Result<boolean>> {
  return disabled;
}
export async function createHold(_prereservationId: string): Promise<Result<string>> {
  return disabled;
}
export async function releaseHold(_prereservationId: string): Promise<Result<true>> {
  return disabled;
}
/** Hands an approved booking to SistemaGestao (live). Same booking_id on every retry so the endpoint dedupes. */
export async function sendConfirmed(prereservationId: string, previewTest = false): Promise<SendResult & { sentDocumentKinds?: string[] }> {
  if (prereservationId === BLOCKED_BOOKING_ID) return { ok: false, error: "blocked: booking already processed manually in SistemaGestao" };
  const secret = process.env["SISTEMAGESTAO_INTAKE_SECRET"];
  if (!secret) return { ok: false, error: "SISTEMAGESTAO_INTAKE_SECRET not configured" };
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: b } = await db.from("prereservations").select("*").eq("id", prereservationId).maybeSingle();
  if (!b) return { ok: false, error: "booking not found" };
  if (!["approved", "confirmed"].includes(b.status)) return { ok: false, error: "Only approved/confirmed bookings can be sent" };
  if (previewTest && !b.is_test) return { ok: false, error: "Preview intake requires a test booking" };
  const { data: v } = b.vehicle_id ? await db.from("vehicles").select("slug, city, security_deposit_usd").eq("id", b.vehicle_id).maybeSingle() : { data: null };
  let payload;
  try {
    payload = buildIntakePayload(b as never, v as never);
    // A known successful hand-off is only a duplicate-status query; do not retransmit private files.
    if (!b.sistemagestao_rental_id) {
      const download = async (path: string) => {
        const { data, error } = await db.storage.from("customer-documents").download(path);
        if (error || !data) throw new Error("Private document download failed");
        return data;
      };
      const counter = { total: 0 }; // 25 MiB combined across both drivers
      payload.documents = await readIntakeDocuments(b.documents, download, counter);
      // Stripe-verified clients: the verified reference replaces loose main-driver licence images (passport still travels).
      if (identityVerified((b as { identity_verification?: unknown }).identity_verification)) payload.documents = payload.documents.filter(d => d.kind !== "license_front" && d.kind !== "license_back");
      const additional = await readAdditionalDriver(b.documents, download, counter);
      if (additional) (payload as typeof payload & { additional_driver?: typeof additional }).additional_driver = additional;
    }
  } catch (e) { return { ok: false, error: `payload ${e instanceof Error ? e.message : String(e)}` }; }
  // Kinds only (no file data) are returned so the private send log proves what was actually sent.
  const sentDocumentKinds = [...payload.documents.map(d => d.kind), ...((payload as { additional_driver?: { documents: { kind: string }[] } }).additional_driver?.documents.map(d => `additional_driver.${d.kind}`) ?? [])];
  const res = await postIntake(payload, secret, fetch, previewTest ? SISTEMAGESTAO_TEST_INTAKE_URL : process.env["SISTEMAGESTAO_INTAKE_URL"]);
  return { ...res, sentDocumentKinds };
}

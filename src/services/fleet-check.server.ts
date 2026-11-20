// Fleet comparison responder + daily divergence check (SistemaGestao v2 contract). Read-only: never auto-corrects.
import { z } from "zod";
import { findDivergences, threePartAvailability, validFleetSecret, FLEET_AUTH_HEADER, type CompareVehicle, type Divergence } from "./fleet-sync";
import { insuranceDeductible } from "@/lib/vehicles";
import type { supabaseAdmin } from "@/integrations/supabase/client.server";

type DB = typeof supabaseAdmin;
/** Other side for the check. Stable SistemaGestao preview until owner switches it at publish (server-only override). */
export const RC_COMPARE_DEFAULT = "https://project--aabe2901-94c2-46e5-8018-bfc88a62d9b8-dev.lovable.app/api/public/fleet-sync/compare";
const uuid = z.string().uuid();
export const compareBody = z.object({ schema_version: z.literal(2), vehicle_ids: z.array(z.string().max(100)).max(500) });

/** Site-side values for the six rule fields + local availability. No customer or booking details. */
export async function siteCompare(db: DB, ids: string[]): Promise<CompareVehicle[]> {
  const valid = ids.filter(i => uuid.safeParse(i).success);
  const { data, error } = valid.length ? await db.from("vehicles").select("id,name,body_category,daily_price_usd,security_deposit_usd,insurance_deductible_usd,min_days,min_age").in("id", valid) : { data: [], error: null };
  if (error) throw new Error("compare read failed");
  const rows = new Map((data ?? []).map(v => [v.id, v]));
  return Promise.all(ids.map(async (id) => {
    const v = rows.get(id);
    if (!v) return { vehicle_id: id, exists: false };
    const { data: availability } = await db.rpc("site_vehicle_availability", { vid: id });
    let rem: { available: boolean; reason: string | null; ranges: unknown } | null = null;
    try { rem = (await db.from("fleet_sync_remote_availability").select("available,reason,ranges").eq("site_vehicle_id", id).maybeSingle()).data; } catch { rem = null; }
    return { vehicle_id: id, exists: true, daily_price: v.daily_price_usd == null ? null : Number(v.daily_price_usd), security_deposit: v.security_deposit_usd == null ? null : Number(v.security_deposit_usd),
      deductible: insuranceDeductible({ name: v.name, body_category: v.body_category, insurance_deductible_usd: v.insurance_deductible_usd == null ? null : Number(v.insurance_deductible_usd) }),
      minimum_days: v.min_days, minimum_age: v.min_age, category: v.body_category,
      ...threePartAvailability((availability as CompareVehicle["availability"]) ?? null, rem ? { available: !!rem.available, reason: rem.reason, ranges: (rem.ranges as unknown[]) ?? [] } : null) };
  }));
}

export async function respondCompare(request: Request, secret: string | undefined, loadDb: () => Promise<DB>) {
  if (!await validFleetSecret(request.headers.get(FLEET_AUTH_HEADER), secret)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  let body;
  try { body = compareBody.parse(JSON.parse(await request.text())); } catch { return Response.json({ ok: false, error: "invalid_payload" }, { status: 400 }); }
  try {
    const vehicles = await siteCompare(await loadDb(), body.vehicle_ids);
    return Response.json({ ok: true, schema_version: 2, observed_at: new Date().toISOString(), vehicles });
  } catch { return Response.json({ ok: false, error: "compare unavailable" }, { status: 503 }); }
}

export type CheckDeps = {
  db: DB;
  fetchRemote: (ids: string[]) => Promise<CompareVehicle[] | null>;
  sendOwner: (subject: string, lines: string[], key: string) => Promise<{ sent: boolean; detail: string }>;
  log: (row: { kind: string; status: string; detail: string; recipient: string; channel: string }) => Promise<void>;
};
export function divergenceEmail(d: Divergence[], unverified: string[]) {
  const lines = d.map(x => `Site ${x.site_vehicle_id} ↔ SistemaGestao ${x.sistemagestao_vehicle_id} — ${x.field}: site ${JSON.stringify(x.site)} / SistemaGestao ${JSON.stringify(x.sistemagestao)}`);
  if (unverified.length) lines.push(`Not verified (SistemaGestao returned no row): ${unverified.join(", ")}`);
  lines.push("No values were changed automatically. Review each car and correct the side that is wrong.");
  return { subject: `Fleet sync: ${d.length} divergence${d.length === 1 ? "" : "s"} between site and SistemaGestao`, lines };
}
export async function runFleetCheck(deps: CheckDeps, dryRun: boolean) {
  const { data: links, error } = await deps.db.from("fleet_sync_links").select("origin_vehicle_id,site_vehicle_id").eq("origin_system", "sistemagestao").eq("active", true);
  if (error) throw new Error("links unavailable");
  const pairs = (links ?? []).map(l => ({ site_vehicle_id: l.site_vehicle_id, sistemagestao_vehicle_id: l.origin_vehicle_id }));
  const [site, remote] = await Promise.all([siteCompare(deps.db, pairs.map(p => p.site_vehicle_id)), pairs.length ? deps.fetchRemote(pairs.map(p => p.sistemagestao_vehicle_id)) : Promise.resolve([])]);
  if (remote == null) return { ok: false, dry_run: dryRun, error: "sistemagestao_compare_unavailable", compared: 0, divergences: [], unverified: pairs.map(p => p.sistemagestao_vehicle_id) };
  const { divergences, unverified } = findDivergences(pairs, site, remote);
  const summary = { ok: true, dry_run: dryRun, compared: pairs.length - unverified.length, mapped: pairs.length, divergences, unverified, emailed: false };
  if (dryRun) return summary;
  if (divergences.length) {
    const mail = divergenceEmail(divergences, unverified);
    const r = await deps.sendOwner(mail.subject, mail.lines, `fleet-divergence-${new Date().toISOString().slice(0, 10)}`);
    await deps.log({ kind: "owner_fleet_divergence", channel: "email", status: r.sent ? "sent" : "failed", detail: `${divergences.length} divergences; ${r.detail}`, recipient: "owner" });
    return { ...summary, emailed: r.sent };
  }
  await deps.log({ kind: "fleet_check_clean", channel: "log", status: "clean", detail: `Clean run: ${summary.compared} compared, ${unverified.length} unverified`, recipient: "(none)" });
  return summary;
}

/** Production deps: SistemaGestao compare via shared secret, owner alert through the existing Resend sender + notification_log. */
export async function liveCheckDeps(db: DB): Promise<CheckDeps> {
  const secret = process.env["SISTEMAGESTAO_INTAKE_SECRET"];
  const target = process.env["SISTEMAGESTAO_FLEET_COMPARE_URL"]?.trim() || RC_COMPARE_DEFAULT;
  return {
    db,
    fetchRemote: async (ids) => {
      try {
        const res = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json", [FLEET_AUTH_HEADER]: secret ?? "" }, body: JSON.stringify({ schema_version: 2, vehicle_ids: ids }), signal: AbortSignal.timeout(15000), redirect: "manual" });
        const body = await res.json().catch(() => null) as { ok?: boolean; vehicles?: CompareVehicle[] } | null;
        return res.ok && body?.ok ? body.vehicles ?? [] : null;
      } catch { return null; }
    },
    sendOwner: async (subject, lines, key) => {
      const { emailConfigured, sendResendEmail } = await import("./resend-email.server");
      const { bookingNotificationEmail } = await import("@/lib/bookingEmail");
      const { emailHtml } = await import("@/lib/emailLayout");
      const { SITE_URL } = await import("./notify.server");
      const { data: st } = await db.from("settings").select("owner_notification_email").eq("id", 1).maybeSingle();
      const to = bookingNotificationEmail(st?.owner_notification_email);
      if (!emailConfigured() || !to) return { sent: false, detail: "Resend connection or recipient missing" };
      try { const r = await sendResendEmail({ to, subject, html: emailHtml({ siteUrl: SITE_URL(), lang: "en", subject, lines, link: "/admin" }), idempotencyKey: key }); return { sent: true, detail: `Resend id=${r.id}` }; }
      catch (e) { return { sent: false, detail: e instanceof Error ? e.message : String(e) }; }
    },
    log: async (row) => { await db.from("notification_log").insert({ ...row, prereservation_id: null }); },
  };
}

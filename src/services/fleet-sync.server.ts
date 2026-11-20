import { lifecycleStillValid, copyFleetPhotos, fleetEnvelopeSchema, fleetV2Schema, inboundVehicle, outboundEnvelope, wireRulesEnvelope, payloadHash, postFleetEvent, rulesPatch, validFleetSecret, FLEET_AUTH_HEADER, type FleetV2 } from "./fleet-sync";
import type { supabaseAdmin } from "@/integrations/supabase/client.server";

type DB = typeof supabaseAdmin;
export async function receiveFleetEvent(request: Request, secret: string | undefined, loadDb: () => Promise<DB>) {
  if (!await validFleetSecret(request.headers.get(FLEET_AUTH_HEADER), secret)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  let envelope, mapped;
  try {
    if (Number(request.headers.get("content-length")) > 300000) throw new Error("too large");
    const raw = await request.text();
    if (raw.length > 300000) throw new Error("too large");
    const json = JSON.parse(raw);
    if (json?.schema_version === 2) return receiveV2(fleetV2Schema.parse(json), json, loadDb);
    envelope = fleetEnvelopeSchema.parse(json);
    mapped = inboundVehicle(envelope.snapshot);
  } catch {
    return Response.json({ ok: false, error: "Malformed fleet envelope or unsupported category" }, { status: 400 });
  }
  try {
    const db = await loadDb();
    // Site-owned cars keep site lifecycle: v1 SistemaGestao snapshots never overwrite them (v2 rules/availability still apply).
    const { data: link } = await db.from("fleet_sync_links").select("provenance").eq("origin_system", "sistemagestao").eq("origin_vehicle_id", envelope.origin_vehicle_id).maybeSingle();
    if (link?.provenance === "site") return Response.json({ ok: true, duplicate: false, warnings: ["site_origin_v1_ignored"], action: "ignored" });
    if (mapped.vehicle.photos.length && !envelope.event_type.endsWith("archived") && !envelope.event_type.endsWith("deleted")) {
      const copied = await copyFleetPhotos(mapped.vehicle.photos, mapped.vehicle.slug, envelope.origin_vehicle_id, async (path, body, type) =>
        !(await db.storage.from("vehicle-photos").upload(path, body, { contentType: type, upsert: true })).error);
      mapped.vehicle.photos = copied.photos;
      if (copied.failed) mapped.flags.push("photo_copy_failed");
    }
    const { data, error } = await db.rpc("apply_sistemagestao_fleet_event", { e: envelope, p: mapped.vehicle, flags: mapped.flags });
    if (error) {
      if (error.message.includes("vehicle_not_mapped")) return Response.json({ ok: false, error: "vehicle_not_mapped" }, { status: 422 });
      throw new Error("fleet persistence failed");
    }
    return Response.json({ ...(data as object), duplicate: (data as { action?: string })?.action === "duplicate_ignored", warnings: [] });
  } catch {
    console.error("fleet sync inbound persistence failed");
    return Response.json({ ok: false, error: "fleet persistence failed; retry event" }, { status: 503 });
  }
}

async function receiveV2(ev: FleetV2, raw: unknown, loadDb: () => Promise<DB>) {
  try {
    const db = await loadDb();
    const { patch, warnings } = ev.event_type === "vehicle.updated" ? rulesPatch(ev) : { patch: {}, warnings: [] as string[] };
    const avail = ev.event_type === "vehicle.availability_changed" ? ev.availability : null;
    if (ev.site_vehicle_id && ev.event_type === "vehicle.availability_changed") {
      const mismatch = await pairingMismatch(db, ev.origin_vehicle_id, ev.site_vehicle_id);
      if (mismatch) return Response.json({ ok: false, error: "pairing_mismatch", message: `Pairing mismatch: SistemaGestao named site listing ${ev.site_vehicle_id}, but this site has SistemaGestao vehicle ${ev.origin_vehicle_id} paired to listing ${mismatch}. Update refused; nothing was changed.`, sistemagestao_vehicle_id: ev.origin_vehicle_id, named_site_vehicle_id: ev.site_vehicle_id, stored_site_vehicle_id: mismatch }, { status: 409 });
    }
    if (ev.site_vehicle_id) await learnInboundLink(db, ev.origin_vehicle_id, ev.site_vehicle_id);
    const { data, error } = await db.rpc("apply_sistemagestao_fleet_v2", { e: ev as never, hash: await payloadHash(raw), patch: patch as never, avail: avail as never });
    if (error) {
      if (error.message.includes("vehicle_not_mapped")) return Response.json({ ok: false, error: "vehicle_not_mapped" }, { status: 422 });
      throw new Error("fleet persistence failed");
    }
    const r = data as { ok: boolean; error?: string; duplicate?: boolean; site_vehicle_id?: string; action?: string };
    if (!r.ok) return Response.json({ ok: false, error: r.error ?? "conflict" }, { status: 409 });
    const w = r.duplicate ? [] : r.action === "stale_ignored" ? ["stale_revision_ignored"] : warnings;
    return Response.json({ ok: true, schema_version: 2, duplicate: !!r.duplicate, warnings: w, site_vehicle_id: r.site_vehicle_id, action: r.action });
  } catch {
    console.error("fleet sync v2 inbound persistence failed");
    return Response.json({ ok: false, error: "fleet persistence failed; retry event" }, { status: 503 });
  }
}

/** Returns the stored listing when SistemaGestao's named listing differs from the stored pairing for that car (never re-pairs). */
async function pairingMismatch(db: DB, rcId: string, siteId: string): Promise<string | null> {
  const { data, error } = await db.from("fleet_sync_links").select("site_vehicle_id").eq("origin_system", "sistemagestao").eq("origin_vehicle_id", rcId).maybeSingle();
  if (error) throw new Error("pairing lookup failed");
  return data && data.site_vehicle_id !== siteId ? data.site_vehicle_id : null;
}

/** Links an unlinked SistemaGestao unit to the site car SistemaGestao names, only when neither side is already linked and the car exists. */
async function learnInboundLink(db: DB, rcId: string, siteId: string) {
  const [{ data: byRc }, { data: bySite }, { data: car }] = await Promise.all([
    db.from("fleet_sync_links").select("site_vehicle_id").eq("origin_system", "sistemagestao").eq("origin_vehicle_id", rcId).maybeSingle(),
    db.from("fleet_sync_links").select("origin_vehicle_id").eq("site_vehicle_id", siteId).limit(1).maybeSingle(),
    db.from("vehicles").select("id").eq("id", siteId).maybeSingle(),
  ]);
  if (byRc || bySite || !car) return;
  const { error } = await db.from("fleet_sync_links").insert({ origin_system: "sistemagestao", origin_vehicle_id: rcId, site_vehicle_id: siteId, source_revision: 0, provenance: "site", reason: "learned_from_inbound" });
  if (error && !error.message.includes("duplicate")) console.error("fleet inbound link learn failed");
}

/** Site's effective rule values for blanks (same helpers the booking flow uses). */
async function wireDefaults(db: DB, vehicleId: string) {
  const [{ data: v }, { data: st }] = await Promise.all([
    db.from("vehicles").select("name,body_category,insurance_deductible_usd,min_days,min_age").eq("id", vehicleId).maybeSingle(),
    db.from("settings").select("min_days_by_category").eq("id", 1).maybeSingle(),
  ]);
  const { insuranceDeductible } = await import("@/lib/vehicles");
  const { effectiveMinDays } = await import("@/lib/pricing");
  const car = { name: v?.name ?? "", body_category: v?.body_category ?? "suv", insurance_deductible_usd: v?.insurance_deductible_usd ?? null, min_days: v?.min_days ?? null };
  return { deductible: insuranceDeductible(car), minimumDays: effectiveMinDays(car, st?.min_days_by_category).n, minimumAge: v?.min_age ?? 25 };
}

export async function flushFleetEvents(db: DB, vehicleId: string | null = null, targetOverride?: string) {
  // Never throws into the admin vehicle save; the database trigger has already queued the event atomically.
  try {
    // Production is the default; an explicit server-only override remains supported.
    const target = targetOverride || process.env["SISTEMAGESTAO_FLEET_INTAKE_URL"]?.trim() || "https://seu-sistema.com/api/public/fleet-sync";
    const { data: events, error } = await db.rpc("claim_site_fleet_events", { v_id: vehicleId as never });
    if (error) throw new Error("queue unavailable");
    let sent = 0;
    for (const event of [...(events ?? [])].sort((a, b) => a.source_revision - b.source_revision)) {
      if (event.event_type === "vehicle.deleted" || event.event_type === "vehicle.archived") {
        const { data: row, error: rowError } = await db.from("vehicles").select("active").eq("id", event.vehicle_id).maybeSingle();
        if (rowError) continue; // cannot verify: leave claimed event for retry, never send blind
        if (!lifecycleStillValid(event.event_type, row)) {
          await db.from("fleet_sync_outbox").update({ status: "skipped", last_error: "local delete/archive not verified at send time; SistemaGestao left untouched", sent_at: null }).eq("event_id", event.event_id);
          continue;
        }
      }
      const envelope = event.schema_version === 2 && event.event_type === "vehicle.updated" ? wireRulesEnvelope(outboundEnvelope(event), await wireDefaults(db, event.vehicle_id)) : outboundEnvelope(event);
      if (!envelope) {
        await db.from("fleet_sync_outbox").update({ status: "skipped", last_error: "only blank values changed; SistemaGestao v2 cannot receive a cleared value", sent_at: null }).eq("event_id", event.event_id);
        continue;
      }
      const result = await postFleetEvent(target, process.env["SISTEMAGESTAO_INTAKE_SECRET"], envelope);
      // Learn the SistemaGestao counterpart ID from its receipt so inbound v2 events and the divergence check can resolve site-owned cars.
      const rcId = result.ok ? (result.body as { sistemagestao_vehicle_id?: unknown } | undefined)?.sistemagestao_vehicle_id : undefined;
      if (typeof rcId === "string" && rcId) await db.from("fleet_sync_links").upsert({ origin_system: "sistemagestao", origin_vehicle_id: rcId, site_vehicle_id: event.vehicle_id, source_revision: 0, provenance: "site" }, { onConflict: "origin_system,origin_vehicle_id", ignoreDuplicates: true }).then(({ error: e }) => { if (e && !e.message.includes("duplicate")) console.error("fleet link learn failed"); });
      const { error: writeError } = await db.from("fleet_sync_outbox").update({ status: result.status, last_error: result.error, http_status: result.httpStatus, next_attempt_at: new Date(Date.now() + 120000).toISOString(), sent_at: result.ok ? new Date().toISOString() : null }).eq("event_id", event.event_id);
      if (writeError) console.error("fleet sync receipt persistence failed; event remains retryable");
      if (result.ok) sent++; else console.error(result.error);
    }
    return { ok: true, queued: true, sent };
  } catch {
    console.error("fleet sync flush failed; queued events remain retryable");
    return { ok: true, queued: true, sent: 0 };
  }
}
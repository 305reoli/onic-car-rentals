import { z } from "zod";

export const FLEET_AUTH_HEADER = "x-site-booking-secret";
export const FLEET_TARGET_CONFIG = "SISTEMAGESTAO_FLEET_INTAKE_URL";
export const fleetSnapshotSchema = z.object({
  name: z.string().trim().min(1).max(200), brand: z.string().max(100), model: z.string().max(150),
  year: z.number().int().nullable().optional(), color: z.string().max(150).nullable().optional(),
  category: z.string().min(1).max(100), daily_price: z.number().finite().nonnegative().nullable().optional(),
  security_deposit: z.number().finite().nonnegative().nullable().optional(),
  deductible: z.number().finite().nonnegative().nullable().optional(),
  photos: z.array(z.string().url().max(2048).refine(p => p.startsWith("https://"), "Public HTTPS photos required")).max(100),
  base_city: z.enum(["miami", "orlando"]).nullable().optional(), status: z.enum(["active", "inactive", "archived", "deleted"]),
});
export const fleetEnvelopeSchema = z.object({
  event_id: z.string().min(1).max(200),
  event_type: z.enum(["vehicle.created", "vehicle.updated", "vehicle.archived", "vehicle.deleted"]),
  origin_system: z.literal("sistemagestao"), origin_vehicle_id: z.string().min(1).max(200),
  source_revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  occurred_at: z.string().datetime({ offset: true }), snapshot: fleetSnapshotSchema,
});
export type FleetEnvelope = z.infer<typeof fleetEnvelopeSchema>;
export const categoryDefaults = {
  exotics: { rate: 799, deposit: 750, tier: "exotic" }, luxury: { rate: 299, deposit: 300, tier: "luxury_suv" },
  sports: { rate: 159, deposit: 250, tier: "sport" }, suv: { rate: 99, deposit: 150, tier: "family" },
  sedan: { rate: 55, deposit: 150, tier: "economy" },
} as const;
export function fleetCategory(raw: string): keyof typeof categoryDefaults {
  const c = raw.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (c === "luxury") return "luxury";
  if (["suv", "suv full size", "suv mid", "minivan", "van", "economy"].includes(c)) return "suv";
  if (["sedan", "sedan full", "sedan economy"].includes(c)) return "sedan";
  if (["esportivos", "sports", "sport"].includes(c)) return "sports";
  if (["exotics", "exotic"].includes(c)) return "exotics";
  if (c === "esportivo conversivel - exotic") return "exotics";
  throw new Error("unsupported_category");
}
export function inboundVehicle(snapshot: FleetEnvelope["snapshot"]) {
  const category = fleetCategory(snapshot.category);
  const defaults = categoryDefaults[category];
  const flags: string[] = [];
  if (!snapshot.base_city) flags.push("base_city_defaulted_to_orlando");
  if (snapshot.category.trim().toLowerCase() === "economy") flags.push("economy_mapped_to_suv");
  if (snapshot.daily_price == null) flags.push("category_rate_default_used");
  const depositMissing = snapshot.security_deposit == null || snapshot.security_deposit <= 0;
  if (depositMissing) flags.push("category_deposit_default_used");
  const city = snapshot.base_city ?? "orlando";
  const notes: string[] = [];
  if (!snapshot.base_city) notes.push("Base city Orlando is PROVISIONAL (not sent by SistemaGestao) — confirm before publishing.");
  if (depositMissing) notes.push(`Deposit $${defaults.deposit} = ${category.toUpperCase()} default (SistemaGestao sent ${snapshot.security_deposit == null ? "none" : "$0"}).`);
  const slug = snapshot.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "vehicle";
  const colors: Record<string, string> = { black: "BLK", white: "WHT", blue: "BLU", red: "RED", silver: "SLV", gray: "GRY", grey: "GRY", brown: "BRN" };
  const prefix = { suv: "SUV", sedan: "SED", luxury: "LUX", sports: "SPT", exotics: "EXO" }[category];
  return { flags, vehicle: {
    name: snapshot.name, brand: snapshot.brand, model: snapshot.model, color: snapshot.color ?? "", city,
    body_category: category, category: defaults.tier, daily_price_usd: snapshot.daily_price ?? defaults.rate,
    security_deposit_usd: depositMissing ? defaults.deposit : snapshot.security_deposit, active: snapshot.status === "active",
    photos: snapshot.photos, slug, admin_note: notes.join(" "), link_reason: snapshot.base_city ? null : "base_city_orlando_provisional",
    internal_label: `${prefix}-${city === "miami" ? "MIA" : "ORL"}-${colors[(snapshot.color ?? "").toLowerCase()] ?? "UNK"}`,
  } };
}

export async function validFleetSecret(supplied: string | null, expected: string | undefined) {
  if (!supplied || !expected) return false;
  const encode = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", encode.encode(supplied)), crypto.subtle.digest("SHA-256", encode.encode(expected))]);
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/** SistemaGestao 409 reasons that are permanent for a given event_id (owner action needed on SistemaGestao). */
export const TERMINAL_409 = ["mapping_not_found", "owner_review_required", "event_id_conflict", "revision_conflict", "tombstoned", "mapping_inactive"];

export async function postFleetEvent(target: string | undefined, secret: string | undefined, envelope: unknown, fetcher: typeof fetch = fetch) {
  if (!target) return { ok: false, status: "pending", error: "fleet sync target not configured", httpStatus: null };
  if (!secret) return { ok: false, status: "failed", error: "fleet sync secret not configured", httpStatus: null };
  try {
    const url = new URL(target);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid target");
    const res = await fetcher(url.href, { method: "POST", headers: { "Content-Type": "application/json", [FLEET_AUTH_HEADER]: secret }, body: JSON.stringify(envelope), signal: AbortSignal.timeout(10000), redirect: "manual" });
    const body = await res.json().catch(() => null);
    if (res.status === 422 && body?.error === "vehicle_not_mapped") return { ok: false, status: "unmapped", error: "vehicle_not_mapped (HTTP 422)", httpStatus: 422, body };
    // A 400 malformed-payload rejection never succeeds on retry; stop instead of resending every two minutes (401/422/429 stay retryable).
    if (res.status === 400) return { ok: false, status: "rejected", error: `fleet sync rejected (HTTP ${res.status})`, httpStatus: res.status, body };
    const reason = typeof body?.error === "string" ? String(body.error).slice(0, 100) : null;
    // SistemaGestao stores the first 409 response per event_id and replays it on every retry, so these never succeed by resending.
    if (res.status === 409 && reason && TERMINAL_409.includes(reason)) return { ok: false, status: "rejected", error: `fleet sync rejected (HTTP 409: ${reason})`, httpStatus: 409, body };
    if (!res.ok || body?.ok !== true) return { ok: false, status: "failed", error: `fleet sync rejected (HTTP ${res.status}${reason ? `: ${reason}` : ""})`, httpStatus: res.status, body };
    return { ok: true, status: "sent", error: null, httpStatus: res.status, body: body as { sistemagestao_vehicle_id?: string; duplicate?: boolean } };
  } catch {
    return { ok: false, status: "failed", error: "fleet sync transport failed", httpStatus: null };
  }
}
/** Copies incoming SistemaGestao photos into the site's own photo storage so records never depend on expiring signed links. */
export async function copyFleetPhotos(urls: string[], slug: string, originId: string, store: (path: string, body: ArrayBuffer, type: string) => Promise<boolean>, fetcher: typeof fetch = fetch) {
  const out: string[] = []; let failed = 0;
  for (const url of urls) {
    try {
      const res = await fetcher(url, { signal: AbortSignal.timeout(20000), redirect: "follow" });
      const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
      if (!res.ok || !["image/jpeg", "image/png", "image/webp"].includes(type)) throw new Error("not an image");
      const body = await res.arrayBuffer();
      if (body.byteLength > 15_000_000) throw new Error("too large");
      const key = new URL(url); key.search = "";
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key.href)));
      const hash = [...digest.slice(0, 6)].map(b => b.toString(16).padStart(2, "0")).join("");
      const path = `cars/${slug}/rc-${originId.slice(0, 8)}-${hash}.${type === "image/jpeg" ? "jpeg" : type.split("/")[1]}`;
      if (!await store(path, body, type)) throw new Error("store failed");
      out.push(path);
    } catch { out.push(url); failed++; }
  }
  return { photos: out, failed };
}

// ---------- Schema v2 (mirrors SistemaGestao contract: rules + availability) ----------
export const RULE_FIELDS = ["daily_price", "security_deposit", "deductible", "minimum_days", "minimum_age", "category"] as const;
export type RuleField = typeof RULE_FIELDS[number];
const rangeSchema = z.object({ start_at: z.string().datetime({ offset: true }), end_at: z.string().datetime({ offset: true }), reason: z.string().max(100).nullable().optional() });
export const availabilitySchema = z.object({ available: z.boolean(), reason: z.string().max(100).nullable().optional(), ranges: z.array(rangeSchema).max(500) });
const v2Base = {
  schema_version: z.literal(2), event_id: z.string().min(1).max(200), origin_system: z.literal("sistemagestao"),
  origin_vehicle_id: z.string().min(1).max(200), source_revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  occurred_at: z.string().datetime({ offset: true }),
  /** Optional: the site car SistemaGestao has mapped this unit to, so an unlinked site car can be resolved on first inbound edit. */
  site_vehicle_id: z.string().uuid().optional(),
};
export const fleetV2Schema = z.discriminatedUnion("event_type", [
  z.object({ ...v2Base, event_type: z.literal("vehicle.updated"), changed_fields: z.array(z.enum(RULE_FIELDS)).min(1).max(6),
    snapshot: z.object({ daily_price: z.number().finite().nonnegative().nullable().optional(), security_deposit: z.number().finite().nonnegative().nullable().optional(),
      deductible: z.number().finite().nonnegative().nullable().optional(), minimum_days: z.number().int().nullable().optional(),
      minimum_age: z.number().int().nullable().optional(), category: z.string().max(100).nullable().optional() }) }),
  z.object({ ...v2Base, event_type: z.literal("vehicle.availability_changed"), availability: availabilitySchema }),
]);
export type FleetV2 = z.infer<typeof fleetV2Schema>;

/** Site columns written from ONLY the changed rule fields. NULL minimum_days/age = preserve; bounds days 1-365, age 18-100; zero/missing deposit is never applied (site rule). */
export function rulesPatch(ev: Extract<FleetV2, { event_type: "vehicle.updated" }>) {
  const patch: Record<string, number | string | null> = {}; const warnings: string[] = [];
  const s = ev.snapshot;
  for (const f of new Set(ev.changed_fields)) {
    // Price freeze (owner decision): SistemaGestao prices never change site prices.
    if (f === "daily_price") warnings.push("daily_price_frozen_not_applied");
    if (f === "security_deposit") { if (s.security_deposit == null || s.security_deposit <= 0) warnings.push("security_deposit_zero_not_applied"); else patch["security_deposit_usd"] = s.security_deposit; }
    if (f === "deductible") { if (s.deductible == null) warnings.push("deductible_missing_not_applied"); else patch["insurance_deductible_usd"] = s.deductible; }
    if (f === "minimum_days" && s.minimum_days != null) { if (s.minimum_days < 1 || s.minimum_days > 365) warnings.push("minimum_days_out_of_bounds"); else patch["min_days"] = s.minimum_days; }
    if (f === "minimum_age" && s.minimum_age != null) { if (s.minimum_age < 18 || s.minimum_age > 100) warnings.push("minimum_age_out_of_bounds"); else patch["min_age"] = s.minimum_age; }
    if (f === "category") { try { patch["body_category"] = fleetCategory(s.category ?? ""); } catch { warnings.push("category_unsupported_not_applied"); } }
  }
  return { patch, warnings };
}

export async function payloadHash(raw: unknown) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(raw))));
  return [...d].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Outbound wire envelope from a queued outbox row (v1 lifecycle unchanged; v2 per contract). */
export function outboundEnvelope(event: { event_id: string; event_type: string; vehicle_id: string; source_revision: number; occurred_at: string; snapshot: unknown; schema_version?: number | null; changed_fields?: unknown; availability?: unknown }) {
  const base = { event_id: event.event_id, event_type: event.event_type, origin_system: "site", origin_vehicle_id: event.vehicle_id, source_revision: event.source_revision, occurred_at: event.occurred_at };
  if (event.schema_version !== 2) return { ...base, snapshot: stripPrice(event.event_type, event.snapshot) };
  if (event.event_type === "vehicle.availability_changed") return { schema_version: 2, ...base, availability: event.availability };
  return { schema_version: 2, ...base, changed_fields: event.changed_fields, snapshot: event.snapshot };
}

export type WireDefaults = { deductible: number; minimumDays: number; minimumAge: number };
/** SistemaGestao v2 requires all six rule values as non-null numbers/strings. Unchanged blanks are sent as the site's effective
 * values (SistemaGestao applies only changed_fields); a changed field cleared to blank cannot be expressed, so it is dropped.
 * Returns null when nothing sendable remains. */
export function wireRulesEnvelope(env: ReturnType<typeof outboundEnvelope>, d: WireDefaults) {
  if (!("changed_fields" in env) || env.event_type !== "vehicle.updated") return env;
  const s = (env.snapshot ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  const raw = { daily_price: num(s["daily_price"]), security_deposit: num(s["security_deposit"]), deductible: num(s["deductible"]), minimum_days: num(s["minimum_days"]), minimum_age: num(s["minimum_age"]), category: typeof s["category"] === "string" && s["category"] ? s["category"] : null };
  // Price freeze: daily_price is never sent as changed and never carried in the snapshot.
  const changed = (Array.isArray(env.changed_fields) ? env.changed_fields as string[] : []).filter(f => f !== "daily_price" && (raw as Record<string, unknown>)[f] != null);
  if (!changed.length) return null;
  const photos = Array.isArray(s["photos"]) ? (s["photos"] as unknown[]).filter((p): p is string => typeof p === "string" && p.startsWith("https://")) : [];
  const snapshot = { photos, security_deposit: raw.security_deposit ?? 0, deductible: raw.deductible ?? d.deductible, minimum_days: raw.minimum_days ?? d.minimumDays, minimum_age: raw.minimum_age ?? d.minimumAge, category: raw.category ?? "suv" };
  return { ...env, changed_fields: changed, snapshot };
}

export type RemoteAvailability = { available: boolean; ranges: unknown };
/** True when SistemaGestao's stored state blocks [pickup, ret): car unavailable there with no ranges, or an overlapping range. */
export function remoteBlocks(row: RemoteAvailability | null | undefined, pickup: Date, ret: Date) {
  if (!row) return false;
  const ranges = Array.isArray(row.ranges) ? row.ranges as { start_at: string; end_at: string }[] : [];
  if (!row.available && !ranges.length) return true;
  return ranges.some(r => new Date(r.start_at).getTime() < ret.getTime() && new Date(r.end_at).getTime() > pickup.getTime());
}
/** Florida days covered by remote ranges (for the car-page calendar). */
export function remoteDays(row: RemoteAvailability | null | undefined, from = new Date()) {
  const out = new Set<string>();
  const ranges = row && Array.isArray(row.ranges) ? row.ranges as { start_at: string; end_at: string }[] : [];
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
  for (const r of ranges) {
    const end = new Date(r.end_at).getTime();
    for (let t = Math.max(new Date(r.start_at).getTime(), from.getTime() - 86400000); t < end && out.size < 2000; t += 3600000) out.add(fmt.format(new Date(t)));
  }
  return out;
}

// ---------- Comparison / divergence ----------
export type CompareVehicle = { vehicle_id: string; exists: boolean; daily_price?: number | null; security_deposit?: number | null; deductible?: number | null; minimum_days?: number | null; minimum_age?: number | null; category?: string | null; availability?: { available: boolean; reason?: string | null; ranges?: unknown[] } | null; local_availability?: AvailView | null; remote_availability?: AvailView | null; effective_availability?: AvailView | null };
type AvailView = { available: boolean; reason?: string | null; ranges?: unknown[] };
/** Three-part availability: effective = local AND remote (remote absent = no remote block). */
export function threePartAvailability(local: AvailView | null, remote: AvailView | null) {
  const available = !!local?.available && (remote ? remote.available : true);
  const reason = !local?.available ? (local?.reason ?? "inactive") : remote && !remote.available ? (remote.reason ?? "remote") : (local?.reason ?? "available");
  const effective = { available, reason, ranges: [...(local?.ranges ?? []), ...(remote?.ranges ?? [])] };
  return { local_availability: local, remote_availability: remote, effective_availability: effective, availability: effective };
}
export type Divergence = { site_vehicle_id: string; sistemagestao_vehicle_id: string; field: string; site: unknown; sistemagestao: unknown };
const num = (x: unknown) => x == null || x === "" ? null : Number(x);
export function findDivergences(pairs: { site_vehicle_id: string; sistemagestao_vehicle_id: string }[], site: CompareVehicle[], rc: CompareVehicle[]) {
  const divergences: Divergence[] = []; const unverified: string[] = [];
  const S = new Map(site.map(v => [v.vehicle_id, v])), R = new Map(rc.map(v => [v.vehicle_id, v]));
  for (const p of pairs) {
    const s = S.get(p.site_vehicle_id), r = R.get(p.sistemagestao_vehicle_id);
    const add = (field: string, a: unknown, b: unknown) => divergences.push({ ...p, field, site: a, sistemagestao: b });
    if (!r) { unverified.push(p.sistemagestao_vehicle_id); continue; }
    if (!s?.exists || !r.exists) { if (!!s?.exists !== !!r.exists) add("exists", !!s?.exists, !!r.exists); continue; }
    for (const f of ["daily_price", "security_deposit", "deductible"] as const) if (num(s[f]) !== num(r[f])) add(f, num(s[f]), num(r[f]));
    for (const f of ["minimum_days", "minimum_age"] as const) if (s[f] != null && r[f] != null && num(s[f]) !== num(r[f])) add(f, s[f], r[f]);
    let rcCat: string | null = r.category ?? null; try { rcCat = fleetCategory(r.category ?? ""); } catch { /* keep raw */ }
    if ((s.category ?? null) !== rcCat) add("category", s.category, r.category);
    if (!!s.availability?.available !== !!r.availability?.available) add("availability", s.availability?.available ?? null, r.availability?.available ?? null);
  }
  return { divergences, unverified };
}

/** Send-time safety check: a delete/archive is sent only if the site row is verifiably gone / still inactive. */
export function lifecycleStillValid(eventType: string, row: { active: boolean } | null) {
  if (eventType === "vehicle.deleted") return row == null;
  if (eventType === "vehicle.archived") return row != null && !row.active;
  return true;
}

/** Price freeze: v1 snapshots drop daily_price except on initial vehicle.created (SistemaGestao requires it to create a unit). */
export function stripPrice(eventType: string, snapshot: unknown) {
  if (eventType === "vehicle.created" || !snapshot || typeof snapshot !== "object") return snapshot;
  const { daily_price: _p, ...rest } = snapshot as Record<string, unknown>;
  return rest;
}

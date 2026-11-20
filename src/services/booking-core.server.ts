// Shared server-side checks for both booking flows (request/Stripe and instant/Global Pays).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { remoteBlocks } from "./fleet-sync";
import { blockingFilter, canBookOnline, computeQuote, effectiveMinDays, crossConfig, deliveryConfig, DEFAULT_SETTINGS, deliveryTier, insuranceOffered, matchingFees, servesCity } from "@/lib/pricing";
import { getRequestHeader } from "@tanstack/react-start/server";
import { REQUIRED_DOCS, docsInFolder, type BookingInput } from "./booking-schema";
import { deliveryDestination } from "@/lib/deliveryCity";
import { upsellConfig, upsellPricing } from "@/lib/checkoutExtras";

export async function validateBooking(db: SupabaseClient<Database>, data: BookingInput, opts: { excludeId?: string } = {}) {
    const docs = data.documents;
    if (docs) for (const k of REQUIRED_DOCS) if (!docs[k].startsWith(`${docs.folder}/`)) throw new Error("Invalid documents");

    const [{ data: v }, { data: st }, { data: city }] = await Promise.all([
      db.from("vehicles").select("*").eq("slug", data.vehicleSlug).eq("city", data.city).eq("active", true).maybeSingle(),
      db.from("settings").select("*").eq("id", 1).maybeSingle(),
      db.from("cities").select("slug, fleet_from_city, delivery_locations, delivery_fee_usd").eq("slug", deliveryDestination(data.serviceCity || data.city, data.delivery)).maybeSingle(),
    ]);
    if (docs && !docsInFolder(docs)) throw new Error("Invalid documents");
    if (!v) throw new Error("Car not available");
    // Price-on-request cars are WhatsApp-only: no booking, payment or $0 total is ever created.
    if (!(Number(v.daily_price_usd) > 0)) throw new Error("PRICE_ON_REQUEST");
    // Service city must be served by this car (own fleet or an offered cross-city cell for its tier).
    const upsells = upsellConfig((st?.delivery_config as { upsells?: unknown } | null)?.upsells);
    const { data: promos } = await db.from("vehicle_promotions").select("vehicle_id, pct, starts_on, ends_on, active").eq("vehicle_id", v.id).eq("active", true);
    const s = { ...DEFAULT_SETTINGS, ...(st ?? {}), ...upsellPricing(upsells), promotions: promos ?? [] };
    const rawCfg = (st as { delivery_config?: unknown } | null)?.delivery_config;
    if (data.delivery.pickupLeg && data.serviceCity && !["orlando", "miami"].includes(data.serviceCity)) throw new Error("DELIVERY_CITY");
    if (!city || !servesCity(v.city, city.slug, v, crossConfig((rawCfg as { cross?: unknown } | null)?.cross))) throw new Error("Invalid city");
    // Supplemental insurance only where offered — a tampered request can never add it.
    // Extra luggage car is offered only while active in admin.
    if (data.addons.luggageCar && !upsells.luggageCarActive) throw new Error("ADDON_NOT_OFFERED");
    if (data.addons.insurance && !insuranceOffered(v, deliveryConfig(rawCfg))) throw new Error("INSURANCE_NOT_OFFERED");
    const { resolveDelivery } = await import("./delivery.server");
    const delivery = await resolveDelivery(v, city.slug, data.delivery, rawCfg);
    const pickup = new Date(data.pickupAt), ret = new Date(data.returnAt), now = new Date();
    if (!(ret > pickup)) throw new Error("Invalid dates");
    if (!canBookOnline(now, pickup, s)) throw new Error("TOO_SOON");
    const dcfg = deliveryConfig(rawCfg);
    const exotic = deliveryTier(v) === "exotic";
    // Owner custom fees: server decides which apply; an optional fee the car doesn't offer is a tampered request.
    const customFees = matchingFees(dcfg.custom_fees, { body_category: v.body_category, exotic }, city.slug);
    const chosenFees = data.addons.fees ?? [];
    if (chosenFees.some((id) => !customFees.some((f) => f.id === id && f.mode === "optional"))) throw new Error("FEE_NOT_OFFERED");
    const q = computeQuote(v, pickup, ret, data.addons, s, delivery.itemizedFee, delivery.embeddedFee, { exotic, deliveryPending: delivery.status === "quote_pending", fees: dcfg.fees, customFees, chosenFees, minDays: effectiveMinDays(v, (st as { min_days_by_category?: unknown } | null)?.min_days_by_category).n });

    const dob = new Date(data.driver.dateOfBirth);
    const age = (pickup.getTime() - dob.getTime()) / (365.25 * 86400000);
    if (age < v.min_age) throw new Error("UNDER_AGE");

    // Overlap with active requests or blocked dates
    if (!(await carIsFree(db, v.id, v.blocked_dates ?? [], pickup, ret, opts.excludeId))) throw new Error("UNAVAILABLE");

  const locKey = data.delivery.type === "pickup" ? "base" : data.delivery.type === "airport" ? (delivery.label.airport ?? "airport").toLowerCase() : "hotel";
  type Ins = Database["public"]["Tables"]["prereservations"]["Insert"];
  const bookingFields = {
    ...delivery.row,
    license_number: data.driver.licenseNumber || null, license_expiry: data.driver.licenseExpiry || null, passport_number: data.driver.passportNumber || null,
    pickup_location: String(delivery.row["pickup_location"] ?? locKey), return_location: String(delivery.row["return_location"] ?? locKey),
    base_daily_usd: v.daily_price_usd, all_in_daily_usd: null,
  } as Partial<Ins> & Pick<Ins, "pickup_location" | "return_location">;
  const { data: extracted } = data.documents ? await db.from("document_checks").select("results").eq("folder", data.documents.folder).maybeSingle() : { data: null };
  // Keep name-match verdict against the originally typed name, before auto-fill.
  if (extracted) bookingFields.document_ai = extracted.results;
  const breakdown = { ...q, city: city.slug, base_city: v.city, currency: "USD", delivery: { ...delivery.label, status: delivery.status, fee: delivery.status === "priced" ? delivery.itemizedFee : null, cross: delivery.cross, legs: delivery.legs ?? null } };
  return { v, s, city, pickup, ret, q, now, delivery, bookingFields, breakdown };
}

/** Car free for the period: no blocking booking (other than `excludeId`) and no blocked day. */
export async function carIsFree(db: SupabaseClient<Database>, vehicleId: string, blockedDates: string[], pickup: Date, ret: Date, excludeId?: string) {
  let q = db.from("prereservations").select("id").eq("vehicle_id", vehicleId)
    .or(blockingFilter()).lt("pickup_at", ret.toISOString()).gt("return_at", pickup.toISOString()).limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  const { data: clash } = await q;
  const blocked = blockedDates.some((d) => { const x = new Date(`${d}T12:00:00Z`); return x >= new Date(pickup.toDateString()) && x <= ret; });
  if (clash?.length || blocked) return false;
  // SistemaGestao-reported unavailability (stored by inbound fleet sync) also blocks the car.
  const { data: remote } = await db.from("fleet_sync_remote_availability").select("available,ranges").eq("site_vehicle_id", vehicleId).maybeSingle();
  return !remoteBlocks(remote, pickup, ret);
}

/** True only when the request carries a signed-in owner's token (role checked as that user, RLS-safe). */
export async function callerIsAdmin(): Promise<boolean> {
  const auth = getRequestHeader("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token.startsWith("sb_")) return false;
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env["SUPABASE_URL"]!, key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}`, apikey: key } } });
  const { data: u } = await sb.auth.getUser(token);
  if (!u.user) return false;
  const { data } = await sb.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
  return data === true;
}


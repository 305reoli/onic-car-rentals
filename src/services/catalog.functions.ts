import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCookie, getRequestHeader } from "@tanstack/react-start/server";
import { blockingFilter, DEFAULT_SETTINGS } from "@/lib/pricing";
import { withDepositDefault, PUBLIC_VEHICLE_COLUMNS, type Vehicle } from "@/lib/vehicles";

export const getVehicles = createServerFn({ method: "GET" })
  .inputValidator((d: { city?: string } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const { publicClient } = await import("./public-client.server");
    const q = publicClient().from("vehicles").select(PUBLIC_VEHICLE_COLUMNS).eq("active", true).order("sort_order").order("name");
    if (!data.city) {
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      return ((rows ?? []) as Vehicle[]).map(withDepositDefault);
    }
    const { enrichForCity, fleetsFor } = await import("./serving.server");
    const [{ data: c }, { data: st }] = await Promise.all([
      publicClient().from("cities").select("slug, fleet_from_city").eq("slug", data.city).maybeSingle(),
      publicClient().from("settings").select("delivery_config").eq("id", 1).maybeSingle(),
    ]);
    if (!c) return [] as Vehicle[];
    const { data: rows, error } = await q.in("city", fleetsFor(c, st?.delivery_config));
    if (error) throw new Error(error.message);
    return enrichForCity(((rows ?? []) as Vehicle[]).map(withDepositDefault), c, st?.delivery_config) as Vehicle[];
  });

export const getVehicle = createServerFn({ method: "GET" })
  .inputValidator((d: { city: string; slug: string }) => z.object({ city: z.string(), slug: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { publicClient } = await import("./public-client.server");
    const { data: v } = await publicClient().from("vehicles").select(PUBLIC_VEHICLE_COLUMNS).eq("slug", data.slug).eq("city", data.city).eq("active", true).maybeSingle();
    return v ? withDepositDefault(v as Vehicle) : null;
  });

export const getCities = createServerFn({ method: "GET" }).handler(async () => {
  const { publicClient } = await import("./public-client.server");
  const { data, error } = await publicClient().from("cities").select("*").eq("active", true).order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
});

/** Settings columns visitors may read; owner alert email and admin change-log email are not granted to anon. */
const PUBLIC_SETTINGS_COLUMNS = "id,prereservation_min_usd,prereservation_days,addon_insurance_per_day,addon_hotel_checkin,addon_luggage_car,whatsapp_number,approval_window_hours,cutoff_hours_before_pickup,min_lead_time_hours,contact_email,terms_version,sistemagestao_integration_enabled,updated_at,company_zip,support_email,payment_company_address,legal_operator_en,legal_operator_pt,legal_operator_es,legal_payments_en,legal_payments_pt,legal_payments_es,balance_deadline_hours,whatsapp_provider,msg_approved_en,msg_approved_pt,msg_approved_es,msg_declined_en,msg_declined_pt,msg_declined_es,msg_expired_en,msg_expired_pt,msg_expired_es,wa_tpl_approved_en,wa_tpl_approved_pt,wa_tpl_approved_es,wa_tpl_declined_en,wa_tpl_declined_pt,wa_tpl_declined_es,wa_tpl_expired_en,wa_tpl_expired_pt,wa_tpl_expired_es,msg_confirmed_en,msg_confirmed_pt,msg_confirmed_es,wa_tpl_confirmed_en,wa_tpl_confirmed_pt,wa_tpl_confirmed_es,delivery_config,google_business_url,globalpays_live,globalpays_live_changed_at,payment_modes,substitute_window_hours,substitute_reminder_hours,gp_interest_free_installments,min_days_by_category,duration_tiers,measureone_static_link,rentalcover_affiliate_link";

export const getPublicSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { publicClient } = await import("./public-client.server");
  const [{ data }, { data: promos }] = await Promise.all([
    publicClient().from("settings").select(PUBLIC_SETTINGS_COLUMNS).eq("id", 1).maybeSingle(),
    publicClient().from("vehicle_promotions").select("vehicle_id, pct, starts_on, ends_on, active").eq("active", true),
  ]);
  return {
    ...DEFAULT_SETTINGS,
    ...(data ?? {}),
    promotions: promos ?? [],
    owner_notification_email: undefined,
    google_place_id: process.env["GOOGLE_PLACE_ID"] || null,
  } as typeof DEFAULT_SETTINGS & { google_place_id: string | null; google_business_url?: string; whatsapp_number: string; contact_email: string; terms_version: string };
});

/** Booked days (YYYY-MM-DD) for a car: active pre-reservations + manual blocked dates. */
export const getBookedDays = createServerFn({ method: "GET" })
  .inputValidator((d: { vehicleId: string }) => z.object({ vehicleId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkAvailability } = await import("./sistemagestao-adapter.server");
    await checkAvailability(data.vehicleId, new Date(), new Date()); // disabled placeholder
    const [{ data: v }, { data: rs }] = await Promise.all([
      supabaseAdmin.from("vehicles").select("blocked_dates").eq("id", data.vehicleId).maybeSingle(),
      supabaseAdmin.from("prereservations").select("pickup_at, return_at").eq("vehicle_id", data.vehicleId)
        .or(blockingFilter()).gte("return_at", new Date().toISOString()),
    ]);
    const days = new Set<string>(v?.blocked_dates ?? []);
    const { data: remote } = await supabaseAdmin.from("fleet_sync_remote_availability").select("available,ranges").eq("site_vehicle_id", data.vehicleId).maybeSingle();
    const { remoteDays } = await import("./fleet-sync");
    for (const d of remoteDays(remote)) days.add(d);
    for (const r of rs ?? []) {
      const d = new Date(r.pickup_at); d.setUTCHours(0, 0, 0, 0);
      const end = new Date(r.return_at);
      while (d <= end) { days.add(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
    }
    return [...days].sort();
  });

export const getPreferredLang = createServerFn({ method: "GET" }).handler(async () => {
  const { detectLang } = await import("@/lib/langDetect");
  return detectLang({ cookie: getCookie("lang"), acceptLanguage: getRequestHeader("accept-language"), country: getRequestHeader("cf-ipcountry") ?? null, userAgent: getRequestHeader("user-agent") });
});

/** IDs of a city's fleet cars that are NOT available for the period (blocked day or overlapping active request). */
export const getUnavailableIds = createServerFn({ method: "GET" })
  .inputValidator((d: { city: string; pickup: string; ret: string }) =>
    z.object({ city: z.string().max(60), pickup: z.string().max(30), ret: z.string().max(30) }).parse(d))
  .handler(async ({ data }) => {
    const p = new Date(data.pickup), r = new Date(data.ret);
    if (isNaN(p.getTime()) || isNaN(r.getTime()) || r <= p) return [] as string[];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isUnavailable } = await import("@/lib/pricing");
    const { fleetsFor } = await import("./serving.server");
    const [{ data: c }, { data: st }] = await Promise.all([
      supabaseAdmin.from("cities").select("slug, fleet_from_city").eq("slug", data.city).maybeSingle(),
      supabaseAdmin.from("settings").select("delivery_config").eq("id", 1).maybeSingle(),
    ]);
    if (!c) return [] as string[];
    const { data: cars } = await supabaseAdmin.from("vehicles").select("id, blocked_dates").in("city", fleetsFor(c, st?.delivery_config)).eq("active", true);
    const ids = (cars ?? []).map((v) => v.id);
    if (!ids.length) return [];
    const { data: rs } = await supabaseAdmin.from("prereservations").select("vehicle_id, pickup_at, return_at")
      .in("vehicle_id", ids).or(blockingFilter())
      .lt("pickup_at", r.toISOString()).gt("return_at", p.toISOString());
    const { data: remote } = await supabaseAdmin.from("fleet_sync_remote_availability").select("site_vehicle_id,available,ranges").in("site_vehicle_id", ids);
    const { remoteBlocks } = await import("./fleet-sync");
    return (cars ?? []).filter((v) => isUnavailable(v.blocked_dates ?? [], (rs ?? []).filter((x) => x.vehicle_id === v.id), data.pickup, data.ret)
      || remoteBlocks((remote ?? []).find((x) => x.site_vehicle_id === v.id), p, r)).map((v) => v.id);
  });

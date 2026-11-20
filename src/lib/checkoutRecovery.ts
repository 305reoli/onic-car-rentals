import { z } from "zod";
import { publicPath } from "./publicRoutes";
import type { Lang } from "./i18n";

export const CAPTURE_HOURS = 24;
export const RECOVERY_HOURS = 2;
export const captureReferenceSchema = z.string().uuid();
export type ResumeFields = { language: string; base_city: string; service_city: string; vehicle_slug: string; pickup_at: string; return_at: string };
export function resumeLink(row: ResumeFields, origin = "https://oniccarrentals.com") {
  const lang: Lang = row.language === "en" || row.language === "es" ? row.language : "pt";
  const path = publicPath(lang, `/checkout/${encodeURIComponent(row.base_city)}/${encodeURIComponent(row.vehicle_slug)}`);
  const q = new URLSearchParams({ city: row.service_city, pickup: row.pickup_at, ret: row.return_at });
  return `${origin}${path}?${q}`;
}
export function recoveryDue(row: { status: string; created_at: string; expires_at: string; recovery_attempted_at?: string | null }, now: Date) {
  return row.status === "pending_payment" && !row.recovery_attempted_at && now.getTime() >= new Date(row.created_at).getTime() + RECOVERY_HOURS * 3600000 && now.getTime() < new Date(row.expires_at).getTime();
}
/** Old-site checkout links: /[lang/]cars/{slug}-{city}/checkout?… → working checkout, query preserved. null = not an old checkout link. */
export function legacyCheckoutRedirect(pathname: string, search = ""): string | null {
  const m = /^(?:\/(en|pt|es))?\/cars\/([a-z0-9-]+)-(miami|orlando)\/checkout\/?$/i.exec(pathname);
  if (!m) return null;
  const lang: Lang = (m[1]?.toLowerCase() as Lang) ?? "en";
  const city = m[3]!.toLowerCase(), slug = m[2]!.toLowerCase();
  const q = new URLSearchParams(search);
  if (!q.get("city")) q.set("city", city);
  return `${publicPath(lang, `/checkout/${city}/${slug}`)}?${q}`;
}

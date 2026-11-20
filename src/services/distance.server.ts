// Google Maps server gateway; no invented distance or production/test substitutes.
import { getCookie, setCookie } from "@tanstack/react-start/server";
export type Point = { lat: number; lng: number };
export type DistanceResult = { ok: true; miles: number; dest: Point & { address: string }; provider: "google" } | { ok: false; reason: "no_geocode" | "service_error" | "unavailable" };
async function signature(value: string) {
  const secret = process.env["LOVABLE_API_KEY"];
  if (!secret) throw new Error("Maps configuration unavailable");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))), b => b.toString(16).padStart(2, "0")).join("");
}
export async function startMapsSession() {
  const value = `${Date.now() + 30 * 60_000}:${crypto.randomUUID()}`;
  setCookie("delivery_session", `${value}:${await signature(value)}`, { httpOnly: true, sameSite: "strict", path: "/", maxAge: 1800 });
}
export async function requireMapsSession() {
  const c = getCookie("delivery_session") ?? "", parts = c.split(":"), expiry = Number(parts[0]);
  const value = parts.slice(0, 2).join(":");
  if (parts.length !== 3 || !Number.isFinite(expiry) || expiry < Date.now() || expiry > Date.now() + 1800_000 || parts[2] !== await signature(value)) throw new Error("DELIVERY_SESSION");
}
export const testProviderAllowed = () => false;
export const distanceProviderName = () => process.env["GOOGLE_MAPS_API_KEY"] ? "google" as const : "none" as const;
async function maps(path: string, init: RequestInit = {}) {
  const api = process.env["GOOGLE_MAPS_API_KEY"], lovable = process.env["LOVABLE_API_KEY"];
  if (!api || !lovable) throw new Error("Google Maps connection missing");
  const r = await fetch(`https://connector-gateway.lovable.dev/google_maps${path}`, { ...init, headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": api, "Content-Type": "application/json", ...init.headers } });
  if (!r.ok) {
    const body = await r.text(); console.error(`Maps [${r.status}]: ${body}`);
    if (r.status === 403) { const j = JSON.parse(body); const reason = j?.error?.details?.find((d: { reason?: string }) => d.reason)?.reason;
      if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") throw new Error('Google Maps server key is referrer-restricted. Set server key application restrictions to None or IP addresses in Google Cloud Console.');
      if (reason === "API_KEY_SERVICE_BLOCKED") throw new Error('Google Maps server key does not allow this API. Add the API to allowed APIs in Google Cloud Console.');
    }
    throw new Error(`Google Maps [${r.status}]: ${body}`);
  }
  return r.json();
}
async function geocode(address: string): Promise<(Point & { address: string }) | null> {
  const j = await maps(`/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:US`);
  if (j.status === "ZERO_RESULTS") return null;
  if (j.status !== "OK") throw new Error(`Geocoding: ${j.status}`);
  const g = j.results?.[0]; return g ? { ...g.geometry.location, address: g.formatted_address } : null;
}
export async function distanceFrom(base: Point, dest: { address?: string | undefined; placeId?: string | undefined; sessionToken?: string | undefined; airportCode?: string | undefined; point?: Point | undefined }): Promise<DistanceResult> {
  try {
    await requireMapsSession();
    const to = dest.placeId ? await maps(`/places/v1/places/${encodeURIComponent(dest.placeId)}${dest.sessionToken ? `?sessionToken=${encodeURIComponent(dest.sessionToken)}` : ""}`, { headers: { "X-Goog-FieldMask": "formattedAddress,location" } }).then(j => j.location ? { lat: j.location.latitude, lng: j.location.longitude, address: j.formattedAddress } : null) : dest.point ? { ...dest.point, address: dest.airportCode ?? "" } : dest.address ? await geocode(dest.address) : null;
    if (!to) return { ok: false, reason: "no_geocode" };
    const j = await maps("/routes/directions/v2:computeRoutes", { method: "POST", headers: { "X-Goog-FieldMask": "routes.distanceMeters,routes.duration" }, body: JSON.stringify({ origin: { location: { latLng: { latitude: base.lat, longitude: base.lng } } }, destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } }, travelMode: "DRIVE" }) });
    const route = j.routes?.[0]; if (!route || !/^\d+(\.\d+)?s$/.test(route.duration ?? "")) throw new Error("No valid route");
    return { ok: true, miles: (route.distanceMeters ?? 0) / 1609.344, dest: to, provider: "google" };
  } catch (e) { console.error("[distance]", e instanceof Error ? e.message : "unknown"); return { ok: false, reason: "service_error" }; }
}
export async function suggestAddresses(input: string, near?: Point, sessionToken?: string): Promise<{ address: string; placeId: string }[]> {
  await requireMapsSession();
  const j = await maps("/places/v1/places:autocomplete", { method: "POST", headers: { "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text" }, body: JSON.stringify({ input, sessionToken, includedRegionCodes: ["us"], ...(near ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 50000 } } } : {}) }) });
  return (j.suggestions ?? []).flatMap((s: { placePrediction?: { placeId?: string; text?: { text?: string } } }) => s.placePrediction?.placeId && s.placePrediction.text?.text ? [{ placeId: s.placePrediction.placeId, address: s.placePrediction.text.text }] : []).slice(0, 5);
}
export async function geocodeBase(address: string) {
  const g = await geocode(address); return g ? { ...g, provider: "google" as const } : null;
}

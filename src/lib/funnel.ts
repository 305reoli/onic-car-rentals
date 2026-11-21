/** Booking-funnel events: one GA4 (gtag) + one Meta Pixel custom event per step, sent once per page session. */
import { metaTrack, metaTrackCustom } from "@/lib/metaPixel";

export const FUNNEL_EVENTS = ["car_page_view", "checkout_started", "driver_info_completed", "documents_step_viewed", "payment_step_viewed", "pre_reservation_submitted"] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];
declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}
type Gtag = (...args: unknown[]) => void;
const sent = new Set<string>();

/** `key` scopes the once-only rule (e.g. car slug + dates) so a new car or trip counts again. */
export function trackFunnel(event: FunnelEvent, params: Record<string, string | number | null | undefined>, key = ""): boolean {
  if (typeof window === "undefined") return false;
  const id = `${event}|${key}`;
  if (sent.has(id)) return false;
  sent.add(id);
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""));
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag === "function") gtag("event", event, clean);
  else (window.dataLayer ??= []).push({ event, ...clean });
  metaTrackCustom(event, clean);
  return true;
}
export const resetFunnelForTests = () => sent.clear();

export type Purchase = { transaction_id: string; value: number; currency: "USD"; items: [{ item_id: string; item_name: string; item_category: string; price: number; quantity: 1 }] };

/** Only persisted, successfully paid bookings supply purchase facts; never a quote or browser return flag. */
export function purchaseFromBooking(b: { id: string; status: string; captured_at?: string | null; settled_at?: string | null; paid_amount_usd?: number | null; vehicle_id?: string | null; vehicle_name: string; is_test?: boolean }, category: string): Purchase | null {
  if (b.is_test || !["confirmed", "pending_approval", "approved"].includes(b.status) || !(b.captured_at || b.settled_at) || b.paid_amount_usd == null || !Number.isFinite(b.paid_amount_usd) || b.paid_amount_usd <= 0) return null;
  return { transaction_id: b.id, value: b.paid_amount_usd, currency: "USD", items: [{ item_id: b.vehicle_id ?? "", item_name: b.vehicle_name, item_category: category, price: b.paid_amount_usd, quantity: 1 }] };
}

/** One synchronous persisted claim across checkout, status, reloads and React double-effects.
 * Legacy Meta claims suppress only Meta: previously missing GA4 can still be reported once.
 * Fail closed when storage is unavailable rather than duplicate a paid transaction on reload. */
export function trackPurchase(purchase: Purchase | null): boolean {
  if (typeof window === "undefined" || !purchase || !purchase.transaction_id || !Number.isFinite(purchase.value) || purchase.value <= 0 || (window.navigator as Navigator & { globalPrivacyControl?: boolean })?.globalPrivacyControl) return false;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag !== "function") return false;
  const key = `ga4_purchase_${purchase.transaction_id}`;
  const legacyKey = `meta_purchase_${purchase.transaction_id}`;
  let metaSent: boolean;
  try {
    if (window.localStorage.getItem(key)) return false;
    metaSent = !!window.localStorage.getItem(legacyKey);
    window.localStorage.setItem(key, "1"); // claim BEFORE either provider call
  } catch { return false; }
  gtag("event", "purchase", purchase);
  if (!metaSent && typeof window.fbq === "function" && window.__metaPixel === "ok") {
    metaTrack("Purchase", { value: purchase.value, currency: "USD" }, purchase.transaction_id);
  }
  return true;
}

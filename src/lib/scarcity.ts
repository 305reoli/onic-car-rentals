import { modelKey } from "@/lib/discovery";
import { isUnavailable, rowBlocks } from "@/lib/pricing";
import { fmt, scarcityText, type Lang } from "@/lib/i18n";

export type StockUnit = { id: string; brand: string; model: string; city: string; active: boolean; blocked_dates: string[] };
export type StockBooking = { vehicle_id: string | null; pickup_at: string; return_at: string; status: string; hold_until?: string | null; created_at?: string | null };
export function availableModelUnits(units: StockUnit[] | null, bookings: StockBooking[] | null, target: StockUnit, pickup: string, ret: string, now = new Date()): number | null {
  const p = new Date(pickup), r = new Date(ret);
  if (!units || !bookings || !target.brand.trim() || !target.model.trim() || !Number.isFinite(p.getTime()) || !Number.isFinite(r.getTime()) || r <= p) return null;
  const matching = units.filter(v => v.active && v.city === target.city && modelKey(v) === modelKey(target));
  if (!matching.some(v => v.id === target.id)) return null;
  return matching.filter(v => !isUnavailable(v.blocked_dates, bookings.filter(b => b.vehicle_id === v.id && rowBlocks(b, now)), pickup, ret)).length;
}
export function unitsLeftLabel(n: number | null, lang: Lang) {
  return n == null || n < 1 ? null : n === 1 ? scarcityText[lang].last : fmt(scarcityText[lang].units, { n });
}
export function recentPaidCount(rows: { is_test: boolean; status: string; created_at: string; paid_amount_usd: number | null }[] | null, now: Date): number | null {
  if (!rows) return null;
  const count = rows.filter(r => !r.is_test && ["approved", "confirmed", "pending_approval"].includes(r.status) && Number(r.paid_amount_usd) > 0 && new Date(r.created_at).getTime() >= now.getTime() - 7 * 86400000 && new Date(r.created_at).getTime() <= now.getTime()).length;
  return count > 0 ? count : null;
}
export function holdSeconds(hold: { status: string; holdUntil: string | null } | null, now: number): number | null {
  if (!hold || hold.status !== "checkout_hold" || !hold.holdUntil) return null;
  const end = new Date(hold.holdUntil).getTime();
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / 1000)) : null;
}
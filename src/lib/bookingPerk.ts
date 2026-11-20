import { paidEnough } from "./pricing";
export function fullyPaidConfirmed(r: { status: string; refunded_at?: string | null; captured_at?: string | null; payment_mode?: string | null; prereservation_amount_usd?: number | string; paid_amount_usd?: number | null; balance_paid_at?: string | null; balance_amount_usd?: number | null; price_breakdown?: unknown }) {
  if (!["approved", "confirmed"].includes(r.status) || r.refunded_at) return false;
  const total = (r.price_breakdown as { total?: number | null } | null)?.total;
  const captured = r.captured_at ? Number(r.prereservation_amount_usd ?? 0) : 0;
  const balance = r.balance_paid_at ? Number(r.balance_amount_usd ?? 0) : 0;
  return paidEnough(Math.max(Number(r.paid_amount_usd ?? 0), captured + balance), total);
}
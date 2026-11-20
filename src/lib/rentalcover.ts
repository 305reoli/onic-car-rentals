import { paidEnough } from "./pricing";

export type RentalCoverCar = { name?: string | null; category?: string | null; body_category?: string | null; is_convertible?: boolean | null };

/** Fail closed: the internal tier must positively identify a regular vehicle. */
export function isRentalCoverEligible(car: RentalCoverCar | null | undefined): boolean {
  if (!car?.name?.trim() || /escalade|corvette/i.test(car.name) || car.is_convertible) return false;
  const category = car.category?.trim().toLowerCase();
  if (category !== "economy" && category !== "family") return false;
  if (car.body_category != null) {
    const body = car.body_category.trim().toLowerCase();
    if (!["suv", "sedan", "economy", "family"].includes(body)) return false;
  }
  return true;
}

export type RentalCoverBooking = {
  status: string; captured_at?: string | null; settled_at?: string | null; refunded_at?: string | null;
  paid_amount_usd?: number | null; prereservation_amount_usd?: number | string;
  price_breakdown?: unknown; pickup_at: string; return_at: string; base_city?: string | null;
};

/** This presentation guard reads payment evidence; it never changes payment state. */
export function rentalCoverPaid(booking: RentalCoverBooking): boolean {
  if (!["pending_approval", "approved", "confirmed"].includes(booking.status) || booking.refunded_at || !(booking.captured_at || booking.settled_at)) return false;
  const total = (booking.price_breakdown as { total?: number | null } | null)?.total;
  const captured = booking.captured_at ? Number(booking.prereservation_amount_usd ?? 0) : 0;
  return paidEnough(Math.max(Number(booking.paid_amount_usd ?? 0), captured), total);
}

/** Affiliate prefill support is unverified: return the stored link byte-for-byte. */
export function rentalCoverUrl(link: string | null | undefined): string | null {
  if (!link?.trim()) return null;
  try { if (new URL(link).protocol !== "https:") return null; } catch { return null; }
  return link;
}

export function rentalCoverCardUrl(link: string | null | undefined, car: RentalCoverCar | null | undefined, booking: RentalCoverBooking): string | null {
  if (!link?.trim() || !isRentalCoverEligible(car) || !rentalCoverPaid(booking)) return null;
  return rentalCoverUrl(link);
}
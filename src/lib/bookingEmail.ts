import { z } from "zod";

export const DEFAULT_BOOKING_NOTIFICATION_EMAIL = "info@oniccarrentals.com";
export function bookingNotificationEmail(value: unknown) {
  const parsed = z.string().trim().email().safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_BOOKING_NOTIFICATION_EMAIL;
}

export function ownerBookingSubject(car: string, dates: string, customer: string) {
  return `Nova reserva — ${car} · ${dates} · ${customer}`;
}

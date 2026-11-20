import { fmt, rentalTermsText, type Lang } from "@/lib/i18n";

/** Publication facts only; these do not change checkout or booking enforcement. */
export const RENTAL_TERMS_RULES = {
  minimumAges: [21, 25, 27],
  performanceExtraMile: 7, regularMileage: "unlimited-florida",
  leavingFloridaPenalty: 500, fuelPerGallon: 6.99, fuelServiceFee: 20,
  cleaningStartsAt: 50, lateFirstMinutes: 30, lateFirstFee: 50,
  lateSecondStartMinutes: 31, lateSecondMinutes: 60, lateSecondFee: 70,
  cancellationHours: 48, earlyRefundPercent: 75, lateRefundPercent: 40,
  cancellationGraceHours: 24, fullRefundPickupGuardHours: 24, graceRefundPercent: 100, pickupDayRefundPercent: 0, noShowRefundPercent: 0,
} as const;

export function rentalTermsSections(lang: Lang, cancellationOnly = false) {
  const sections = rentalTermsText[lang].sections;
  const { minimumAges: _ages, ...values } = RENTAL_TERMS_RULES;
  return sections.flatMap(([title, body], index) =>
    cancellationOnly && index !== 9 ? [] : [{
      number: index + 1, title, body: fmt(body, values),
    }]);
}
/** Publication-policy eligibility only; does not execute cancellation or payment actions. */
export function qualifiesCancellationGrace(bookedAt: Date, cancelledAt: Date, pickupAt: Date): boolean {
  const elapsed = cancelledAt.getTime() - bookedAt.getTime();
  const remaining = pickupAt.getTime() - cancelledAt.getTime();
  const bookingLead = pickupAt.getTime() - bookedAt.getTime();
  const hour = 60 * 60 * 1000;
  return elapsed >= 0 && elapsed <= RENTAL_TERMS_RULES.cancellationGraceHours * hour
    && remaining > RENTAL_TERMS_RULES.fullRefundPickupGuardHours * hour
    && bookingLead > RENTAL_TERMS_RULES.fullRefundPickupGuardHours * hour;
}

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GpPayOption } from "@/components/pay/GpPayOption";
import { RentalTerms } from "@/components/site/RentalTerms";
import { computeQuote, dueAtBooking, paymentMode, stripeBookingIsHold, stripeBookingReady, paymentDifference } from "./pricing";
import { t, ownerText, rentalTermsText, cancellationPolicy, currentPaymentMessage } from "./i18n";
import { mainFaq } from "./faqContent";
const none = { insurance: false, hotelCheckin: false, luggageCar: false };

describe("full payment only — owner decision", () => {
  for (const [category, rate, end, total] of [["sedan", 55, "21", 306.72], ["exotics", 449, "18", 480.32]] as const) {
    it(`${category}: total and both rails agree at ${total} USD`, () => {
      const v = { body_category: category, daily_price_usd: rate, prereservation_amount_usd: null, payment_mode: "signal" };
      const q = computeQuote(v, new Date("2026-11-17T15:00Z"), new Date(`2026-11-${end}T15:00Z`), none, undefined, 0, 0, { exotic: category === "exotics" });
      const due = dueAtBooking(q, paymentMode(v, { sedan: "signal" }));
      expect(q.total).toBe(total);
      expect(due).toEqual({ amount: total, mode: "full" });
      expect(paymentDifference(total, due.amount)).toBe(0);
    });
  }
  it("every category charges the full total immediately", () => {
    for (const category of ["suv", "sedan", "luxury", "convertible"]) expect(stripeBookingIsHold(category)).toBe(false);
    for (const category of ["sports", "exotics"]) expect(stripeBookingIsHold(category)).toBe(false);
    expect(stripeBookingReady("requires_capture", false)).toBe(false);
    expect(stripeBookingReady("succeeded", false)).toBe(true);
    expect(stripeBookingReady("requires_payment_method", false)).toBe(false);
    expect(stripeBookingReady("requires_capture", true)).toBe(true);
  });
  for (const lang of ["en", "pt", "es"] as const) {
    it(`${lang}: Payment and Terms/FAQ reconcile full payment; section 10 unchanged`, () => {
      const tr = t(lang);
      const gp = renderToStaticMarkup(<GpPayOption t={tr.checkout.route} amount={298.2} mode="full" quote={null} />);
      expect(gp).toContain("$298.20 USD");
      expect(gp).toContain("100%");
      expect(gp).not.toContain("$75");
      const terms = renderToStaticMarkup(<RentalTerms lang={lang} />);
      expect(terms).toContain(ownerText[lang].prereserveTitle);
      expect(terms).toContain("100%");
      expect(rentalTermsText[lang].sections[9]?.[1]).toBe(cancellationPolicy(lang));
      expect(rentalTermsText[lang].sections[10]?.[1]).toBe(ownerText[lang].prereserve);
      const faq = mainFaq(lang, {}, [], []).general;
      expect(faq.find(x => x.q === ownerText[lang].prereserveTitle)?.a).toBe(ownerText[lang].prereserve);
      expect(ownerText[lang].prereserve).not.toContain("US$ 75");
      expect(faq.filter(x => x.q !== ownerText[lang].prereserveTitle).some(x => /greater of.*75|maior valor.*75|mayor valor.*75/i.test(x.a))).toBe(false);
      expect(tr.checkout.holdNote1).toContain("100%");
      const stale = { en: "Pay remaining balance [balance] after approval", pt: "Pague o restante [balance] após aprovação", es: "Paga el saldo restante [balance] tras aprobación" };
      expect(currentPaymentMessage(lang, "approved", stale[lang])).toBe(tr.booking.approvedNoteFull);
      expect(currentPaymentMessage(lang, "expired", stale[lang])).toBe(tr.booking.refundedNote);
      expect(currentPaymentMessage(lang, "confirmed", "Custom safe confirmation")).toBe("Custom safe confirmation");
    });
  }
});

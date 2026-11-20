import { describe, expect, it } from "vitest";
import { substituteWaText } from "./i18n";

const base = { name: "Proprietario", orig: "BMW X3", sub: "Audi Q5", link: "https://oniccarrentals.com/pt/booking/abc" };
describe("substitute WhatsApp text", () => {
  it("states the extra to pay", () => expect(substituteWaText("en", { ...base, newTotal: 1200, difference: 200 })).toContain("Difference to pay: $200.00."));
  it("states the refund in PT", () => expect(substituteWaText("pt", { ...base, newTotal: 850.5, difference: -149.5 })).toContain("Reembolso para você: $149.50."));
  it("no difference in ES and links back to the booking page", () => {
    const t = substituteWaText("es", { ...base, newTotal: 1000, difference: 0 });
    expect(t).toContain("Sin diferencia de precio.");
    expect(t).toContain(base.link);
  });
});
describe("substitute WhatsApp text, full-payment wording, including legacy flags", () => {
  it("cheaper car states the refund without a rental balance", () => expect(substituteWaText("en", { ...base, newTotal: 971.28, difference: -511.2, balanceOnly: true })).toContain("Refund to you: $511.20."));
});

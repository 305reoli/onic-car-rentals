import { describe, expect, it } from "vitest";
import { cancellationPolicy, ownerText, rentalTermsText } from "./i18n";
import { mainFaq } from "./faqContent";
const faqHas = (l: "pt" | "en" | "es") => mainFaq(l, {} as never, [], []).general.some((x) => x.q === ownerText[l].prereserveTitle && x.a === ownerText[l].prereserve);

const PT_CANCEL = ["Cancelou em até 24 horas depois de reservar, e ainda faltam mais de 24 horas para a retirada: reembolso de 100%.", "Cancelou faltando mais de 48 horas para a retirada: reembolso de 75%.", "Cancelou faltando entre 24 e 48 horas para a retirada: reembolso de 40%.", "Cancelou faltando menos de 24 horas, no dia da retirada ou não compareceu: não há reembolso."].map((l) => `• ${l}`).join("\n");
describe("Cancellation + pre-reservation policies", () => {
  it("PT cancellation text is the owner's exact cleaned wording", () => expect(cancellationPolicy("pt")).toBe(PT_CANCEL));
  it("EN/ES cancellation lists are the owner's exact wording", () => {
    expect(cancellationPolicy("en").split("\n")).toEqual(["• Cancelled within 24 hours of booking, with more than 24 hours left before pickup: 100% refund.", "• Cancelled more than 48 hours before pickup: 75% refund.", "• Cancelled between 24 and 48 hours before pickup: 40% refund.", "• Cancelled less than 24 hours before pickup, on the pickup day, or no-show: no refund."]);
    expect(cancellationPolicy("es").split("\n")).toEqual(["• Cancelaste dentro de las 24 horas posteriores a la reserva, faltando más de 24 horas para la recogida: reembolso del 100%.", "• Cancelaste faltando más de 48 horas para la recogida: reembolso del 75%.", "• Cancelaste faltando entre 24 y 48 horas para la recogida: reembolso del 40%.", "• Cancelaste faltando menos de 24 horas, el día de la recogida o no te presentaste: sin reembolso."]);
  });
  it("duplicated last-minute sentence is gone in every language", () => {
    expect(cancellationPolicy("pt")).not.toMatch(/última hora/);
    expect(cancellationPolicy("en")).not.toMatch(/Last-minute/i);
    expect(cancellationPolicy("es")).not.toMatch(/última hora/);
  });
  it("rules unchanged: 100 / 75 / 40 / no refund", () => { for (const l of ["pt", "en", "es"] as const) for (const n of ["100%", "75%", "40%", "48", "24"]) expect(cancellationPolicy(l)).toContain(n); });
  it("pre-reservation is its own Terms section and FAQ entry, separate from cancellation", () => {
    for (const l of ["pt", "en", "es"] as const) {
      const sec = rentalTermsText[l].sections.find(([t]) => t === ownerText[l].prereserveTitle);
      expect(sec?.[1]).toBe(ownerText[l].prereserve);
      expect(faqHas(l)).toBe(true);
      expect(cancellationPolicy(l)).not.toContain("US$ 75");
      expect(ownerText[l].prereserve).not.toContain("US$ 75");
    }
    expect(ownerText.pt.prereserveTitle).toBe("Pré-reserva e pagamento integral");
    expect(ownerText.en.prereserveTitle).toBe("Pre-reservation and full payment");
    expect(ownerText.es.prereserveTitle).toBe("Pre-reserva y pago completo");
  });
});

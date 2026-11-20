import { describe, expect, it } from "vitest";
import { locLeg, locFee } from "./searchLocation";
import { convText } from "./i18n";
import { waMessage } from "./i18n";
import { hasRequiredDocs } from "@/services/booking-schema";
import { fmtDateLang } from "./dateFormat";

describe("conversion rules", () => {
  it("search MCO arrives as Orlando airport leg", () => expect(locLeg("mco", "orlando", null)).toEqual({ city: "orlando", type: "airport" }));
  it("search hotel arrives as address leg", () => expect(locLeg("hotel", "miami", null)?.type).toBe("address"));
  it("Orlando car searched at MCO (same place pickup+return) shows free delivery (MCO pair rule)", () => {
    const orlandoCar = { city: "orlando", body_category: "sedan" } as never;
    expect(locFee(orlandoCar, "mco", null)).toEqual({ type: "airport", fee: 0 });
  });
  it("Miami car searched at MIA is free (MIA pair rule)", () => {
    const miamiCar = { city: "miami", body_category: "sedan" } as never;
    expect(locFee(miamiCar, "mia", null)).toEqual({ type: "airport", fee: 0 });
  });
  it("Orlando car searched at an address keeps the per-leg fee", () => {
    const orlandoCar = { city: "orlando", body_category: "sedan" } as never;
    expect(locFee(orlandoCar, "hotel", null)).toEqual({ type: "address", fee: 40, upTo25: true });
  });
  it("free-delivery card label is localized", () => {
    expect(convText.en.locFree).toBe("{place}: Free");
    expect(convText.pt.locFree).toBe("{place}: Grátis");
    expect(convText.es.locFree).toBe("{place}: Gratis");
  });
  it("checkout WhatsApp text names car, dates, total and step (PT)", () =>
    expect(waMessage("pt", { kind: "checkout", car: "Jeep Compass", city: "Orlando", pickup: "2026-11-23T10:00", ret: "2026-11-27T10:00", total: 315.24, step: 1 }))
      .toBe("Olá! Estou reservando pelo site o Jeep Compass (Orlando), retirada 23/11/2026 10:00 → devolução 27/11/2026 10:00, total US$ 315,24. Travei na etapa de documentos e preciso de ajuda."));
  it("car WhatsApp text without search falls back to car + city", () => expect(waMessage("en", { kind: "car", car: "Jeep Compass", city: "Orlando" })).toBe("Hi! I'm on your website looking at the Jeep Compass in Orlando. Can you help me?"));
  it("submission requires the three documents (uploaded after payment)", () => { expect(hasRequiredDocs({})).toBe(false); expect(hasRequiredDocs({ licenseFront: "a", licenseBack: "b", passport: "c" })).toBe(true); });
  it("PT dates display dd/mm/aaaa", () => expect(fmtDateLang("2026-11-23", "pt")).toBe("23/11/2026"));
});

import { describe, expect, it } from "vitest";
import { carFaq, mainFaq } from "./faqContent";

const cities = [{ slug: "orlando", name: "Orlando", fleet_from_city: "orlando" }, { slug: "tampa", name: "Tampa", fleet_from_city: "orlando" }, { slug: "miami", name: "Miami", fleet_from_city: "miami" }];
const st = { payment_modes: { exotics: "full", sports: "full" }, prereservation_min_usd: 75 };

describe("GEO FAQ", () => {
  it("uses the owner's exact Pix / 12x sentence", () => {
    const f = mainFaq("en", st, cities, []);
    expect(f.general.some((x) => x.a.includes("Brazilians can pay with Pix or card in up to 12 installments when that option appears at checkout"))).toBe(true);
  });
  it("all cars pay 100% at booking", () => {
    const a = mainFaq("en", st, cities, []).general.find((x) => x.q === "How much do I pay when I book?")!.a;
    expect(a).not.toContain("$75");
    expect(a).toContain("100% of the rental total at booking");
  });
  it("car FAQ always states the effective minimum (category default when empty)", () => {
    const v = { name: "X", city: "orlando", body_category: "suv", is_convertible: false, seats: 7, bags: 4, security_deposit_usd: null, min_days: null };
    expect(carFaq("en", v, st, null, "orlando", "Orlando").find((x) => x.q.includes("deposit"))?.a).toBe("3-day minimum.");
    expect(carFaq("en", { ...v, body_category: "exotics" }, st, null, "orlando", "Orlando").find((x) => x.q.includes("deposit"))?.a).toBe("1-day minimum.");
    expect(carFaq("en", { ...v, min_days: 3 }, st, null, "orlando", "Orlando").find((x) => x.q.includes("deposit"))?.a).toBe("3-day minimum.");
  });
  it("Solid Waste question sits immediately after the tolls/insurance question with the owner's exact wording", () => {
    const tollQ = { en: "Are tolls and insurance included?", pt: "Pedágios e seguro estão inclusos?", es: "¿Los peajes y el seguro están incluidos?" };
    const swQ = { en: "What is the Solid Waste fee?", pt: "O que é a taxa Solid Waste?", es: "¿Qué es la tarifa Solid Waste?" };
    const swA = {
      en: "It is a mandatory Florida state surcharge on vehicle rentals: US$ 2 per day, charged only for the first 30 days of a rental. Onic Car Rentals simply collects this amount and remits it in full to the state — it is not part of the rental price. The fee appears as a separate line in your booking summary and is included in the tax calculation base.",
      pt: "É uma taxa estadual obrigatória da Flórida cobrada em locações de veículos: US$ 2 por dia, aplicada somente nos primeiros 30 dias da locação. A Onic Car Rentals apenas arrecada esse valor e o repassa integralmente ao estado — ele não faz parte do preço da locação. A taxa aparece como uma linha separada no resumo da reserva e entra na base de cálculo do imposto.",
      es: "Es un cargo estatal obligatorio de Florida sobre el alquiler de vehículos: US$ 2 por día, aplicado solo durante los primeros 30 días del alquiler. Onic Car Rentals solo recauda este monto y lo remite íntegramente al estado; no forma parte del precio del alquiler. El cargo aparece como una línea separada en el resumen de tu reserva y forma parte de la base de cálculo del impuesto.",
    };
    (["en", "pt", "es"] as const).forEach((lang) => {
      const g = mainFaq(lang, st, cities, []).general;
      const i = g.findIndex((x) => x.q === tollQ[lang]);
      expect(i).toBeGreaterThan(-1);
      expect(g[i + 1]?.q).toBe(swQ[lang]);
      expect(g[i + 1]?.a).toBe(swA[lang]);
    });
  });
});

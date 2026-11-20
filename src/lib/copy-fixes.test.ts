import { describe, expect, it } from "vitest";
import { ownerText, t } from "./i18n";

// Owner-ordered copy fixes (Nov 2026): ES footer privacy label + PT business-hours accents.
describe("footer and hours copy fixes", () => {
  it("labels the Spanish privacy link in Spanish, not Portuguese", () => {
    expect(t("es").footer.privacyPolicy).toBe("Política de Privacidad");
    expect(t("es").footer.privacyPolicy).not.toContain("Privacidade");
    expect(t("pt").footer.privacyPolicy).toBe("Política de Privacidade");
    expect(t("en").footer.privacyPolicy).toBe("Privacy Policy");
  });

  it("writes Portuguese business hours with the correct accents", () => {
    expect(ownerText.pt.hours).toBe("Horário de atendimento: 8h às 19h45 (ET)");
    expect(ownerText.pt.hours).not.toContain("Horario");
    expect(ownerText.pt.hours).not.toMatch(/\b8h as\b/);
  });

  it("keeps the hours line shared by footer, checkout and legal pages", () => {
    // Footer, checkout step 1 and the legal page all read ownerText[lang].hours.
    expect(ownerText.en.hours).toBe("Business hours: 8:00 AM - 7:45 PM ET");
    expect(ownerText.es.hours).toBe("Horario de atención: 8:00 a. m. - 7:45 p. m. (ET)");
  });
});

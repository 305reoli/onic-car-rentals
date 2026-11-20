import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { InsuranceUpload } from "./InsuranceUpload";
import { insuranceText, t } from "@/lib/i18n";
import { initialInsurance } from "@/lib/insurance";

const base = { onFile: vi.fn(), busy: false } as const;
const exp = {
  en: { phone: "Phone / WhatsApp (with country code)", q: "How do you want to cover the car?", ben: ["Sua Locadora coverage", "Already included in your total", "No documents to send."], own: ["Use my own insurance", "Upload required", "You upload your policy declarations and our team reviews them."] },
  pt: { phone: "Telefone / WhatsApp (com código do país)", q: "Como você quer cobrir o carro?", ben: ["Cobertura da Sua Locadora", "Já inclusa no total", "Você não precisa enviar nada."], own: ["Usar meu próprio seguro", "Requer envio", "Você envia as declarações da apólice e nossa equipe confere."] },
  es: { phone: "Teléfono / WhatsApp (con código de país)", q: "¿Cómo quieres cubrir el auto?", ben: ["Cobertura de Sua Locadora", "Ya incluida en tu total", "No necesitas enviar nada."], own: ["Usar mi propio seguro", "Se requiere envío", "Envías las declaraciones de la póliza y nuestro equipo las revisa."] },
} as const;

describe.each(["en", "pt", "es"] as const)("checkout polish (%s)", (lang) => {
  it("phone label", () => { expect(t(lang).checkout.phone).toBe(exp[lang].phone); });
  it("question title, two cards with chips, no Optional badge/note", () => {
    render(<InsuranceUpload lang={lang} choice={null} onChoice={vi.fn()} {...base} />);
    expect(screen.getByRole("heading").textContent).toBe(exp[lang].q);
    for (const k of ["ben", "own"] as const) { const card = screen.getByTestId(`insurance-option-${k}`); for (const s of exp[lang][k]) expect(card).toHaveTextContent(s); }
    const sec = screen.getByTestId("insurance-section");
    expect(sec).not.toHaveTextContent(insuranceText[lang].note);
    expect(sec.textContent).not.toMatch(/Opcional|Optional/);
  });
  it("upload hidden with Sua, shown with own insurance", () => {
    const { rerender } = render(<InsuranceUpload lang={lang} choice="ben" onChoice={vi.fn()} {...base} />);
    expect(screen.queryByTestId("insurance-own-upload")).toBeNull();
    rerender(<InsuranceUpload lang={lang} choice="own" onChoice={vi.fn()} {...base} />);
    expect(screen.getByTestId("insurance-own-upload")).toBeInTheDocument();
  });
});

describe("selection effect unchanged", () => {
  it("cards emit the same choice values as before", () => {
    const onChoice = vi.fn();
    render(<InsuranceUpload lang="pt" choice={null} onChoice={onChoice} {...base} />);
    fireEvent.click(screen.getByTestId("insurance-own")); fireEvent.click(screen.getByTestId("insurance-ben"));
    expect(onChoice.mock.calls).toEqual([["own"], ["ben"]]);
  });
  it("stored data per choice is unchanged", () => {
    expect(initialInsurance("own", "uploads/x/insurancePolicy.pdf")).toEqual({ insurance_choice: "own", insurance_status: "pending_review" });
    expect(initialInsurance("own", null)).toEqual({ insurance_choice: "own", insurance_status: null });
    expect(initialInsurance("ben", null)).toEqual({ insurance_choice: "ben", insurance_status: null });
  });
});

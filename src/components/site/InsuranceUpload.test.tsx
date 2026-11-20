import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { InsuranceUpload } from "./InsuranceUpload";
import { InsuranceReview } from "@/components/admin/InsuranceReview";
import { insuranceText } from "@/lib/i18n";
import { measureOneLink, usInsuranceFlow } from "@/lib/insurance";

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn(), createServerFn: () => ({ middleware: () => ({ inputValidator: () => ({ handler: () => vi.fn() }) }), inputValidator: () => ({ handler: () => vi.fn() }), handler: () => vi.fn() }) }));
vi.mock("@/services/admin.functions", () => ({ documentLinks: vi.fn(), updateInsuranceStatus: vi.fn() }));

const base = { choice: null, onChoice: vi.fn(), onFile: vi.fn(), busy: false } as const;

describe("RentalCover insurance-step notice", () => {
  const languages = ["en", "pt", "es"] as const;
  const paths = ["US", "foreign", "Brazil"] as const;
  const exact = {
    en: "After your payment and completed booking, you will get access to a link for RentalCover deductible protection.",
    pt: "Após o pagamento e a confirmação da reserva, você terá acesso a um link para a proteção de franquia da RentalCover.",
    es: "Después del pago y de la reserva completada, tendrá acceso a un enlace para la protección de franquicia de RentalCover.",
  };
  it.each(languages.flatMap((lang) => paths.map((path) => ({ lang, path }))))("$lang / $path: notice is text-only and never exposes the affiliate URL", ({ lang, path }) => {
    render(<InsuranceUpload lang={lang} usLicense={path === "US"} {...base} />);
    const notice = screen.getByTestId("insurance-rentalcover-notice");
    expect(notice.textContent).toBe(exact[lang]);
    expect(notice.closest('[data-testid="insurance-section"]')).not.toBeNull();
    expect(notice.matches("a, button, input, [href], [onclick], [role=button], [role=link], [tabindex], [contenteditable]")).toBe(false);
    expect(notice.querySelector("a, button, input, [href], [onclick], [role=button], [role=link], [tabindex], [contenteditable]")).toBeNull();
    expect(notice.closest("a, button, [role=button], [role=link]")).toBeNull();
    expect(screen.getByTestId("insurance-section").innerHTML).not.toContain("https://SEU_LINK_RENTALCOVER");
    expect(screen.getByTestId("insurance-section").querySelector('a[href*="rentalcover"], a[href*="seu-link-rentalcover.exemplo.com"]')).toBeNull();
  });
});

describe("US-license insurance (MeasureOne)", () => {
  const M1 = "https://link.measureone.com/abc";
  const exactPost = {
    en: "After payment and booking confirmation, you'll get a link to verify your own insurance.",
    pt: "Após o pagamento e a confirmação da reserva, você terá acesso a um link para verificar o seu próprio seguro.",
    es: "Después del pago y la confirmación de la reserva, tendrás acceso a un enlace para verificar tu propio seguro.",
  };
  it.each(["en", "pt", "es"] as const)("%s US: text-only post-payment notice, no button/modal/iframe/link", (lang) => {
    render(<InsuranceUpload lang={lang} usLicense measureOneUrl={measureOneLink(M1)} {...base} />);
    expect(screen.queryByTestId("insurance-ben")).toBeNull();
    expect(screen.getByTestId("insurance-measureone-postpayment-notice").textContent).toBe(exactPost[lang]);
    const section = screen.getByTestId("insurance-section");
    for (const id of ["insurance-verify", "insurance-modal", "measureone-frame", "measureone-newtab", "insurance-fallback"]) expect(screen.queryByTestId(id)).toBeNull();
    expect(section.querySelector("button, a, iframe, [role=dialog], [href]")).toBeNull();
    expect(section.innerHTML).not.toContain("measureone.com");
    expect(screen.getByTestId("insurance-rentalcover-notice")).toBeInTheDocument();
  });
  it("empty setting → direct upload fallback, no notice/button/iframe", () => {
    render(<InsuranceUpload lang="en" usLicense measureOneUrl={measureOneLink("")} {...base} />);
    expect(screen.getByTestId("insurance-fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("insurance-measureone-postpayment-notice")).toBeNull();
    expect(screen.queryByTestId("insurance-verify")).toBeNull();
    expect(document.querySelector("iframe, [role=dialog]")).toBeNull();
  });
  it("non-https link is ignored (falls back to upload)", () => {
    expect(measureOneLink("javascript:alert(1)")).toBeNull();
    expect(measureOneLink("http://x.com")).toBeNull();
  });
  it.each(["Brazil", "Portugal"])("non-US path (%s) unchanged: both options, no Verify button", () => {
    render(<InsuranceUpload lang="en" {...base} />);
    expect(screen.getByTestId("insurance-own")).toBeInTheDocument();
    expect(screen.getByTestId("insurance-ben")).toBeInTheDocument();
    expect(screen.queryByTestId("insurance-verify")).toBeNull();
  });
  it("records flow state; never invents completed", () => {
    expect(usInsuranceFlow(true, false, null)).toBe("not_provided");
    expect(usInsuranceFlow(true, true, null)).toBe("measureone_pending_after_payment");
    expect(usInsuranceFlow(true, true, "uploads/x/insurancePolicy.pdf")).toBe("fallback_uploaded");
    expect(usInsuranceFlow(false, true, null)).toBeNull();
  });
  it.each([["measureone_pending_after_payment", "Pending client verification (MeasureOne — sent after payment)"], ["measureone_started", "MeasureOne verification started"], ["fallback_uploaded", "Policy file uploaded (fallback)"], ["not_provided", "Not provided"]])("admin shows %s", (flow, label) => {
    render(<InsuranceReview r={{ id: "b1", documents: flow === "fallback_uploaded" ? { insurancePolicy: "uploads/x/insurancePolicy.pdf" } : {}, insurance_choice: "own", insurance_us_flow: flow }} />);
    expect(screen.getByTestId("insurance-us-flow")).toHaveTextContent(label);
  });
  it("admin: pending switches to existing status once verification data exists; review actions stay", () => {
    render(<InsuranceReview r={{ id: "b2", documents: { insurancePolicy: "uploads/x/insurancePolicy.pdf" }, insurance_choice: "own", insurance_status: "pending_review", insurance_us_flow: "measureone_pending_after_payment" }} />);
    expect(screen.queryByTestId("insurance-us-flow")).toBeNull();
    expect(screen.getByText(insuranceText.en.save)).toBeInTheDocument();
  });
  it("new strings exist in EN, PT and ES", () => {
    const keys = ["usTitle", "usNote", "postPaymentNotice", "flowPending", "m1Title", "m1Body", "m1Button", "m1Subject", "m1EmailBody", "adminFlow", "flowStarted", "flowFallback", "flowNone", "settingLabel", "settingHelp"] as const;
    for (const l of ["en", "pt", "es"] as const) for (const k of keys) expect(insuranceText[l][k], `${l}.${k}`).toBeTruthy();
  });
});

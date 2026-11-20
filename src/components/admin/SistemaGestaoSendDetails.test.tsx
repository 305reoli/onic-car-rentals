import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SistemaGestaoSendDetails, agreementTotalOf } from "./SistemaGestaoSendDetails";
describe("SistemaGestaoSendDetails agreement total", () => {
  it("shows agreement_total_cents in dollars instead of a dash", () => {
    const html = renderToStaticMarkup(<SistemaGestaoSendDetails lang="en" sends={[{ created_at: "2026-11-13T07:00:00Z", detail: { ok: true, agreement_number: "AGR-1", agreement_total_cents: 58788 } }]} />);
    expect(html).toContain("$587.88 USD");
    expect(agreementTotalOf({ agreement_total_cents: 0 })).toBe(0);
  });
  it("shows the mapped dollar total", () => {
    expect(renderToStaticMarkup(<SistemaGestaoSendDetails lang="pt" sends={[{ created_at: "2026-11-13T07:00:00Z", detail: { ok: true, agreement_total: 616 } }]} />)).toContain("$616.00 USD");
  });
});

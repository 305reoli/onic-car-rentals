import { describe, it, expect } from "vitest";
import { composeMeasureOneEmail } from "./measureone-email.server";

const LINK = "https://link.measureone.com/abc?x=1&y=2";
const b = { id: "11111111-2222", reference: "TEST-MEASUREONE-1", first_name: "Test", last_name: "Client", vehicle_name: "Toyota Corolla", photo: "/__l5e/cars/corolla.jpg", pickup_at: "2026-11-20T15:00:00Z", return_at: "2026-11-23T15:00:00Z", pickup_location: "Orlando Airport (MCO)", return_location: "Orlando Airport (MCO)" };
const cases = [["en", "Complete your insurance verification", "Verify my insurance", "Verify your auto insurance — Onic Car Rentals"], ["pt", "Complete a verificação do seu seguro", "Verificar meu seguro", "Verifique seu seguro de carro — Onic Car Rentals"], ["es", "Complete la verificación de su seguro", "Verificar mi seguro", "Verifique su seguro de auto — Onic Car Rentals"]] as const;

describe("MeasureOne branded email template", () => {
  it.each(cases)("%s: title, CTA, unchanged subject", (lang, title, cta, subject) => {
    const m = composeMeasureOneEmail(lang, b, LINK);
    expect(m.subject).toBe(subject);
    expect(m.html).toContain(title);
    expect(m.html).toMatch(new RegExp(`data-cta="measureone"[^>]*>${cta}</a>`));
  });
  it("table layout, color-scheme, 600px, orange header wordmark", () => {
    const { html } = composeMeasureOneEmail("en", b, LINK);
    expect(html).toContain('<meta name="color-scheme" content="dark light">');
    expect(html).toContain("max-width:600px");
    expect(html).toContain('role="presentation"');
    expect(html).toMatch(/color:#F15B26">ONIC/);
    expect(html).not.toMatch(/<link|@import|<style/);
  });
  it("one CTA whose href is the exact link; no naked URL in HTML", () => {
    const { html } = composeMeasureOneEmail("en", b, LINK);
    const esc = LINK.replace(/&/g, "&amp;");
    expect(html.match(/data-cta=/g)).toHaveLength(1);
    expect(html).toContain(`href="${esc}"`);
    const visible = html.replace(/<[^>]*>/g, " ");
    expect(visible).not.toContain("measureone.com/abc");
    expect(html.split("measureone.com/abc").length - 1).toBe(1);
  });
  it("booking card with absolute car photo and booking facts", () => {
    const { html } = composeMeasureOneEmail("en", b, LINK);
    expect(html).toContain('src="https://oniccarrentals.com/__l5e/cars/corolla.jpg?w=1200&amp;q=75"');
    for (const s of ["Toyota Corolla", "TEST-MEASUREONE-1", "Test Client", "Orlando Airport (MCO)", "Nov 20, 2026, 10:00 AM", "Nov 23, 2026, 10:00 AM"]) expect(html).toContain(s);
  });
  it("signature and footer", () => {
    const { html } = composeMeasureOneEmail("pt", b, LINK);
    for (const s of ["Onic Car Rentals — Equipe de Reservas", "WhatsApp +55 (65) 98404-6666", "+1 (954) 248-0903", "info@oniccarrentals.com", "oniccarrentals.com", "Orlando • Miami", "Reoli LLC"]) expect(html).toContain(s);
  });
  it("plain text carries the raw link and same facts", () => {
    const { text } = composeMeasureOneEmail("es", b, LINK);
    expect(text).toContain(`Verificar mi seguro: ${LINK}`);
    for (const s of ["Toyota Corolla", "TEST-MEASUREONE-1", "Test Client", "Orlando Airport (MCO)", "Reoli LLC", "+1 (954) 248-0903"]) expect(text).toContain(s);
  });
});

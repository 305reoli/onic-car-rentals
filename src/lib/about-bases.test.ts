import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
describe("About page address", () => {
  const src = readFileSync("src/lib/i18n.ts", "utf8");
  it("never lists placeholder addresses", () => { expect(src).not.toMatch(/Sua Rua|Sua Avenida/); });
  it("lists the Miami Beach address in EN/PT/ES", () => {
    for (const lead of ["Our address is", "Nosso endereço é", "Nuestra dirección es"]) {
      const line = src.slice(src.indexOf(lead), src.indexOf(lead) + 80);
      expect(line).toContain("1000 Lincoln Rd, Miami Beach, FL 33139");
    }
  });
});

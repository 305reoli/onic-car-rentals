import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
describe("About page bases", () => {
  const src = readFileSync("src/lib/i18n.ts", "utf8");
  it("never lists SuaRua or Sua Avenida as bases", () => { expect(src).not.toMatch(/SuaRua|Sua Avenida/); });
  it("lists both real bases in EN/PT/ES", () => {
    for (const lead of ["Our bases are at", "Nossas bases ficam em", "Nuestras bases están en"]) {
      const line = src.slice(src.indexOf(lead), src.indexOf(lead) + 200);
      expect(line).toContain("789 Sua Rua, Orlando, FL"); expect(line).toContain("321 Sua Avenida, Miami Beach, FL");
    }
  });
});

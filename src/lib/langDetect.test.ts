import { describe, expect, it } from "vitest";
import { detectLang } from "./langDetect";
describe("Portuguese primary at bare root", () => {
  for (const hints of [{}, { acceptLanguage: "es-MX", country: "MX" }, { acceptLanguage: "en-US", country: "US" }, { cookie: "es" }, { cookie: "en", acceptLanguage: "en-US" }, { userAgent: "Googlebot" }]) {
    it(`serves pt with ${JSON.stringify(hints)}`, () => expect(detectLang(hints)).toBe("pt"));
  }
});

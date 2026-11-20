import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { insuranceExplanation, rentalTermsText, t, LANGS } from "./i18n";
import { faqText } from "./faqContent";

const BAD = /deductible|deducible|franquia|franquicia|US\$ ?1[.,]500|US\$ ?2[.,]500/i;
const car = readFileSync("src/routes/$lang.cars.$city.$slug.tsx", "utf8");
const checkout = readFileSync("src/routes/$lang.checkout.$city.$slug.tsx", "utf8");

describe("deductible removed from public pages", () => {
  it("car page renders no deductible, keeps deposit/min age/min days", () => {
    expect(car).not.toMatch(/insuranceDeductible|\.deductible\b/);
    expect(car).toMatch(/tr\.car\.deposit/); expect(car).toMatch(/tr\.car\.minAge/); expect(car).toMatch(/tr\.car\.minDays/);
  });
  it("checkout summary renders no deductible line", () => {
    expect(checkout).not.toMatch(/insuranceDeductible|sum-deductible/);
  });
  for (const lang of LANGS) {
    it(`${lang} FAQ insurance answer has no deductible`, () => {
      expect(insuranceExplanation(lang)).not.toMatch(BAD);
      expect(JSON.stringify(faqText(lang))).not.toMatch(BAD);
    });
    it(`${lang} Terms have no deductible`, () => {
      expect(JSON.stringify(rentalTermsText[lang as keyof typeof rentalTermsText])).not.toMatch(BAD);
      expect(JSON.stringify(t(lang).car)).not.toMatch(/franquia|deductible|deducible/i);
      expect(t(lang).car.deposit).toBeTruthy(); expect(t(lang).car.minAge).toBeTruthy(); expect(t(lang).car.minDays).toBeTruthy();
    });
  }
});

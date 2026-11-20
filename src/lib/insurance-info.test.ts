import { describe, expect, it } from "vitest";
import { insuranceInfoRules as rules } from "./i18n";
describe("published insurance mechanism (information only)", () => {
  it("basic $10/day", () => expect(rules.basicDailyUsd).toBe(10));
  it("regular deductible $1500", () => expect(rules.regularDeductibleUsd).toBe(1500));
  it("premium/sports/exotic deductible $2500", () => expect(rules.premiumDeductibleUsd).toBe(2500));
  it("card coverage only regular", () => expect(rules.cardRegularOnly).toBe(true));
  it("written signed decline required", () => expect(rules.requiresWrittenDecline).toBe(true));
  it("entire rental same card", () => expect(rules.requiresEntireRentalSameCard).toBe(true));
  it("primary driver card", () => expect(rules.requiresPrimaryDriverCard).toBe(true));
  it("deposit same card", () => expect(rules.requiresDepositSameCard).toBe(true));
  it("issuer letter before pickup", () => expect(rules.requiresIssuerLetterBeforePickup).toBe(true));
  it("basic and card cannot combine", () => expect(rules.canCombineBasicAndCard).toBe(false));
  it("card liability excluded", () => expect(rules.cardLiabilityIncluded).toBe(false));
  it("client handles claim", () => expect(rules.customerHandlesCardClaim).toBe(true));
  it("supplemental document required", () => expect(rules.supplementalPolicyRequired).toBe(true));
  it("supplemental is not Sua contract", () => expect(rules.supplementalContractWithRentalCompany).toBe(false));
});

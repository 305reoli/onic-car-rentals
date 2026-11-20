import { describe, expect, it } from "vitest";
import { insuranceDeductible, insuranceDeductibleAmount, defaultRegularDeposit, carMileageLine, carSpecs, filterFleet } from "./vehicles";
import { CALL_PHONE, ownerText } from "./i18n";
import { publicPath, internalPath } from "./publicRoutes";
const car = { name: "Toyota Corolla", body_category: "sedan", daily_price_usd: 55, security_deposit_usd: null };
describe("owner car rules", () => {
  it("cheapest regular empty deposit is $150", () => expect(defaultRegularDeposit(car)).toBe(150));
  it("mid tier empty deposit is $250", () => expect(defaultRegularDeposit({ ...car, daily_price_usd: 159 })).toBe(250));
  for (const name of ["Porsche Macan", "BMW X3", "BMW X5"]) it(`${name} empty deposit is $250`, () => expect(defaultRegularDeposit({ ...car, name })).toBe(250));
  it("preserves already set $200 X3 deposit", () => expect(defaultRegularDeposit({ ...car, name: "BMW X3", security_deposit_usd: 200 })).toBe(200));
  for (const body_category of ["sports", "exotics"]) {
    it(`${body_category} empty deposit remains empty`, () => expect(defaultRegularDeposit({ ...car, body_category })).toBeNull());
    it(`${body_category} existing deposit unchanged`, () => expect(defaultRegularDeposit({ ...car, body_category, security_deposit_usd: 2000 })).toBe(2000));
  }
  it("regular is unlimited in Florida", () => expect(carMileageLine({ body_category: "suv", mileage_limit: "100" }, "en")).toBe("Unlimited mileage in Florida"));
  it("exotic shows actual 100 miles/day plus $7 overage", () => expect(carMileageLine({ body_category: "exotics", mileage_limit: "100" }, "en")).toBe("100 miles/day · extra miles US$ 7/mile"));
  it("sports preserves actual 200 mile allowance", () => expect(carMileageLine({ body_category: "sports", mileage_limit: "200 mi/day" }, "en")).toBe("200 mi/day · extra miles US$ 7/mile"));
  it("does not invent missing allowance", () => expect(carMileageLine({ body_category: "sports", mileage_limit: "" }, "en")).toBe("extra miles US$ 7/mile"));
  it("no absent specs invented", () => expect(carSpecs({ hp: null, color: "", transmission: "" }, "en")).toEqual([]));
  it("only stored specs", () => expect(carSpecs({ hp: 670, color: "Red", transmission: "Automatic" }, "en")).toEqual([["Horsepower", "670 hp"], ["Color", "Red"], ["Transmission", "Automatic"]]));
  it("call line separate from WhatsApp", () => expect(CALL_PHONE).toBe("+19542480903"));
  it("hours end 19:45 ET", () => expect(ownerText.en.hours).toBe("Business hours: 8:00 AM - 7:45 PM ET"));
  for (const lang of ["en", "pt", "es"] as const) it(`${lang} cancellation page resolves`, () => expect(internalPath(publicPath(lang, "cancellation"))).toBe(`/${lang}/cancellation`));
});
describe("fleet controls", () => {
  const cars = [{ seats: 5, daily_price_usd: 99 }, { seats: 7, daily_price_usd: 55 }, { seats: 7, daily_price_usd: 150 }, { seats: 7, daily_price_usd: null }];
  it("seats is minimum capacity", () => expect(filterFleet(cars, "7", "default")).toEqual(cars.slice(1)));
  it("ascending price with unknown last", () => expect(filterFleet(cars, "", "asc").map(v=>v.daily_price_usd)).toEqual([55,99,150,null]));
  it("descending price with unknown last", () => expect(filterFleet(cars, "", "desc").map(v=>v.daily_price_usd)).toEqual([150,99,55,null]));
});

describe("insurance deductible display", () => {
  it("standard car $1500", () => expect(insuranceDeductible(car)).toBe(1500));
  it("regular SUV $1500", () => expect(insuranceDeductible({ name: "Jeep Compass", body_category: "suv" })).toBe(1500));
  for (const name of ["Porsche Macan", "BMW X3", "BMW X5", "Chevrolet Tahoe", "Ford Expedition"]) it(`${name} premium $2500`, () => expect(insuranceDeductible({ name, body_category: "suv" })).toBe(2500));
  for (const body_category of ["luxury", "sports", "exotics"]) it(`${body_category} $2500`, () => expect(insuranceDeductible({ name: "Car", body_category })).toBe(2500));
  it("preserves specific admin override $1800", () => expect(insuranceDeductible({ ...car, insurance_deductible_usd: 1800 })).toBe(1800));
  it("preserves explicit zero deductible", () => expect(insuranceDeductible({ ...car, insurance_deductible_usd: 0 })).toBe(0));
  it("EN USD format", () => expect(insuranceDeductibleAmount(car, "en")).toBe("US$ 1,500"));
  it("PT USD format", () => expect(insuranceDeductibleAmount(car, "pt")).toBe("US$ 1.500"));
});

describe("per-unit extra-mile price", () => {
  const cyber = { body_category: "exotics", mileage_limit: "200 mi/day", extra_mile_price_usd: 2 };
  it("Cybertruck EN", () => expect(carMileageLine(cyber, "en")).toBe("200 mi/day · extra miles US$ 2/mile"));
  it("Cybertruck PT", () => expect(carMileageLine(cyber, "pt")).toBe("200 milhas/dia · milhas extras US$ 2/milha"));
  it("Cybertruck ES", () => expect(carMileageLine(cyber, "es")).toBe("200 millas/día · millas extra US$ 2/milla"));
  it("other exotic keeps US$ 7", () => expect(carMileageLine({ body_category: "exotics", mileage_limit: "150 mi/day", extra_mile_price_usd: null }, "en")).toBe("150 mi/day · extra miles US$ 7/mile"));
});

describe("mileage line localized when stored as '100 mi/day'", () => {
  const v = { body_category: "sports", mileage_limit: "100 mi/day" };
  it("PT", () => expect(carMileageLine(v, "pt")).toBe("100 milhas/dia · milhas extras US$ 7/milha"));
  it("ES", () => expect(carMileageLine(v, "es")).toBe("100 millas/día · millas extra US$ 7/milla"));
  it("EN", () => expect(carMileageLine(v, "en").startsWith("100 mi/day")).toBe(true));
});

describe("Orlando 718 Cayman and Corvette C8 mileage (stored '100 mi/day')", () => {
  for (const name of ["Porsche 718 Cayman", "Chevrolet Corvette C8"]) {
    const v = { body_category: "sports", mileage_limit: "100 mi/day" };
    it(`${name} PT/ES have no mi/day`, () => {
      expect(carMileageLine(v, "pt")).not.toContain("mi/day");
      expect(carMileageLine(v, "es")).not.toContain("mi/day");
      expect(carMileageLine(v, "en")).toBe("100 mi/day · extra miles US$ 7/mile");
    });
  }
});

import { describe, expect, it } from "vitest";
import { carJsonLd, orgJsonLd, businessAddresses, addressLine } from "./seo";
const car = { name: "Cadillac Escalade ESV", brand: "Cadillac", model: "Escalade ESV", photos: [], city: "miami", daily_price_usd: 399, seats: 7, doors: 4, hp: 420, transmission: "Automatic", color: "Black" };
describe("machine-readable real rental data", () => {
  it.each([["Cadillac Escalade ESV", 399], ["Cadillac Escalade ESV 600", 499]] as const)("keeps the exact %s daily rate", (name, price) => {
    const schema = carJsonLd({ ...car, name, daily_price_usd: price }, "https://oniccarrentals.com/car", "Miami");
    expect(schema["@type"]).toBe("Car");
    expect(schema.offers?.price).toBe(price);
    expect(schema.offers?.priceSpecification).toEqual({ "@type": "UnitPriceSpecification", price, priceCurrency: "USD", unitText: "DAY" });
    expect(schema.offers?.availableAtOrFrom.name).toBe("Miami");
  });
  it("uses only the supplied specs and makes no dated availability claim", () => {
    const schema = carJsonLd(car, "https://oniccarrentals.com/car", "Miami");
    expect(schema.seatingCapacity).toBe(7); expect(schema.numberOfDoors).toBe(4);
    expect(schema.vehicleEngine?.enginePower.value).toBe(420);
    expect(schema.offers).not.toHaveProperty("availability");
    const empty = carJsonLd({ ...car, hp: null, seats: null, daily_price_usd: null }, "u", "Miami");
    expect(empty).not.toHaveProperty("offers"); expect(empty).not.toHaveProperty("vehicleEngine");
  });
  it("marks the business as founded in 2014 with Brazilian Portuguese service", () => {
    const business = orgJsonLd([]);
    expect(business.foundingDate).toBe("2014"); expect(business.knowsLanguage).toContain("pt-BR");
  });
});

describe("confirmed addresses override historical placeholders in public summaries", () => {
  it("shows the real Hazeltine and Lincoln addresses without changing settings", () => {
    const addresses = businessAddresses({ orlando: { address: "123 Sua Rua, Orlando, FL 00000" }, miami: { address: "456 Sua Avenida, Miami Beach, FL 00000" } });
    expect(addresses.map(addressLine)).toEqual(["5461 Hazeltine National Dr, Orlando, FL 32812", "1000 Lincoln Rd, Miami Beach, FL 33139"]);
  });
});

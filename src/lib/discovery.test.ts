import { describe, it, expect } from "vitest";
import { discoveryGroups, lowestDaily, landingFleet, type CatalogCar } from "./discovery";
import { publicPath, internalPath } from "./publicRoutes";
import { equivalentPath, legacyPtRedirect } from "./publicRoutes";
const car = (id: string, city = "miami", active = true): CatalogCar => ({ id, city, active, name: "Lamborghini Huracán", brand: "Lamborghini", model: "Huracán Evo Spyder", slug: id, body_category: "exotics", is_convertible: true, daily_price_usd: 899 });
describe("PT catalog pages", () => {
  it("keeps both active units in one city without mixing another city", () => {
    const group = discoveryGroups([car("one"), car("two"), car("other", "orlando"), car("inactive", "miami", false)]).find((g) => g.kind === "model" && g.city === "miami");
    expect(group?.ids).toEqual(["one", "two"]);
  });
  it("does not generate empty groups", () => expect(discoveryGroups([car("inactive", "miami", false)])).toEqual([]));
  it("uses only the lowest stored daily price and ignores missing prices", () => expect(lowestDaily([{ daily_price_usd: 549 }, { daily_price_usd: 899 }, { daily_price_usd: null }])).toBe(549));
  it("returns no invented price when all are missing", () => expect(lowestDaily([{ daily_price_usd: null }])).toBeNull());
  it("uses premium for Luxury and exoticos for Exotics", () => {
    expect(publicPath("pt", "orlando/luxury")).toBe("/aluguel-de-carros-premium-em-orlando");
    expect(internalPath("/aluguel-de-carros-exoticos-em-miami")).toBe("/pt/miami/exotics");
  });
  it("normalizes accented model slugs", () => expect(discoveryGroups([car("one")]).find((g) => g.kind === "model")?.key).toBe("lamborghini-huracan-evo-spyder"));
  it("Tampa uses Orlando and excludes cross-city exotics", () => {
    const standard = { ...car("standard", "orlando"), body_category: "suv" };
    expect(landingFleet([standard, car("exotic", "orlando"), car("miami")], { slug: "tampa", fleet_from_city: "orlando" }, null).map((v) => v.id)).toEqual(["standard"]);
  });
  it("Fort Lauderdale keeps Miami exotics for base pickup only", () => expect(landingFleet([car("miami"), car("orlando", "orlando")], { slug: "fort-lauderdale", fleet_from_city: "miami" }, null).map((v) => v.id)).toEqual(["miami"]));
  it("preserves prior category addresses by a permanent target", () => expect(legacyPtRedirect("/aluguel-de-carros-de-luxo-em-miami/exotics")).toBe("/aluguel-de-carros-exoticos-em-miami"));
  it("maps untranslated model pages to their city in the switcher", () => expect(equivalentPath("/aluguel-de-ferrari-portofino-em-miami", "en")).toBe("/en/miami"));
  it("does not swallow unmatched child paths during rewrite", () => expect(internalPath("/aluguel-de-ferrari-portofino-em-miami/unknown")).toBe("/aluguel-de-ferrari-portofino-em-miami/unknown"));
});
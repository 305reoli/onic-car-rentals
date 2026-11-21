import { describe, expect, it } from "vitest";
import { activeLegacyTarget, legacyCarTarget } from "./aeo";
import { equivalentPath, internalPath, publicPath } from "./publicRoutes";

const cars = [{ active: true, city: "orlando", slug: "porsche-macan" }, { active: true, city: "miami", slug: "porsche-macan" }];
const cities = [{ slug: "orlando", fleet_from_city: "orlando" }, { slug: "miami", fleet_from_city: "miami" }];
describe("SEO/AEO clean URL rules", () => {
  it("resolves the supplied legacy Porsche Macan URL to its clean Orlando page", () => {
    expect(legacyCarTarget(new URL("https://oniccarrentals.com/?carros-2=porsche-macan"), cars, cities)).toBe("/carros/orlando/porsche-macan");
  });
  it("uses the matching city hub when a legacy model is absent", () => {
    expect(legacyCarTarget(new URL("https://oniccarrentals.com/?carros-2=missing&city=miami"), cars, cities)).toBe("/aluguel-de-carros-de-luxo-em-miami");
  });
  it("does not intercept clean car or transaction URLs", () => {
    expect(legacyCarTarget(new URL("https://oniccarrentals.com/pt/checkout/orlando/porsche-macan?carros-2=porsche-macan"), cars, cities)).toBeNull();
    expect(legacyCarTarget(new URL("https://oniccarrentals.com/carros/orlando/porsche-macan"), cars, cities)).toBeNull();
  });
  it("maps the exact requested institutional URLs in all languages", () => {
    expect(publicPath("pt", "about")).toBe("/quem-somos");
    expect(publicPath("en", "about")).toBe("/en/about");
    expect(publicPath("es", "about")).toBe("/es/quienes-somos");
    expect(publicPath("pt", "reviews")).toBe("/depoimentos");
    expect(publicPath("en", "reviews")).toBe("/en/reviews");
    expect(publicPath("es", "reviews")).toBe("/es/testimonios");
  });
  it("maps Ferrari Orlando and Porsche Miami hubs to translated clean equivalents", () => {
    expect(publicPath("pt", "brand-hub/orlando/ferrari")).toBe("/ferrari-em-orlando");
    expect(internalPath("/porsche-em-miami")).toBe("/pt/brand-hub/miami/porsche");
    expect(equivalentPath("/ferrari-em-orlando", "en")).toBe("/en/ferrari-in-orlando");
    expect(equivalentPath("/porsche-em-miami", "es")).toBe("/es/porsche-en-miami");
  });
});
describe("known legacy links after fleet changes", () => {
  const current = [{ active: true, city: "miami", slug: "cadillac-escalade-esv", brand: "Cadillac" }];
  it("sends a retired car target to the live fleet", () => expect(activeLegacyTarget("/en/cars/orlando/cadillac-escalade", current)).toBe("/en/fleet"));
  it("preserves the actual current car URL", () => expect(activeLegacyTarget("/carros/miami/cadillac-escalade-esv", current)).toBe("/carros/miami/cadillac-escalade-esv"));
  it("does not send old brand links into an empty Orlando hub", () => expect(activeLegacyTarget("/en/cadillac-in-orlando", current)).toBe("/en/fleet"));
});

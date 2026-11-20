import { describe, expect, it } from "vitest";
import { equivalentPath, internalPath, legacyPtRedirect, publicPath } from "./publicRoutes";

describe("Portuguese public URL architecture", () => {
  const pages = [["", "/"], ["orlando", "/aluguel-de-carros-de-luxo-em-orlando"], ["miami", "/aluguel-de-carros-de-luxo-em-miami"], ["tampa", "/aluguel-de-carros-de-luxo-em-tampa"], ["fort-lauderdale", "/aluguel-de-carros-de-luxo-em-fort-lauderdale"], ["fleet", "/frota"], ["how-it-works", "/como-funciona"], ["faq", "/perguntas-frequentes"], ["catalog", "/catalogo"], ["search", "/buscar"], ["terms", "/termos"], ["privacy", "/privacidade"], ["cancellation", "/cancelamento"], ["legal", "/informacoes-legais"], ["cars/miami/ferrari-portofino", "/carros/miami/ferrari-portofino"]];
  it.each(pages)("maps %s to %s", (page, url) => {
    expect(publicPath("pt", page)).toBe(url);
    expect(internalPath(url)).toBe(`/pt${page ? `/${page}` : ""}`);
    expect(legacyPtRedirect(`/pt${page ? `/${page}` : ""}`)).toBe(url);
    expect(equivalentPath(url, "en")).toBe(`/en${page ? `/${page}` : ""}`);
    expect(equivalentPath(`/es${page ? `/${page}` : ""}`, "pt")).toBe(url);
  });
  it.each(["checkout/miami/ferrari-portofino", "booking/token", "booking", "my-booking", "payment/return", "payments/callback"])("preserves transaction %s", (page) => {
    expect(publicPath("pt", page)).toBe(`/pt/${page}`);
    expect(legacyPtRedirect(`/pt/${page}`)).toBeNull();
    expect(internalPath(`/pt/${page}`)).toBe(`/pt/${page}`);
  });
  it("maps category parent routes", () => {
    expect(publicPath("pt", "orlando/suv")).toBe("/aluguel-de-carros-suv-em-orlando");
    expect(publicPath("pt", "catalog/orlando/suv")).toBe("/catalogo/orlando/suv");
  });
});
import { legacyOldSiteRedirect } from "./publicRoutes";
describe("old-site 301 redirects", () => {
  it("exact car EN and PT", () => {
    expect(legacyOldSiteRedirect("/vehicles/jeep-compass-orlando")).toBe("/en/cars/orlando/jeep-compass");
    expect(legacyOldSiteRedirect("/pt-BR/vehicles/jeep-compass-orlando/")).toBe("/carros/orlando/jeep-compass");
    expect(legacyOldSiteRedirect("/vehicles/chevrolet-corvette-c8-convertible-yellow-black")).toBe("/en/cars/miami/chevrolet-corvette-c8-yellow");
  });
  it("city page", () => {
    expect(legacyOldSiteRedirect("/rent-a-car/orlando")).toBe("/en/orlando");
    expect(legacyOldSiteRedirect("/pt-BR/rent-a-car/miami")).toBe("/aluguel-de-carros-de-luxo-em-miami");
  });
  it("about and fleet", () => {
    expect(legacyOldSiteRedirect("/about/")).toBe("/en/about");
    expect(legacyOldSiteRedirect("/pt-BR/about")).toBe("/quem-somos");
    expect(legacyOldSiteRedirect("/vehicles")).toBe("/en/fleet");
    expect(legacyOldSiteRedirect("/pt-BR/vehicles")).toBe("/frota");
    expect(legacyOldSiteRedirect("/pt-BR")).toBe("/");
  });
  it("discontinued car goes to the homepage", () => {
    expect(legacyOldSiteRedirect("/vehicles/mclaren-570s-orlando")).toBe("/en");
    expect(legacyOldSiteRedirect("/pt-BR/vehicles/ferrari-488-gtb-orlando")).toBe("/");
  });
  it("McLaren brand page goes to the homepage; others to Orlando hub", () => {
    expect(legacyOldSiteRedirect("/brands/mclaren")).toBe("/en");
    expect(legacyOldSiteRedirect("/pt-BR/brands/mclaren")).toBe("/");
    expect(legacyOldSiteRedirect("/brands/ferrari")).toBe("/en/ferrari-in-orlando");
    expect(legacyOldSiteRedirect("/pt-BR/brands/ferrari")).toBe("/ferrari-em-orlando");
  });
  it("leaves /privacidade and new URLs alone", () => {
    expect(legacyOldSiteRedirect("/privacidade")).toBeNull();
    expect(legacyOldSiteRedirect("/")).toBeNull();
    expect(legacyOldSiteRedirect("/en/about")).toBeNull();
  });
});

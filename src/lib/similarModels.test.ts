import { describe, it, expect } from "vitest";
import { similarModels, showSimilarModels, similarCardLink, similarFleetLink } from "./similarModels";
import { bookingSearch } from "./search";
import { similarModelsText, LANGS } from "./i18n";
import { isUnavailable } from "./pricing";
import type { Vehicle } from "./vehicles";

const car = (id: string, extra: Partial<Vehicle> = {}) => ({ id, city: "orlando", body_category: "suv", active: true, name: id, slug: id, daily_price_usd: 100, blocked_dates: [], ...extra }) as Vehicle;
const current = car("current");
const search = { pickup: "2026-12-10T10:30", ret: "2026-12-13T11:45", city: "orlando", loc: "mco", type: "suv" };
describe("similar models on unavailable dates", () => {
  it("appears only with two selected dates and the actual booked-date issue", () => {
    expect(showSimilarModels(search.pickup, search.ret, true)).toBe(true);
    expect(showSimilarModels(search.pickup, search.ret, false)).toBe(false);
    expect(showSimilarModels(undefined, undefined, true)).toBe(false);
    expect(showSimilarModels(search.pickup, undefined, true)).toBe(false);
  });
  it("matches exact category/city, excludes current/inactive and shared availability failures, sorts prices", () => {
    const fleet = [current, car("high", { daily_price_usd: 150 }), car("low", { daily_price_usd: 80 }), car("other-city", { city: "miami" }), car("other-cat", { body_category: "sports" }), car("inactive", { active: false }), car("blocked", { blocked_dates: ["2026-12-11"] }), car("booked")];
    const rows = [{ vehicle_id: "booked", status: "confirmed", pickup_at: "2026-12-11T10:30", return_at: "2026-12-14T11:45" }];
    const unavailable = fleet.filter(v => isUnavailable(v.blocked_dates, rows.filter(r => r.vehicle_id === v.id), search.pickup, search.ret)).map(v => v.id);
    expect(similarModels(fleet, current, unavailable).map(v => v.id)).toEqual(["low", "high"]);
  });
  it("uses exact times from shared availability instead of inventing overlaps", () => {
    const v = car("later");
    const rows = [{ status: "confirmed", pickup_at: search.ret, return_at: "2026-12-15T11:45" }];
    const ids = isUnavailable([], rows, search.pickup, search.ret) ? [v.id] : [];
    expect(similarModels([v], current, ids).map(v => v.id)).toEqual(["later"]);
  });
  it("fails closed before availability resolves and supplies empty state when no matches remain", () => {
    expect(similarModels([car("candidate")], current, undefined)).toEqual([]);
    expect(similarModels([current, car("blocked")], current, ["blocked"])).toEqual([]);
  });
  it("card links preserve dates, times, city and location", () => {
    const link = similarCardLink("pt", car("next"), search);
    expect(link.params).toEqual({ lang: "pt", city: "orlando", slug: "next" });
    expect(link.search).toMatchObject(search);
    expect(bookingSearch(link.search)).toMatchObject(search);
  });
  it("fleet link carries same category/city/dates and strict original-car exclusion", () => {
    const link = similarFleetLink("es", current, search);
    expect(link.to).toBe("/$lang/catalog/$city/$category");
    expect(link.params).toEqual({ lang: "es", city: "orlando", category: "suv" });
    expect(bookingSearch(link.search)).toEqual({ ...search, similarTo: "current" });
  });
  it("has every new label and empty/error state in all three languages", () => {
    for (const lang of LANGS) expect(Object.keys(similarModelsText[lang]).sort()).toEqual(["button", "empty", "error", "heading"]);
    expect(similarModelsText.en.heading).toBe("Similar models");
    expect(similarModelsText.pt.button).toBe("Ver modelos similares");
    expect(similarModelsText.es.empty).toBe("No hay modelos similares disponibles para estas fechas.");
  });
});
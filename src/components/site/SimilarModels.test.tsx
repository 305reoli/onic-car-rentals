import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { SimilarModels, SelectedDateSimilarModels } from "./SimilarModels";
import { similarModelsText } from "@/lib/i18n";
import type { Vehicle } from "@/lib/vehicles";
import { isUnavailable } from "@/lib/pricing";
import type { BookingSearch } from "@/lib/search";

let fleet: Vehicle[] = [];
let unavailable: string[] = [];
vi.mock("@tanstack/react-query", () => ({ queryOptions: (options: unknown) => options, useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === "vehicles" ? fleet : unavailable }) }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children, to, params, search }: { children: React.ReactNode; to: string; params: Record<string, string>; search: Record<string, unknown> }) => {
  const path = to.replace(/\$(\w+)/g, (_, key: string) => params[key] ?? "");
  const query = new URLSearchParams(Object.entries(search).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
  return <a href={`${path}?${query}`}>{children}</a>;
} }));
vi.mock("./CarCard", () => ({ PriceTag: () => null }));
const current = { id: "only-car", active: true, city: "orlando", body_category: "sports" } as Vehicle;
describe("similar models empty results", () => {
  it.each(["en", "pt", "es"] as const)("renders the empty state without cards and keeps the catalog link in %s", lang => {
    fleet = [current]; unavailable = [current.id];
    const { container, unmount } = render(<SimilarModels current={current} search={{ pickup: "2026-12-10T10:00", ret: "2026-12-13T10:00" }} lang={lang} settings={{}} />);
    expect(screen.getByTestId("similar-empty").textContent).toBe(similarModelsText[lang].empty);
    expect(container.querySelectorAll('[data-testid="similar-card"]').length).toBe(0);
    expect(screen.getByRole("link").textContent).toBe(similarModelsText[lang].button);
    unmount();
  });
});

describe("explicit car-panel dates without URL parameters", () => {
  const car = (id: string, extra: Partial<Vehicle> = {}) => ({ ...current, id, name: id, slug: id, photos: [], daily_price_usd: 100, blocked_dates: [], ...extra }) as Vehicle;
  const bookedCar = car("cadillac-escalade", { body_category: "luxury", blocked_dates: ["2026-11-16"] });
  const picked = { pickup: "2026-11-15T10:00", ret: "2026-11-18T10:00", loc: "mco" };
  function Panel({ suggested = false }: { suggested?: boolean }) {
    const [search, setSearch] = useState<BookingSearch>(suggested ? picked : {});
    const [selected, setSelected] = useState(false);
    const blocked = !!search.pickup && !!search.ret && isUnavailable(bookedCar.blocked_dates, [], search.pickup, search.ret);
    return <><input aria-label="Pick blocked dates" type="checkbox" onChange={() => { setSearch(picked); setSelected(true); }} /><input aria-label="Pick available dates" type="checkbox" onChange={() => { setSearch({ ...picked, pickup: "2026-12-10T10:00", ret: "2026-12-13T10:00" }); setSelected(true); }} /><SelectedDateSimilarModels datesSelected={selected} bookedIssue={blocked} current={bookedCar} search={search} lang="en" settings={{}} /></>;
  }
  it("shows available same-city/category alternatives after in-page picking and carries the exact dates/times/location to both links", () => {
    fleet = [bookedCar, car("available", { body_category: "luxury" }), car("blocked", { body_category: "luxury" }), car("wrong-city", { city: "miami", body_category: "luxury" }), car("wrong-category")];
    unavailable = [bookedCar.id, "blocked"];
    const { unmount } = render(<Panel />);
    expect(screen.queryByTestId("similar-models")).toBeNull();
    fireEvent.click(screen.getByLabelText("Pick blocked dates"));
    expect(screen.getAllByTestId("similar-card")).toHaveLength(1);
    const links = screen.getAllByRole("link").map(link => new URL(link.getAttribute("href") ?? "", "https://oniccarrentals.com"));
    expect(links.map(link => link.pathname)).toEqual(["/en/cars/orlando/available", "/en/catalog/orlando/luxury"]);
    for (const link of links) expect(Object.fromEntries(link.searchParams)).toMatchObject(picked);
    expect(links[1]?.searchParams.get("similarTo")).toBe("cadillac-escalade");
    fireEvent.click(screen.getByLabelText("Pick available dates"));
    expect(screen.queryByTestId("similar-models")).toBeNull();
    unmount();
  });
  it("does not treat untouched suggested dates as a visitor selection, even if blocked", () => {
    const { unmount } = render(<Panel suggested />);
    expect(screen.queryByTestId("similar-models")).toBeNull();
    unmount();
  });
});
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeSearchProvider, useHomeSearch } from "./use-home-search";

const router = vi.hoisted(() => ({ home: true, search: {} as Record<string, string> }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) => select({ matches: [{ routeId: router.home ? "/$lang/" : "/$lang/search" }] }),
  useSearch: () => router.search,
}));
vi.mock("@/hooks/use-cities", () => ({ useBookingCities: () => [{ slug: "orlando" }, { slug: "miami" }] }));
vi.mock("@/lib/vehicles", () => ({ cityLocations: (city?: { slug: string }) => city ? [{ key: city.slug === "orlando" ? "mco" : "mia" }] : [] }));

function Form({ name }: { name: string }) {
  const state = useHomeSearch();
  if (!state) return <output aria-label={name}>outside home</output>;
  return <div>
    <input aria-label={`${name} city`} value={state.city} onChange={e => state.setCity(e.target.value)} />
    <input aria-label={`${name} pickup`} value={state.pickup} onChange={e => state.setPickup(e.target.value)} />
    <input aria-label={`${name} return`} value={state.ret} onChange={e => state.setRet(e.target.value)} />
    <input aria-label={`${name} location`} value={state.loc} onChange={e => state.setLoc(e.target.value)} />
  </div>;
}
const pair = () => <HomeSearchProvider><Form name="sticky" /><Form name="hero" /></HomeSearchProvider>;
afterEach(() => { cleanup(); router.home = true; router.search = {}; });

describe("home search shared selection", () => {
  it("shares city, exact dates and times in both directions without submission", () => {
    render(pair());
    fireEvent.change(screen.getByLabelText("sticky city"), { target: { value: "miami" } });
    expect(screen.getByLabelText("hero city")).toHaveValue("miami");
    expect(screen.getByLabelText("hero location")).toHaveValue("mia");
    fireEvent.change(screen.getByLabelText("sticky pickup"), { target: { value: "2026-11-24T10:30" } });
    fireEvent.change(screen.getByLabelText("sticky return"), { target: { value: "2026-11-27T11:30" } });
    expect(screen.getByLabelText("hero pickup")).toHaveValue("2026-11-24T10:30");
    expect(screen.getByLabelText("hero return")).toHaveValue("2026-11-27T11:30");
    fireEvent.change(screen.getByLabelText("hero city"), { target: { value: "orlando" } });
    fireEvent.change(screen.getByLabelText("hero pickup"), { target: { value: "2026-12-10T09:00" } });
    fireEvent.change(screen.getByLabelText("hero return"), { target: { value: "2026-12-13T12:00" } });
    expect(screen.getByLabelText("sticky city")).toHaveValue("orlando");
    expect(screen.getByLabelText("sticky pickup")).toHaveValue("2026-12-10T09:00");
    expect(screen.getByLabelText("sticky return")).toHaveValue("2026-12-13T12:00");
  });
  it("hydrates and restores URL dates, times and delivery location", () => {
    router.search = { city: "miami", pickup: "2026-11-24T10:30", ret: "2026-11-28T11:00", loc: "hotel" };
    const view = render(pair());
    expect(screen.getByLabelText("hero pickup")).toHaveValue("2026-11-24T10:30");
    expect(screen.getByLabelText("hero location")).toHaveValue("hotel");
    router.search = { city: "orlando", pickup: "2026-12-10T10:00", ret: "2026-12-13T10:00" };
    view.rerender(pair());
    expect(screen.getByLabelText("sticky city")).toHaveValue("orlando");
    expect(screen.getByLabelText("hero pickup")).toHaveValue("2026-12-10T10:00");
    expect(screen.getByLabelText("hero location")).toHaveValue("mco");
  });
  it("does not override other pages' independent URL-driven search", () => {
    router.home = false;
    render(pair());
    expect(screen.getByLabelText("sticky")).toHaveTextContent("outside home");
    expect(screen.getByLabelText("hero")).toHaveTextContent("outside home");
  });
  it("keeps the all-city choice shared without discarding dates", () => {
    router.search = { pickup: "2026-11-24T10:00" };
    render(pair());
    fireEvent.change(screen.getByLabelText("sticky city"), { target: { value: "" } });
    expect(screen.getByLabelText("hero city")).toHaveValue("");
    expect(screen.getByLabelText("hero pickup")).toHaveValue("2026-11-24T10:00");
  });
});
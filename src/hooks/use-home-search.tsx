import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouterState, useSearch } from "@tanstack/react-router";
import { useBookingCities } from "@/hooks/use-cities";
import { cityLocations } from "@/lib/vehicles";

type HomeSearch = { city: string; pickup: string; ret: string; loc: string };
type SharedSearch = HomeSearch & { setCity: (value: string) => void; setPickup: (value: string) => void; setRet: (value: string) => void; setLoc: (value: string) => void };
const HomeSearchContext = createContext<SharedSearch | null>(null);

/** A home-only draft shared by both forms; URL navigation restores the draft. */
export function HomeSearchProvider({ children }: { children: ReactNode }) {
  const home = useRouterState({ select: state => state.matches.some(match => match.routeId === "/$lang/") });
  const cities = useBookingCities();
  const search = useSearch({ strict: false }) as Partial<HomeSearch>;
  const city = search.city ?? cities[0]?.slug ?? "miami";
  const loc = search.loc ?? cityLocations(cities.find(c => c.slug === city))[0]?.key ?? "";
  const pickup = search.pickup ?? "";
  const ret = search.ret ?? "";
  const [draft, setDraft] = useState<HomeSearch>({ city, loc, pickup, ret });
  useEffect(() => { setDraft({ city, loc, pickup, ret }); }, [home, city, loc, pickup, ret]);
  const value: SharedSearch = {
    ...draft,
    setCity: city => setDraft(previous => ({ ...previous, city, loc: cityLocations(cities.find(c => c.slug === city))[0]?.key ?? "" })),
    setPickup: pickup => setDraft(previous => ({ ...previous, pickup })),
    setRet: ret => setDraft(previous => ({ ...previous, ret })),
    setLoc: loc => setDraft(previous => ({ ...previous, loc })),
  };
  return <HomeSearchContext.Provider value={home ? value : null}>{children}</HomeSearchContext.Provider>;
}

export const useHomeSearch = () => useContext(HomeSearchContext);
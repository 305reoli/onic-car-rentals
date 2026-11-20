import { useSuspenseQuery } from "@tanstack/react-query";
import { citiesQuery } from "@/lib/queries";

export const useCities = () => useSuspenseQuery(citiesQuery()).data;

export const useBookingCities = () => useCities().filter(c => c.slug === "orlando" || c.slug === "miami");

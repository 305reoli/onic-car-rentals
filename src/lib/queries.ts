import { queryOptions } from "@tanstack/react-query";
import { getBookedDays, getCities, getPublicSettings, getUnavailableIds, getVehicle, getVehicles } from "@/services/catalog.functions";

export const vehiclesQuery = (city?: string) =>
  queryOptions({ queryKey: ["vehicles", city ?? "all"], queryFn: () => getVehicles({ data: city ? { city } : {} }) });

export const vehicleQuery = (city: string, slug: string) =>
  queryOptions({ queryKey: ["vehicle", city, slug], queryFn: () => getVehicle({ data: { city, slug } }) });

export const settingsQuery = () => queryOptions({ queryKey: ["settings"], queryFn: () => getPublicSettings() });

export const bookedDaysQuery = (vehicleId: string) =>
  queryOptions({ queryKey: ["booked", vehicleId], queryFn: () => getBookedDays({ data: { vehicleId } }) });

export const citiesQuery = () => queryOptions({ queryKey: ["cities"], queryFn: () => getCities(), staleTime: 60_000 });

export const unavailableQuery = (city: string, pickup: string, ret: string) =>
  queryOptions({ queryKey: ["unavailable", city, pickup, ret], queryFn: () => getUnavailableIds({ data: { city, pickup, ret } }) });

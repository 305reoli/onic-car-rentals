import { queryOptions } from "@tanstack/react-query";
import { getModelScarcity } from "@/services/scarcity.functions";

/** Locale-independent availability: loaders and both visible surfaces share one hydrated key. */
export const modelScarcityQuery = (vehicleId: string, pickup: string, ret: string) => queryOptions({
  queryKey: ["model-scarcity", vehicleId, pickup, ret],
  queryFn: async () => {
    try { return await getModelScarcity({ data: { vehicleId, pickup, ret } }); }
    catch { return { units: null, booked: null }; }
  },
  staleTime: 0,
  refetchInterval: 30000,
});
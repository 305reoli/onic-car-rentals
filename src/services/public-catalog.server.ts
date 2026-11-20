import { withDepositDefault, PUBLIC_VEHICLE_COLUMNS, type Vehicle } from "@/lib/vehicles";
import { publicClient } from "./public-client.server";

/** Complete public catalog for crawler lists, with safe columns and fail-closed pagination. */
export async function readActivePublicCars(): Promise<Vehicle[]> {
  const cars: Vehicle[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await publicClient().from("vehicles").select(PUBLIC_VEHICLE_COLUMNS).eq("active", true).order("id").range(offset, offset + 499);
    if (error) throw new Error("Public catalog unavailable");
    const rows = (data ?? []) as Vehicle[];
    cars.push(...rows.map(withDepositDefault));
    if (rows.length < 500) return cars;
  }
}
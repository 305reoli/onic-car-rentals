export const VEHICLE_TYPES = ["all", "suv", "sedan", "minivan", "convertible", "sports", "exotics"] as const;
export type VehicleType = typeof VEHICLE_TYPES[number];
type TypedCar = { name: string; model?: string; body_category: string; is_convertible: boolean };
export const vehicleType = (value: unknown): VehicleType => VEHICLE_TYPES.find(t => t === value) ?? "all";
/** Search body types extend merchandising categories, without changing stored categories or tags. */
export function primaryVehicleType(v: TypedCar): Exclude<VehicleType, "all" | "convertible"> | null {
  const name = `${v.name} ${v.model ?? ""}`;
  if (/\b(Pacifica|Carnival)\b/i.test(name)) return "minivan";
  if (/\b(Mustang|370Z)\b/i.test(name)) return "sports";
  if (v.body_category === "exotics") return "exotics";
  if (v.body_category === "sports") return "sports";
  if (v.body_category === "sedan" || /\b(740|Panamera)\b/i.test(name)) return "sedan";
  if (/\bRam\s*2500\b/i.test(name)) return null; // Pickup, not a verified member of these six body types.
  if (v.body_category === "suv" || /\b(Escalade|Suburban|Wagoneer|Defender|Macan|Vogue|Model X|GLS350|Cayenne|Range Rover Sport)\b/i.test(name)) return "suv";
  return null;
}
export function matchesVehicleType(v: TypedCar, type: VehicleType) {
  if (type === "all") return true;
  if (type === "convertible") return v.is_convertible || /\b(Mustang|370Z)\b/i.test(v.name);
  return primaryVehicleType(v) === type;
}
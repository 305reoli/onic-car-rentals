import { z } from "zod";
export const childSeatsSchema = z.object({ quantity: z.number().int().min(1).max(4), ages: z.array(z.string().trim().min(1).max(40)).min(1).max(4) }).refine((x) => x.ages.length === x.quantity, "One age per child seat required");
export type ChildSeats = z.infer<typeof childSeatsSchema>;
export function resizeChildSeats(current: ChildSeats | undefined, quantity: number): ChildSeats {
  const n = Math.max(1, Math.min(4, Math.trunc(quantity)));
  return { quantity: n, ages: Array.from({ length: n }, (_, i) => current?.ages[i] ?? "") };
}
/** Supplemental choices are hidden, not deleted; old booking snapshots remain intact. */
/** Add-on keys the client may see; Extra luggage car only while the owner has it active. */
export const visibleAddonKeys = (u: Pick<UpsellConfig, "luggageCarActive">) => CHECKOUT_ADDON_KEYS.filter((k) => k !== "luggageCar" || u.luggageCarActive);
// Owner order everywhere (car page + checkout): child seat, prepaid fuel, VIP delivery, hotel check-in; luggage car (hidden by default) last.
export const CHECKOUT_ADDON_KEYS = ["babySeat", "prepaidFuel", "vipDelivery", "hotelCheckin", "luggageCar"] as const;
const required = z.string().trim().min(1).max(300);
export const luggageLogisticsSchema = z.object({ pickupPoint: z.enum(["MCO", "MIA", "base", "other"]), pickupAddress: z.string().trim().max(300), deliveryAddress: required, pickupTime: required }).refine((x) => x.pickupPoint !== "other" || x.pickupAddress.length >= 5, "Luggage pickup address required");
export const hotelLogisticsSchema = z.object({ hotelName: required, hotelAddress: required, arrivalTime: required });
export type LuggageLogistics = z.infer<typeof luggageLogisticsSchema>;
export type HotelLogistics = z.infer<typeof hotelLogisticsSchema>;
export const DEFAULT_PREPAID_FUEL = 65;
export const DEFAULT_VIP_DELIVERY = 50;
export type UpsellConfig = { babySeat: number; prepaidFuel: number; vipDelivery: number; coveragePrice: number; coverageLabel: { en: string; pt: string; es: string }; luggageCarActive: boolean };
export function upsellConfig(raw: unknown): UpsellConfig {
  const r = (raw ?? {}) as Partial<UpsellConfig>;
  const price = (x: unknown) => Number.isFinite(Number(x)) ? Math.max(0, Number(x)) : 0;
  const orDefault = (x: unknown, d: number) => x == null || x === "" ? d : price(x);
  return { babySeat: price(r.babySeat), prepaidFuel: orDefault(r.prepaidFuel, DEFAULT_PREPAID_FUEL), vipDelivery: orDefault(r.vipDelivery, DEFAULT_VIP_DELIVERY), coveragePrice: price(r.coveragePrice), coverageLabel: { en: r.coverageLabel?.en || "", pt: r.coverageLabel?.pt || "", es: r.coverageLabel?.es || "" }, luggageCarActive: r.luggageCarActive === true };
}/** Upsell prices as pricing settings fields (server and UI share this mapping). */
export function upsellPricing(u: UpsellConfig) {
  return { addon_baby_seat: u.babySeat, addon_coverage: u.coveragePrice, addon_prepaid_fuel: u.prepaidFuel, addon_vip_delivery: u.vipDelivery };
}

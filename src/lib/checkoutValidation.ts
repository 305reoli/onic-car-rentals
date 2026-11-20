import { z } from "zod";
import { docMode, identitySubmitted, requiredUploads } from "./identity";
import { childSeatsSchema, hotelLogisticsSchema, luggageLogisticsSchema, type ChildSeats, type HotelLogistics, type LuggageLogistics } from "./checkoutExtras";

const text = (max: number) => z.string().trim().min(1).max(max);
const birthday = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const driverSchema = z.object({ firstName: text(80), lastName: text(80), email: text(200).email(), phone: z.string().trim().regex(/^\+\d[\d\s()-]{6,20}$/), country: text(80), dateOfBirth: birthday, address: text(300) });
type Leg = { city: string; type: string; address?: string | undefined; placeId?: string | undefined };
export type CheckoutValidationInput = {
  driver: Record<string, string | undefined>; pickup: Leg; ret: Leg; same: boolean;
  pickupAt: Date; minAge: number; askClient: boolean; clientType: string | null;
  babySeat: boolean; childSeats?: ChildSeats | undefined; hotelCheckin: boolean; hotel: HotelLogistics;
  luggageCar: boolean; luggage: LuggageLogistics;
  paymentReady: boolean; uploaded: Partial<Record<string, string>>; docBusy: Partial<Record<string, boolean>>; accepted: boolean;
  /** Documents step: licence issuing country (undefined = legacy callers) and Stripe Identity status. */
  licenseCountry?: string | undefined; identityStatus?: string | null | undefined;
};
/** Only the current step's requirements; optional flight/airline and WhatsApp opt-in never participate. */
export function checkoutInvalidFields(step: number, input: CheckoutValidationInput): string[] {
  // Steps: 0 driver/logistics, 1 documents, 2 terms, 3 payment (last).
  if (step === 1) {
    if (input.licenseCountry === undefined) return ["licenseFront", "licenseBack", "passport"].filter(key => !input.uploaded[key] || input.docBusy[key]);
    const mode = docMode(input.licenseCountry);
    if (!mode) return ["licenseCountry"];
    const out: string[] = requiredUploads(mode).filter(key => !input.uploaded[key] || input.docBusy[key]);
    if (mode !== "brazil" && !identitySubmitted(input.identityStatus)) out.unshift("identity");
    return out;
  }
  if (step === 2) return input.accepted ? [] : ["terms"];
  if (step === 3) return input.paymentReady ? [] : ["payment"];
  const fields: string[] = [];
  for (const [direction, leg] of [["pickup", input.pickup], ["return", input.same ? input.pickup : input.ret]] as const) {
    if (!leg.city || !["pickup", "airport", "address"].includes(leg.type)) fields.push(`${direction}Location`);
    if (leg.type === "address" && (!text(300).safeParse(leg.address).success || !leg.placeId)) fields.push(`${direction}Address`);
  }
  const driver = driverSchema.safeParse(input.driver);
  if (!driver.success) fields.push(...driver.error.issues.map(issue => String(issue.path[0])));
  if (birthday.safeParse(input.driver['dateOfBirth']).success) {
    const age = (input.pickupAt.getTime() - new Date(String(input.driver['dateOfBirth'])).getTime()) / (365.25 * 86400000);
    if (age < input.minAge) fields.push("dateOfBirth");
  }
  if (input.babySeat && !childSeatsSchema.safeParse(input.childSeats).success) {
    if (!input.childSeats) fields.push("seatQuantity");
    else input.childSeats.ages.forEach((age, index) => { if (!text(40).safeParse(age).success) fields.push(`childAge${index}`); });
  }
  if (input.hotelCheckin) {
    const result = hotelLogisticsSchema.safeParse(input.hotel);
    if (!result.success) fields.push(...result.error.issues.map(issue => `hotel.${issue.path[0]}`));
  }
  if (input.luggageCar) {
    const result = luggageLogisticsSchema.safeParse(input.luggage);
    if (!result.success) fields.push(...result.error.issues.map(issue => issue.path.length ? `luggage.${issue.path[0]}` : "luggage.pickupAddress"));
  }
  if (input.askClient && !input.clientType) fields.push("clientType");
  return [...new Set(fields)];
}
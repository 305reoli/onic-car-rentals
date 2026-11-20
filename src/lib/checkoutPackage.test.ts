import { describe, expect, it } from "vitest";
import { fullyPaidConfirmed } from "./bookingPerk";
import { validateDocument, driverFromDocuments, type ExtractedDocument } from "./documentCheck";
import { CHECKOUT_ADDON_KEYS, childSeatsSchema, resizeChildSeats, hotelLogisticsSchema, luggageLogisticsSchema, upsellConfig } from "./checkoutExtras";
import { createSchema } from "@/services/booking-schema";
import { computeQuote, DEFAULT_SETTINGS } from "./pricing";

const doc: ExtractedDocument = { fullName: "Proprietario Silva", number: "L123", dateOfBirth: "1980-01-01", issueDate: "2020-01-01", expiryDate: "2026-11-15", category: "B", country: "Brazil", state: null, nationality: null, documentType: "license", legible: true, notes: null };
describe("document checks", () => {
  it("flags expiry before Nov 18 rental return independently of expiry today", () => { const r = validateDocument(doc, "licenseFront", "Proprietario Silva", "2026-11-18", new Date("2026-11-08")); expect(r.expired).toBe(false); expect(r.expiresBeforeReturn).toBe(true); });
  it("flags expired license", () => expect(validateDocument({ ...doc, expiryDate: "2026-11-07" }, "licenseFront", "Proprietario Silva", "2026-11-18", new Date("2026-11-08")).expired).toBe(true));
  it("flags mismatched names", () => expect(validateDocument(doc, "licenseFront", "Jane Doe", "2026-11-18").nameMatches).toBe(false));
  it("never autofills a non-license image", () => expect(driverFromDocuments({ licenseFront: validateDocument({ ...doc, documentType: "other" }, "licenseFront", "Proprietario Silva", "2026-11-18") })).toEqual({}));
  it("autofills verified document fields", () => expect(driverFromDocuments({ licenseFront: validateDocument(doc, "licenseFront", "Proprietario Silva", "2026-11-18") })).toMatchObject({ firstName: "Proprietario", lastName: "Silva", licenseNumber: "L123", licenseExpiry: "2026-11-15" }));
});
describe("required logistics and unpriced upsells", () => {
  it("accepts exactly 1–4 seats and one age per seat", () => {
    expect(childSeatsSchema.parse({ quantity: 2, ages: ["6 months", "3 years"] })).toEqual({ quantity: 2, ages: ["6 months", "3 years"] });
    for (const quantity of [0, 5]) expect(childSeatsSchema.safeParse({ quantity, ages: ["3 years"] }).success).toBe(false);
    expect(childSeatsSchema.safeParse({ quantity: 2, ages: ["3 years"] }).success).toBe(false);
    expect(childSeatsSchema.safeParse({ quantity: 1, ages: [""] }).success).toBe(false);
  });
  it("drops extra ages when quantity decreases", () => expect(resizeChildSeats({ quantity: 2, ages: ["6 months", "3 years"] }, 1)).toEqual({ quantity: 1, ages: ["6 months"] }));
  it("preserves seat details through booking validation and clears deselected details", () => {
    const schema = createSchema.shape.addons;
    const addons = { insurance: false, hotelCheckin: false, luggageCar: false, babySeat: true, childSeats: { quantity: 2, ages: ["6 months", "3 years"] } };
    expect(schema.parse(addons).childSeats).toEqual(addons.childSeats);
    expect(schema.parse({ ...addons, babySeat: false }).childSeats).toBeUndefined();
    expect(schema.safeParse({ ...addons, childSeats: undefined }).success).toBe(false);
  });
  it("offers child seat, prepaid fuel, VIP delivery, hotel check-in (owner order), then luggage, with supplemental options hidden", () => expect(CHECKOUT_ADDON_KEYS).toEqual(["babySeat", "prepaidFuel", "vipDelivery", "hotelCheckin", "luggageCar"]));
  it("legacy supplemental flags cannot enter new booking prices, snapshots or exports", () => {
    const addons = createSchema.shape.addons.parse({ insurance: true, coverage: true, hotelCheckin: false, luggageCar: false });
    expect(addons.insurance).toBe(false); expect(addons.coverage).toBe(false);
    const q = computeQuote({ daily_price_usd: 100, prereservation_amount_usd: null }, new Date("2026-12-08"), new Date("2026-12-11"), addons, { ...DEFAULT_SETTINGS, addon_insurance_per_day: 35, addon_coverage: 50 });
    expect(q.insurance).toBe(0); expect(q.coverage).toBe(0); expect(q.basicInsurance).toBe(30);
  });
  it("mandatory basic insurance remains $10 per day", () => { const q = computeQuote({ daily_price_usd: 100, prereservation_amount_usd: null }, new Date("2026-11-12"), new Date("2026-11-15"), { insurance: false, luggageCar: false, hotelCheckin: false }); expect(q.basicInsurance).toBe(30); });
  it("requires the other luggage pickup address", () => expect(luggageLogisticsSchema.safeParse({ pickupPoint: "other", pickupAddress: "", deliveryAddress: "Hotel", pickupTime: "2026-11-12T10:00" }).success).toBe(false));
  it("requires hotel address and arrival", () => expect(hotelLogisticsSchema.safeParse({ hotelName: "Hotel", hotelAddress: "", arrivalTime: "" }).success).toBe(false));
  it("baby seat defaults to zero", () => expect(upsellConfig(null).babySeat).toBe(0));
  it("unpriced baby seat does not alter total or regular signal", () => { const car = { daily_price_usd: 100, prereservation_amount_usd: null }; const from = new Date("2026-11-12"), to = new Date("2026-11-15"); const base = { insurance: false, luggageCar: false, hotelCheckin: false }; const original = computeQuote(car, from, to, base); const next = computeQuote(car, from, to, { ...base, babySeat: true }, DEFAULT_SETTINGS); expect(next.total).toBe(original.total); expect(next.prereservation).toBe(100); });
  it("existing 66 luggage and 50 hotel rates remain authoritative", () => { const q = computeQuote({ daily_price_usd: 100, prereservation_amount_usd: null }, new Date("2026-11-12"), new Date("2026-11-15"), { insurance: false, luggageCar: true, hotelCheckin: true }, { ...DEFAULT_SETTINGS, addon_luggage_car: 66, addon_hotel_checkin: 50 }); expect(q.luggageCar).toBe(66); expect(q.hotelCheckin).toBe(50); });
});
describe("fully paid Loja Parceira eligibility", () => {
  const booking = { status: "approved", captured_at: "2026-11-08", prereservation_amount_usd: 100, price_breakdown: { total: 300 } };
  it("never reveals coupon at pending approval even if fully paid", () => expect(fullyPaidConfirmed({ ...booking, status: "pending_approval", paid_amount_usd: 300 })).toBe(false));
  it("never reveals coupon for a signal-only approved request", () => expect(fullyPaidConfirmed(booking)).toBe(false));
  it("reveals after confirmed full payment", () => expect(fullyPaidConfirmed({ ...booking, status: "confirmed", paid_amount_usd: 300 })).toBe(true));
  it("reveals when captured signal and paid balance cover total", () => expect(fullyPaidConfirmed({ ...booking, balance_paid_at: "2026-11-08", balance_amount_usd: 200 })).toBe(true));
  it("hides refunded bookings", () => expect(fullyPaidConfirmed({ ...booking, paid_amount_usd: 300, refunded_at: "2026-11-08" })).toBe(false));
});
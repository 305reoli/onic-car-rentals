import { describe, it, expect } from "vitest";
import { checkoutInvalidFields, type CheckoutValidationInput } from "./checkoutValidation";

const valid = (): CheckoutValidationInput => ({
  driver: { firstName: "Ana", lastName: "Silva", email: "ana@example.com", phone: "+1 555 123 4567", country: "Brazil", dateOfBirth: "1990-01-01", address: "123 Main Street" },
  pickup: { city: "orlando", type: "airport" }, ret: { city: "orlando", type: "airport" }, same: true,
  pickupAt: new Date("2026-12-10T10:00:00Z"), minAge: 21, askClient: false, clientType: null,
  babySeat: false, hotelCheckin: false, hotel: { hotelName: "", hotelAddress: "", arrivalTime: "" },
  luggageCar: false, luggage: { pickupPoint: "MCO", pickupAddress: "", deliveryAddress: "", pickupTime: "" },
  paymentReady: false, uploaded: {}, docBusy: {}, accepted: false,
});
describe("step-scoped required checkout fields", () => {
  it("collects every empty driver field, not only the first", () => {
    const input = valid(); input.driver = {};
    expect(checkoutInvalidFields(0, input)).toEqual(["firstName", "lastName", "email", "phone", "country", "dateOfBirth", "address"]);
  });
  it("blocks invalid email and WhatsApp", () => {
    const input = valid(); input.driver['email'] = "bad"; input.driver['phone'] = "123";
    expect(checkoutInvalidFields(0, input)).toEqual(["email", "phone"]);
  });
  it.each(["", "1990-01", "1990-02-31"])("blocks incomplete or impossible birth date %s", value => {
    const input = valid(); input.driver['dateOfBirth'] = value;
    expect(checkoutInvalidFields(0, input)).toEqual(["dateOfBirth"]);
  });
  it("preserves existing minimum-age gating", () => {
    const input = valid(); input.driver['dateOfBirth'] = "2010-01-01";
    expect(checkoutInvalidFields(0, input)).toEqual(["dateOfBirth"]);
  });
  it("does not require payment, docs, terms, optional flight or opt-in on step 1", () => {
    expect(checkoutInvalidFields(0, valid())).toEqual([]);
  });
  it("requires selected pickup and return locations", () => {
    const input = valid(); input.pickup = { city: "", type: "" };
    expect(checkoutInvalidFields(0, input)).toEqual(["pickupLocation", "returnLocation"]);
  });
  it("requires both addresses and a selected suggestion when address delivery is chosen", () => {
    const input = valid(); input.pickup = { city: "orlando", type: "address", address: "123 Main" };
    expect(checkoutInvalidFields(0, input)).toEqual(["pickupAddress", "returnAddress"]);
    input.pickup.placeId = "ChIJvalidsuggestion";
    expect(checkoutInvalidFields(0, input)).toEqual([]);
  });
  it("checks separately selected return address", () => {
    const input = valid(); input.same = false; input.ret.type = "address";
    expect(checkoutInvalidFields(0, input)).toEqual(["returnAddress"]);
  });
  it("only requires add-on logistics while selected", () => {
    const input = valid(); input.hotelCheckin = true;
    expect(checkoutInvalidFields(0, input)).toEqual(["hotel.hotelName", "hotel.hotelAddress", "hotel.arrivalTime"]);
    input.hotelCheckin = false; input.babySeat = true; input.childSeats = { quantity: 2, ages: ["3 years", ""] };
    expect(checkoutInvalidFields(0, input)).toEqual(["childAge1"]);
  });
  it("requires the payment-routing choice only when offered", () => {
    const input = valid(); input.askClient = true;
    expect(checkoutInvalidFields(0, input)).toEqual(["clientType"]);
  });
  it("blocks payment advance until provider completion", () => {
    const input = valid(); expect(checkoutInvalidFields(3, input)).toEqual(["payment"]);
    input.paymentReady = true; expect(checkoutInvalidFields(3, input)).toEqual([]);
  });
  it("requires all three uploads, not the optional second license", () => {
    const input = valid(); expect(checkoutInvalidFields(1, input)).toEqual(["licenseFront", "licenseBack", "passport"]);
    input.uploaded = { licenseFront: "front", licenseBack: "back", passport: "id" };
    expect(checkoutInvalidFields(1, input)).toEqual([]);
    input.docBusy['passport'] = true; expect(checkoutInvalidFields(1, input)).toEqual(["passport"]);
  });
  it("requires terms on the step before payment, and payment comes last", () => {
    const input = valid(); expect(checkoutInvalidFields(2, input)).toEqual(["terms"]);
    input.accepted = true; expect(checkoutInvalidFields(2, input)).toEqual([]);
    expect(checkoutInvalidFields(3, input)).toEqual(["payment"]);
  });
  it("clears corrected fields while retaining other errors", () => {
    const input = valid(); input.driver['email'] = ""; input.driver['country'] = "";
    expect(checkoutInvalidFields(0, input)).toEqual(["email", "country"]);
    input.driver['email'] = "ana@example.com";
    expect(checkoutInvalidFields(0, input)).toEqual(["country"]);
  });
});
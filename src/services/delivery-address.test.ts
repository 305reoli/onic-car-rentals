import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectDeliveryCity, deliveryDestination } from "@/lib/deliveryCity";
import { computeQuote } from "@/lib/pricing";
vi.mock("./distance.server", () => ({ distanceFrom: vi.fn(async () => ({ ok: false, reason: "unavailable" })) }));
import { distanceFrom } from "./distance.server";
import { resolveDelivery } from "./delivery.server";

describe("typed address delivery without Maps", () => {
  beforeEach(() => { vi.mocked(distanceFrom).mockClear(); });
  it.each([
    ["Tampa Marriott Water Street, Tampa, FL", "tampa"], ["TPA", "tampa"], ["Hotel FL 33602", "tampa"],
    ["Fort Lauderdale", "fort-lauderdale"], ["FLL", "fort-lauderdale"], ["Las Olas", "fort-lauderdale"], ["FL 33301", "fort-lauderdale"],
    ["Orlando", "orlando"], ["MCO", "orlando"], ["Disney Springs", "orlando"], ["FL 32809", "orlando"],
    ["Miami", "miami"], ["MIA", "miami"], ["Brickell", "miami"], ["FL 33139", "miami"],
  ])("detects %s as %s", (address, city) => expect(detectDeliveryCity(address)).toBe(city));
  it("allows the selected city to correct ambiguous text", () => {
    expect(deliveryDestination("orlando", { type: "address", address: "Marriott hotel", destinationCity: "tampa" })).toBe("tampa");
  });
  it.each(["both", "delivery", "collection"] as const)("Orlando to Tampa %s is matrix-priced without distance", async (mode) => {
    const r = await resolveDelivery({ city: "orlando", body_category: "suv" }, "orlando", { type: "address", address: "Tampa Marriott Water Street, Tampa, FL", mode }, null);
    expect(r.status).toBe("priced"); expect(r.itemizedFee).toBe(mode === "both" ? 200 : 100);
    expect(r.legs?.[0]?.city).toBe("tampa"); expect(distanceFrom).not.toHaveBeenCalled();
    const q = computeQuote({ daily_price_usd: 89, prereservation_amount_usd: null }, new Date("2027-12-10T15:00Z"), new Date("2027-12-13T15:00Z"), { insurance: false, hotelCheckin: false, luggageCar: false }, undefined, r.itemizedFee);
    expect(q.dailyRate).toBe(89); expect(q.subtotal).toBe(mode === "both" ? 518 : 418);
    expect(q.tax).toBe(mode === "both" ? 33.67 : 27.17); expect(q.total).toBe(mode === "both" ? 551.67 : 445.17);
  });
  it.each(["both", "delivery", "collection"] as const)("Miami to FLL %s retains matrix fees", async (mode) => {
    const r = await resolveDelivery({ city: "miami", body_category: "suv" }, "miami", { type: "address", address: "FLL airport", destinationCity: "fort-lauderdale", mode }, null);
    expect(r.itemizedFee).toBe(mode === "both" ? 200 : 100);
  });
  it("uses $180 inter-city and fixed car/default prices", async () => {
    const v = { city: "orlando", body_category: "suv" };
    expect((await resolveDelivery(v, "miami", { type: "address", address: "Miami hotel", mode: "both" }, null)).itemizedFee).toBe(360);
    expect((await resolveDelivery(v, "miami", { type: "address", address: "Miami hotel", mode: "delivery" }, null)).itemizedFee).toBe(180);
    const cfg = { fixed_delivery_v2: { regular: { servedCity: 70 } } };
    expect((await resolveDelivery(v, "orlando", { type: "address", address: "Tampa hotel" }, cfg)).itemizedFee).toBe(140);
  });
  it("rejects typed exotic delivery to FLL even from a Miami checkout", async () => {
    await expect(resolveDelivery({ city: "miami", body_category: "exotics" }, "miami", { type: "address", address: "Fort Lauderdale hotel" }, null)).rejects.toThrow("PICKUP_ONLY");
  });
  it("rejects an empty address instead of doing nothing", async () => {
    await expect(resolveDelivery({ city: "orlando", body_category: "suv" }, "tampa", { type: "address", address: "" }, null)).rejects.toThrow("DELIVERY_ADDRESS");
  });
  it("server enforces flat own-city pricing inside 25 road miles", async () => {
    vi.mocked(distanceFrom).mockResolvedValueOnce({ok:true,miles:20.5,dest:{lat:25,lng:-80}} as never);
    const r=await resolveDelivery({city:"miami",body_category:"suv"},"miami",{type:"address",pickupLeg:{city:"miami",type:"address",address:"Dolphin Mall",placeId:"ChIJabcdefghijk"},sameReturn:true},null);
    expect(r.legs?.map(l=>l.fee)).toEqual([40,40]);expect(r.itemizedFee).toBe(80);
  });
  it("server leaves beyond-radius leg unpriced", async () => {
    vi.mocked(distanceFrom).mockResolvedValueOnce({ok:true,miles:40,dest:{lat:25,lng:-80}} as never);
    const r=await resolveDelivery({city:"miami",body_category:"suv"},"miami",{type:"address",pickupLeg:{city:"miami",type:"address",address:"Homestead",placeId:"ChIJabcdefghijk"},sameReturn:true},null);
    expect(r.status).toBe("quote_pending");expect(r.legs?.map(l=>l.fee)).toEqual([null,null]);expect(r.row["delivery_fee_usd"]).toBeNull();
  });
  it("server allows Sports inter-city without distance calls", async () => {
    const r=await resolveDelivery({city:"miami",body_category:"sports"},"miami",{type:"pickup",pickupLeg:{city:"miami",type:"pickup"},returnLeg:{city:"orlando",type:"pickup"},sameReturn:false},null);
    expect(r.legs?.map(l=>l.fee)).toEqual([0,180]);expect(distanceFrom).not.toHaveBeenCalled();
  });
  it("exotic address within 25 miles charges the fixed exotic fee per leg", async () => {
    vi.mocked(distanceFrom).mockResolvedValueOnce({ok:true,miles:12,dest:{lat:25,lng:-80}} as never);
    const r=await resolveDelivery({city:"miami",body_category:"exotics"},"miami",{type:"address",pickupLeg:{city:"miami",type:"address",address:"Miami home",placeId:"ChIJabcdefghijk"},sameReturn:true},null);
    expect(r.legs?.map(l=>l.fee)).toEqual([120,120]);expect(r.itemizedFee).toBe(240);
  });
  it("exotic address beyond 25 miles (e.g. Daytona) is not charged and waits for confirmation", async () => {
    vi.mocked(distanceFrom).mockResolvedValueOnce({ok:true,miles:62,dest:{lat:29,lng:-81}} as never);
    const r=await resolveDelivery({city:"orlando",body_category:"exotics"},"orlando",{type:"address",pickupLeg:{city:"orlando",type:"address",address:"1 Daytona Blvd",placeId:"ChIJabcdefghijk"},sameReturn:true},null);
    expect(r.status).toBe("quote_pending");expect(r.legs?.map(l=>l.fee)).toEqual([null,null]);expect(r.row["delivery_fee_usd"]).toBeNull();
  });
});

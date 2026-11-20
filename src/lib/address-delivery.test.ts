import { describe, expect, it } from "vitest";
import { addressLegPrice, deliveryLegPrice, effectiveDeliveryPrices, DEFAULT_DELIVERY } from "./pricing";
const regular = { city: "miami", body_category: "suv" };
describe("Fixed delivery defaults and overrides", () => {
 it("Orlando pickup base is SuaRua Level 4, not the fiscal address", () => expect(DEFAULT_DELIVERY.bases["orlando"]).toEqual({address:"789 Sua Rua, Orlando, FL — Level 4 (parking garage)",lat:28.538336,lng:-81.61771}));
 it("Miami pickup base is Sua Avenida Level 3", () => expect(DEFAULT_DELIVERY.bases["miami"]).toEqual({address:"321 Sua Avenida, Miami Beach, FL — Level 3",lat:25.761680,lng:-80.191790}));
 it("Regular defaults are $40/$180/$100", () => expect(effectiveDeliveryPrices(regular,null)).toEqual({ ownCityAddress:40, otherBase:180, servedCity:100 }));
 it("Sports address default is $40", () => expect(addressLegPrice({...regular,body_category:"sports"},25,null).fee).toBe(40));
 it("Exotic address default is $120 through 25 miles", () => expect(addressLegPrice({...regular,body_category:"exotics"},25,null).fee).toBe(120));
 it("own-city address remains flat at all eligible distances", () => { for(const miles of [0,7,15,20.5,25]) expect(addressLegPrice(regular,miles,null).fee).toBe(40); });
 it("beyond 25 miles has no automatic price", () => expect(addressLegPrice(regular,25.01,null)).toEqual({status:"quote_pending",fee:null}));
 it("unknown distance has no invented price", () => expect(addressLegPrice(regular,null,null).fee).toBeNull());
 it("blank override inherits and supplied override wins", () => { const v={...regular,delivery_pricing:{v2:{ownCityAddress:null,otherBase:175}}}; expect(effectiveDeliveryPrices(v,null)).toEqual({ownCityAddress:40,otherBase:175,servedCity:100}); });
 it("retired formula overrides no longer affect prices", () => expect(addressLegPrice({...regular,delivery_pricing:{baseFare:900,perMile:90,minimumFee:900}},20,null).fee).toBe(40));
 it("OFF rejects inter-city return", () => expect(()=>deliveryLegPrice({...regular,allows_one_way:false},{city:"orlando",type:"pickup"},"return",null,null)).toThrow("ONE_WAY_DISABLED"));
});

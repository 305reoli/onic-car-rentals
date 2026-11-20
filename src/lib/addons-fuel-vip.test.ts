import { describe, it, expect } from "vitest";
import { computeQuote, DEFAULT_SETTINGS } from "./pricing";
import { upsellConfig, upsellPricing } from "./checkoutExtras";

const s = { ...DEFAULT_SETTINGS, ...upsellPricing(upsellConfig({})) };
const v = { daily_price_usd: 100, prereservation_amount_usd: null };
const pick = new Date("2027-12-10T15:00Z"), ret = new Date("2027-12-13T15:00Z");
const base = { insurance: false, hotelCheckin: false, luggageCar: false };

describe("prepaid fuel and VIP delivery", () => {
  it("default to $65 and $50", () => { expect(upsellConfig({}).prepaidFuel).toBe(65); expect(upsellConfig({}).vipDelivery).toBe(50); });
  it("prepaid fuel is a flat $65 per rental, taxed at 6.5%", () => {
    const off = computeQuote(v, pick, ret, base, s, 0, 0, { exotic: true });
    const on = computeQuote(v, pick, ret, { ...base, prepaidFuel: true }, s, 0, 0, { exotic: true });
    expect(on.prepaidFuel).toBe(65);
    expect(on.subtotal).toBe(off.subtotal! + 65);
    expect(on.tax).toBe(Math.round((306 + 65) * 6.5) / 100);
  });
  it("VIP delivery adds a flat $50 per rental without changing delivery fees", () => {
    const on = computeQuote(v, pick, ret, { ...base, vipDelivery: true }, s, 40, 0, { exotic: true });
    expect(on.vipDelivery).toBe(50);
    expect(on.deliveryFee).toBe(40);
    expect(on.subtotal).toBe(396);
  });
  it("owner-edited price is used", () => {
    const q = computeQuote(v, pick, ret, { ...base, prepaidFuel: true }, { ...DEFAULT_SETTINGS, ...upsellPricing(upsellConfig({ prepaidFuel: 70 })) }, 0, 0, { exotic: true });
    expect(q.prepaidFuel).toBe(70);
  });
});

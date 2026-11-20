import { beforeEach, describe, expect, it, vi } from "vitest";
import { purchaseFromBooking, trackPurchase } from "./funnel";

const paid = { id: "booking-616", status: "pending_approval", captured_at: "2026-11-15T02:00:00Z", paid_amount_usd: 616, vehicle_id: "car-1", vehicle_name: "Porsche 718 Cayman" };
const purchase = () => purchaseFromBooking(paid, "Sports");
describe("confirmed purchase analytics", () => {
  let storage: Map<string, string>, ga: ReturnType<typeof vi.fn>, meta: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    storage = new Map(); ga = vi.fn(); meta = vi.fn();
    vi.stubGlobal("window", { navigator: {}, __metaPixel: "ok", gtag: ga, fbq: meta, localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) } });
  });
  it("sends exact GA4 purchase fields and Meta same actual paid value/currency with shared event ID", () => {
    expect(trackPurchase(purchase())).toBe(true);
    expect(ga).toHaveBeenCalledExactlyOnceWith("event", "purchase", { transaction_id: "booking-616", value: 616, currency: "USD", items: [{ item_id: "car-1", item_name: "Porsche 718 Cayman", item_category: "Sports", price: 616, quantity: 1 }] });
    expect(meta).toHaveBeenCalledExactlyOnceWith("track", "Purchase", { value: 616, currency: "USD" }, { eventID: "booking-616" });
  });
  it("claims synchronously before dispatch, including reentrant double effects", () => {
    ga.mockImplementation(() => { expect(storage.get("ga4_purchase_booking-616")).toBe("1"); expect(trackPurchase(purchase())).toBe(false); });
    trackPurchase(purchase());
    expect(ga).toHaveBeenCalledTimes(1); expect(meta).toHaveBeenCalledTimes(1);
  });
  it("a second page, render or reload with persisted storage never sends again", async () => {
    trackPurchase(purchase());
    vi.resetModules();
    const reloaded = await import("./funnel");
    expect(reloaded.trackPurchase(purchase())).toBe(false);
    expect(ga).toHaveBeenCalledTimes(1); expect(meta).toHaveBeenCalledTimes(1);
  });
  it("a different transaction still sends", () => {
    trackPurchase(purchase());
    trackPurchase(purchaseFromBooking({ ...paid, id: "booking-2" }, "Sports"));
    expect(ga).toHaveBeenCalledTimes(2); expect(meta).toHaveBeenCalledTimes(2);
  });
  it.each(["draft", "checkout_hold", "payment_failed", "amount_review"])("does not send for %s even with misleading paid fields", status => {
    expect(trackPurchase(purchaseFromBooking({ ...paid, status }, "Sports"))).toBe(false);
    expect(ga).not.toHaveBeenCalled(); expect(meta).not.toHaveBeenCalled();
  });
  it("pending approval without captured/settled payment does not send", () => {
    expect(trackPurchase(purchaseFromBooking({ ...paid, captured_at: null }, "Sports"))).toBe(false);
    expect(ga).not.toHaveBeenCalled();
  });
  it("Global Pays requires actual settlement and uses paid amount, not quote", () => {
    const p = purchaseFromBooking({ ...paid, captured_at: null, settled_at: "2026-11-15T02:00:00Z", paid_amount_usd: 623.09 }, "Sports");
    expect(p?.value).toBe(623.09); expect(trackPurchase(p)).toBe(true);
  });
  it("legacy Meta guard suppresses Meta only, allowing missing GA4 once", () => {
    storage.set("meta_purchase_booking-616", "1");
    expect(trackPurchase(purchase())).toBe(true); expect(trackPurchase(purchase())).toBe(false);
    expect(ga).toHaveBeenCalledTimes(1); expect(meta).not.toHaveBeenCalled();
  });
  it("blocked/unloaded Meta still allows GA4 without queuing Purchase", () => {
    window.__metaPixel = "blocked";
    expect(trackPurchase(purchase())).toBe(true); expect(meta).not.toHaveBeenCalled();
    expect(window.__metaQ).toBeUndefined();
  });
  it("does not claim or send without gtag or when storage fails", () => {
    (window as unknown as { gtag?: unknown }).gtag = undefined;
    expect(trackPurchase(purchase())).toBe(false); expect(storage.size).toBe(0);
    (window as unknown as { gtag?: unknown }).gtag = ga;
    window.localStorage.setItem = () => { throw new Error("denied"); };
    expect(trackPurchase(purchase())).toBe(false); expect(ga).not.toHaveBeenCalled();
  });
  it("test bookings and global privacy opt-out never send", () => {
    expect(trackPurchase(purchaseFromBooking({ ...paid, is_test: true }, "Sports"))).toBe(false);
    Object.assign(window.navigator, { globalPrivacyControl: true });
    expect(trackPurchase(purchase())).toBe(false); expect(ga).not.toHaveBeenCalled(); expect(meta).not.toHaveBeenCalled();
  });
});
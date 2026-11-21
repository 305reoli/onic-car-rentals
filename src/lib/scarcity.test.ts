import { describe, expect, it } from "vitest";
import { availableModelUnits, holdSeconds, recentPaidCount, unitsLeftLabel, type StockUnit } from "./scarcity";

const now = new Date("2026-11-11T04:12:00Z");
const car: StockUnit = { id: "a", brand: "Toyota", model: "Corolla", city: "orlando", active: true, blocked_dates: [] };
const p = "2026-11-17T10:00:00Z", r = "2026-11-21T10:00:00Z";
describe("truthful model scarcity", () => {
  it("counts separate active units in the same base and model, excluding manual blocks and real overlaps", () => {
    const fleet = [car, { ...car, id: "b" }, { ...car, id: "c", blocked_dates: ["2026-11-18"] }, { ...car, id: "miami", city: "miami" }, { ...car, id: "off", active: false }, { ...car, id: "other", model: "Camry" }];
    expect(availableModelUnits(fleet, [], car, p, r, now)).toBe(2);
    expect(availableModelUnits(fleet, [{ vehicle_id: "b", status: "approved", pickup_at: p, return_at: r }], car, p, r, now)).toBe(1);
  });
  it("ignores drafts and expired holds but counts active checkout holds", () => {
    const booking = { vehicle_id: "a", status: "draft", pickup_at: p, return_at: r };
    expect(availableModelUnits([car], [booking], car, p, r, now)).toBe(1);
    expect(availableModelUnits([car], [{ ...booking, status: "checkout_hold", hold_until: "2026-11-11T04:11:00Z" }], car, p, r, now)).toBe(1);
    expect(availableModelUnits([car], [{ ...booking, status: "checkout_hold", hold_until: "2026-11-11T04:27:00Z" }], car, p, r, now)).toBe(0);
  });
  it("omits counts for failed reads, unknown identity or invalid dates", () => {
    expect(availableModelUnits(null, [], car, p, r)).toBeNull();
    expect(availableModelUnits([car], null, car, p, r)).toBeNull();
    expect(availableModelUnits([car], [], car, r, p)).toBeNull();
    expect(availableModelUnits([car], [], { ...car, model: "" }, p, r)).toBeNull();
    expect(unitsLeftLabel(null, "pt")).toBeNull();
    expect(unitsLeftLabel(0, "en")).toBeNull();
  });
  it("escalates only the actual last unit in each language", () => {
    expect(unitsLeftLabel(1, "pt")).toBe("Última unidade para essas datas — garanta o seu");
    expect(unitsLeftLabel(1, "en")).toBe("Last one for these dates — secure yours");
    expect(unitsLeftLabel(1, "es")).toBe("Última unidad para estas fechas — asegura la tuya");
    expect(unitsLeftLabel(2, "pt")).toBe("Restam 2 unidades deste modelo para essas datas");
  });
  it("counts only real paid bookings in the preceding seven days, never tests, drafts, failed or unpaid requests", () => {
    const paid = { is_test: false, status: "confirmed", paid_amount_usd: 298.2, created_at: now.toISOString() };
    expect(recentPaidCount([paid, { ...paid, is_test: true }, { ...paid, status: "draft" }, { ...paid, status: "payment_failed" }, { ...paid, paid_amount_usd: 0 }, { ...paid, created_at: "2026-11-03T04:12:00Z" }], now)).toBe(1);
    expect(recentPaidCount([], now)).toBeNull();
    expect(recentPaidCount(null, now)).toBeNull();
  });
  it("uses the actual stock hold deadline, never a draft expiry or a reset 15-minute timer", () => {
    const hold = { status: "checkout_hold", holdUntil: "2026-11-11T04:14:00Z" };
    expect(holdSeconds(hold, now.getTime())).toBe(120);
    expect(holdSeconds(hold, now.getTime() + 30000)).toBe(90);
    expect(holdSeconds(hold, now.getTime() + 120000)).toBe(0);
    expect(holdSeconds({ ...hold, status: "draft" }, now.getTime())).toBeNull();
    expect(holdSeconds(null, now.getTime())).toBeNull();
  });
});
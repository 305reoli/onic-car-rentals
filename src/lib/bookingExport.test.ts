import { describe, expect, it } from "vitest";
import { buildBookingExport, exportSections } from "./bookingExport";
import type { Database } from "@/integrations/supabase/types";
type Row = Database["public"]["Tables"]["prereservations"]["Row"];
const row = { id: "test", first_name: "Test", last_name: "Customer", pickup_at: "2026-11-12T15:00:00Z", return_at: "2026-11-18T15:00:00Z", address: "Home address", price_breakdown: { dailyRate: 90, base: 540, tax: 40, total: 640 }, addons: {}, document_ai: { passport: { documentType: "other", legible: true, number: "SCREENSHOT" } }, prereservation_amount_usd: 90 } as unknown as Row;
describe("private booking export", () => {
  it("includes two child ages and quantity in JSON and PDF rows", () => {
    const x = buildBookingExport({ ...row, addons: { babySeat: true, childSeats: { quantity: 2, ages: ["6 months", "3 years"] } } }, null, null);
    expect(x.logistics.child_seats).toEqual({ selected: true, quantity: 2, ages: ["6 months", "3 years"] });
    const rows = exportSections(x).find(s => s.title === "logistics")?.rows;
    expect(rows).toContainEqual(["child seats / quantity", "2"]);
    expect(rows).toContainEqual(["child seats / ages / 0", "6 months"]);
    expect(rows).toContainEqual(["child seats / ages / 1", "3 years"]);
  });
  it("preserves saved prices and separates missing booking deposit from current vehicle deposit", () => {
    const x = buildBookingExport(row, { slug: "bmw-x3", security_deposit_usd: 1000 }, "Miami");
    expect(x.rental.total_usd).toBe(640); expect(x.rental.daily_rate_usd).toBe(90);
    expect(x.rental.deposit_amount_usd).toBeNull(); expect(x.rental.current_vehicle_deposit_usd).toBe(1000);
    expect(x.rental.vehicle_slug).toBe("bmw-x3");
  });
  it("does not invent identity or US-address fields from screenshots or delivery data", () => {
    const x = buildBookingExport(row, null, null);
    expect(x.customer.passport_number).toBeNull(); expect(x.customer.passport_expiry).toBeNull(); expect(x.customer.us_address).toBeNull();
    expect(x.customer.license_number).toBeNull(); expect(x.customer.home_address).toBe("Home address");
  });
  it("exports local pickup/return date and time without changing timestamps", () => {
    const x = buildBookingExport(row, null, null);
    expect(x.rental.pickup.date).toBe("2026-11-12"); expect(x.rental.pickup.time).toBe("10:00");
    expect(x.rental.return.date).toBe("2026-11-18");
  });
});
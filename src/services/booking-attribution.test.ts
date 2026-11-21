import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeader: () => undefined }));
vi.mock("./delivery.server", () => ({ resolveDelivery: async () => ({ row: {}, label: {}, status: "priced", itemizedFee: 0, embeddedFee: 0, cross: false }) }));
import { validateBooking } from "./booking-core.server";
import { createSchema } from "./booking-schema";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

describe("reservation source persistence", () => {
 it("keeps validated UTM tags in the existing price breakdown for all booking flows", async () => {
  const data = createSchema.parse({ vehicleSlug: "cadillac-escalade-esv", city: "miami", pickupAt: "2027-12-01T15:00:00Z", returnAt: "2027-12-08T15:00:00Z", delivery: { type: "pickup" }, addons: { insurance: false, hotelCheckin: false, luggageCar: false }, driver: { firstName: "Test", lastName: "Driver", email: "test@example.com", phone: "+15555550101", country: "US", dateOfBirth: "1980-01-01", address: "Test address" }, whatsappOptIn: false, language: "en", attribution: { utm_source: "google", utm_medium: "cpc", utm_campaign: "miami" } });
  const vehicle = { id: "car", name: "Cadillac Escalade ESV", city: "miami", body_category: "suv", daily_price_usd: 399, min_age: 25, min_days: 1, blocked_dates: [] };
  const db = { from: (table: string) => {
    const result = { data: table === "vehicles" ? vehicle : table === "cities" ? { slug: "miami" } : table === "settings" ? null : [], error: null };
    const q: Record<string, unknown> = { then: (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve) };
    for (const method of ["select", "eq", "maybeSingle", "or", "lt", "gt", "limit"]) q[method] = () => q;
    return q;
  } } as unknown as SupabaseClient<Database>;
  const validated = await validateBooking(db, data);
  expect(validated.breakdown.attribution).toEqual({ utm_source: "google", utm_medium: "cpc", utm_campaign: "miami" });
  expect(validated.breakdown.total).toBeGreaterThan(0);
 });
});

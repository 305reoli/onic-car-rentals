import { beforeEach, describe, expect, it, vi } from "vitest";
import { emailHtml } from "@/lib/emailLayout";
import { notify } from "./notify.server";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  send: vi.fn(async () => ({ sent: true, id: "test-receipt" })),
  log: vi.fn(async () => undefined),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("./resend-email.server", () => ({ emailConfigured: () => true, OWNER_EMAIL: "info@oniccarrentals.com", sendResendEmail: mocks.send }));
vi.mock("./whatsapp.server", () => ({ logNotification: mocks.log }));
vi.mock("@/lib/emailLayout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/emailLayout")>();
  return { emailHtml: vi.fn(actual.emailHtml) };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation((table: string) => {
    const data = table === "settings"
      ? { owner_notification_email: "info@oniccarrentals.com", support_email: "info@oniccarrentals.com", gp_interest_free_installments: 6 }
      : table === "cities" ? { name: "Miami" }
      : { status: "confirmed", captured_at: "2026-11-20", paid_amount_usd: 500, prereservation_amount_usd: 500, price_breakdown: { total: 500 }, payment_mode: "full", payment_provider: "stripe", first_name: "Test", last_name: "Driver", email: "driver@example.com", phone: "+19542480903", vehicle_name: "Test car", service_city: "miami", base_city: "miami", pickup_at: "2026-12-01T12:00:00Z", return_at: "2026-12-03T12:00:00Z", substitute_info: null, token: "test-token" };
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data }) };
    return query;
  });
});

describe("Onic booking notification destinations", () => {
  it.each(["en", "pt", "es"] as const)("%s fully paid confirmation has no partner-store action", async (lang) => {
    await expect(notify("customer_confirmed", "driver@example.com", lang, { id: "test-booking", car: "Test car", link: "/en/booking/test-token" })).resolves.toEqual({ sent: true, id: "test-receipt" });
    expect(mocks.from).toHaveBeenCalledWith("prereservations");
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const options = vi.mocked(emailHtml).mock.calls[0]?.[0];
    expect(options).toBeDefined();
    expect(options?.actions ?? []).toEqual([]);
    expect(options?.link).toBe("https://oniccarrentals.com/en/booking/test-token");
  });
  it("retains the rental-related substitute accept and decline actions", async () => {
    await notify("customer_substitute", "driver@example.com", "en", { id: "test-booking", car: "Test car" });
    const actions = vi.mocked(emailHtml).mock.calls[0]?.[0].actions;
    expect(actions).toHaveLength(2);
    expect(actions?.map((action) => action.href)).toEqual([
      "https://oniccarrentals.com/en/booking/test-token#substitute-offer",
      "https://oniccarrentals.com/en/booking/test-token#substitute-offer",
    ]);
  });
});
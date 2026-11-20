import { describe, expect, it } from "vitest";
import { selectStripeMode, stripeModesMatch, stripeTokenMode, stripeWebhookSecretName } from "./stripeMode";

describe("Stripe preparation guards", () => {
  it("stays in sandbox with no live connection", () => expect(selectStripeMode(false)).toBe("sandbox"));
  it("selects live only with a live connection", () => expect(selectStripeMode(true)).toBe("live"));
  it("does not mount live checkout with a test browser token", () => expect(stripeModesMatch("live", "pk_test_test_fixture")).toBe(false));
  it("does not mount test checkout with a live browser token", () => expect(stripeModesMatch("sandbox", "pk_live_test_fixture")).toBe(false));
  it("does not default a missing token to live", () => expect(stripeTokenMode(undefined)).toBeNull());
  it("isolates live webhook signatures from sandbox", () => expect(stripeWebhookSecretName("live")).toBe("PAYMENTS_LIVE_WEBHOOK_SECRET"));
  it("keeps the original sandbox webhook secret", () => expect(stripeWebhookSecretName("sandbox")).toBe("PAYMENTS_SANDBOX_WEBHOOK_SECRET"));
});
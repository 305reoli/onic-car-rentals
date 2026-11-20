export type StripeMode = "sandbox" | "live";

/** Presence is checked server-side; no credential values cross this boundary. */
export const selectStripeMode = (liveConnectionPresent: boolean): StripeMode => liveConnectionPresent ? "live" : "sandbox";

export function stripeTokenMode(token: string | undefined): StripeMode | null {
  if (token?.startsWith("pk_test_")) return "sandbox";
  if (token?.startsWith("pk_live_")) return "live";
  return null;
}

export const stripeModesMatch = (mode: StripeMode, token: string | undefined) => stripeTokenMode(token) === mode;

export const stripeWebhookSecretName = (mode: StripeMode) => mode === "live" ? "PAYMENTS_LIVE_WEBHOOK_SECRET" : "PAYMENTS_SANDBOX_WEBHOOK_SECRET";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { stripeModesMatch, stripeTokenMode, type StripeMode } from "@/lib/stripeMode";

const token = import.meta.env['VITE_PAYMENTS_CLIENT_TOKEN'] as string | undefined;
let promise: Promise<Stripe | null> | null = null;
/** The public token must match the server's actual connection environment. */
export const cardFormReady = () => stripeTokenMode(token) !== null;
const getStripe = () => (promise ??= loadStripe(token as string));

/** Built-in secure card form (embedded, PCI-safe). Calls onComplete when the provider reports the form finished. */
export function CardForm({ clientSecret, onComplete, mode = "sandbox" }: { clientSecret: string; onComplete: () => void; mode?: StripeMode }) {
  if (!stripeModesMatch(mode, token)) return <p role="alert">Stripe checkout configuration mismatch. Complete Stripe go-live in Lovable Payments and publish with the matching payment token.</p>;
  if (!cardFormReady()) return null;
  return (
    <div className="overflow-hidden rounded-2xl bg-white" data-testid="card-form">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ clientSecret, onComplete }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}

export function PaymentTestModeBanner({ mode = "sandbox" }: { mode?: StripeMode }) {
  if (mode !== "sandbox") return null;
  return (
    <div className="w-full border-b border-border bg-secondary px-4 py-2 text-center text-xs text-foreground">
      Test mode — no real money is charged.
    </div>
  );
}

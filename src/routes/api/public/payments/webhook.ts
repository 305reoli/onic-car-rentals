import { createFileRoute } from "@tanstack/react-router";
import { stripeWebhookSecretName } from "@/lib/stripeMode";

// Environment-specific signed webhook. Live events remain disabled without the live connection.
// Idempotent (unique event id), with forward-only hold status updates.
type Obj = { id: string; status?: string; payment_status?: string; payment_intent?: string | null; metadata?: Record<string, string>; amount_refunded?: number; amount?: number; amount_received?: number; amount_total?: number | null; customer_details?: { name?: string | null; email?: string | null } | null; customer_email?: string | null; receipt_email?: string | null };
// Paid events are finalized server-side (finalize.server.ts): the browser is never required to create the booking.

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = new URL(request.url).searchParams.get("env");
        if (env !== "sandbox" && env !== "live") return Response.json({ received: true, ignored: "env" });
        const { stripeMode } = await import("@/services/stripe.server");
        if (env === "live" && stripeMode() !== "live") return Response.json({ received: true, ignored: "live_disabled" });
        const secret = (process.env[stripeWebhookSecretName(env)] ?? "").trim();
        if (!secret) return new Response("Webhook not configured", { status: 503 });
        const payload = await request.text();
        const { verifyStripeSignature, isForward } = await import("@/services/stripe.server");
        if (!(await verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret))) return new Response("Invalid signature", { status: 400 });

        const event = JSON.parse(payload) as { id: string; type: string; data: { object: Obj } };
        const o = event.data.object;
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const piId = event.type.startsWith("payment_intent.") ? o.id : event.type.startsWith("charge.") ? (o.payment_intent ?? null) : (o.payment_intent ?? null);
        const bookingId = o.metadata?.['prereservation_id'] ?? null;

        // Idempotency: an event id is processed once.
        const { error: dup } = await db.from("payment_events").insert({
          event_id: event.id, provider: "stripe", booking_id: bookingId && /^[0-9a-f-]{36}$/.test(bookingId) ? bookingId : null,
          provider_order_id: piId ?? o.id, status: event.type, outcome: "received", payload: { type: event.type, id: o.id, status: o.status ?? o.payment_status ?? null },
        });
        if (dup) return Response.json({ received: true, duplicate: true });

        let outcome = "ignored";
        if (event.type === "checkout.session.completed" && o.metadata?.['kind'] === "substitute_difference" && bookingId) {
          const { data: r } = await db.from("prereservations").select("*").eq("id", bookingId).maybeSingle();
          if (r) outcome = (await (await import("@/services/holds.server")).syncSubstituteDifference(db, r)) ? "balance_paid" : "balance_unpaid";
        } else if (event.type === "checkout.session.completed") {
          const { handlePaidStripeEvent } = await import("@/services/finalize.server");
          outcome = await handlePaidStripeEvent(db, { type: "checkout.session.completed", obj: o as never, eventId: event.id });
        } else if (event.type.startsWith("payment_intent.") && o.status) {
          const { data: r } = await db.from("prereservations").select("id, stripe_status").eq("stripe_payment_intent_id", o.id).maybeSingle();
          if (r && isForward(r.stripe_status, o.status)) {
            await db.from("prereservations").update({ stripe_status: o.status, ...(o.status === "succeeded" ? { captured_at: new Date().toISOString() } : {}) }).eq("id", r.id).is("captured_at", null);
            if (o.status !== "succeeded") await db.from("prereservations").update({ stripe_status: o.status }).eq("id", r.id);
            outcome = `status:${o.status}`;
          } else outcome = r ? "stale_ignored" : "unmatched_intent";
          if (event.type === "payment_intent.succeeded") {
            const { handlePaidStripeEvent } = await import("@/services/finalize.server");
            outcome = `${outcome}|${await handlePaidStripeEvent(db, { type: "payment_intent.succeeded", obj: o as never, eventId: event.id })}`;
          }
        } else if (event.type === "identity.verification_session.verified" || event.type === "identity.verification_session.requires_input" || event.type === "identity.verification_session.canceled") {
          const { handleIdentityVerified, handleIdentityFailed, liveIdentityNotifyDeps } = await import("@/services/identity-notify.server");
          try {
            const deps = await liveIdentityNotifyDeps(db, env);
            outcome = event.type.endsWith(".verified") ? await handleIdentityVerified(deps, o) : await handleIdentityFailed(deps, o);
          } catch (e) {
            console.error("[identity] webhook handling failed", e instanceof Error ? e.message : e);
            // Allow Stripe's retry to re-run this event.
            await db.from("payment_events").delete().eq("event_id", event.id);
            return new Response("Identity handling failed", { status: 500 });
          }
        } else if (event.type === "charge.refunded" && piId) {
          await db.from("prereservations").update({ stripe_status: "refunded" }).eq("stripe_payment_intent_id", piId);
          await db.from("prereservations").update({ refunded_at: new Date().toISOString() }).eq("stripe_payment_intent_id", piId).is("refunded_at", null);
          outcome = "refunded";
        }
        await db.from("payment_events").update({ outcome }).eq("event_id", event.id);
        return Response.json({ received: true });
      },
    },
  },
});

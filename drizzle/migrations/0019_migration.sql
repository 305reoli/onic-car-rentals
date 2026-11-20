ALTER TABLE public.prereservations
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_refund_id text,
  ADD COLUMN IF NOT EXISTS balance_amount_usd numeric,
  ADD COLUMN IF NOT EXISTS balance_session_id text,
  ADD COLUMN IF NOT EXISTS balance_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS balance_paid_at timestamptz;
ALTER TABLE public.payment_events ADD COLUMN IF NOT EXISTS event_id text;
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_event_id_key ON public.payment_events(event_id) WHERE event_id IS NOT NULL;
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS globalpays_live boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS globalpays_live_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS globalpays_live_changed_by text NOT NULL DEFAULT '';
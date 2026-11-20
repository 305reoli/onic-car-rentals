ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS instant_full_booking boolean NOT NULL DEFAULT false;
-- Column-level anon grants on vehicles: this column is intentionally NOT granted to anon.
REVOKE SELECT (instant_full_booking) ON public.vehicles FROM anon;

ALTER TABLE public.prereservations
  ADD COLUMN IF NOT EXISTS flow text NOT NULL DEFAULT 'request',
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS provider_order_id text,
  ADD COLUMN IF NOT EXISTS provider_checkout_url text,
  ADD COLUMN IF NOT EXISTS hold_until timestamptz,
  ADD COLUMN IF NOT EXISTS gross_amount numeric,
  ADD COLUMN IF NOT EXISTS gross_currency text,
  ADD COLUMN IF NOT EXISTS paid_amount_usd numeric,
  ADD COLUMN IF NOT EXISTS fee_amount numeric,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS refund_note text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS prereservations_provider_order_uidx
  ON public.prereservations (payment_provider, provider_order_id) WHERE provider_order_id IS NOT NULL;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS msg_confirmed_en text NOT NULL DEFAULT 'Your Sua Locadora booking [code] for [car], [pickup] – [return] in [city], is CONFIRMED and paid in full. We will send your rental agreement to sign before pick-up. Booking details: [link]',
  ADD COLUMN IF NOT EXISTS msg_confirmed_pt text NOT NULL DEFAULT 'Sua reserva Sua Locadora [code] do [car], [pickup] – [return] em [city], está CONFIRMADA e paga integralmente. Enviaremos seu contrato de aluguel para assinatura antes da retirada. Detalhes da reserva: [link]',
  ADD COLUMN IF NOT EXISTS msg_confirmed_es text NOT NULL DEFAULT 'Tu reserva de Sua Locadora [code] del [car], [pickup] – [return] en [city], está CONFIRMADA y pagada en su totalidad. Te enviaremos el contrato de alquiler para firmar antes de la entrega. Detalles de la reserva: [link]',
  ADD COLUMN IF NOT EXISTS wa_tpl_confirmed_en text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS wa_tpl_confirmed_pt text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS wa_tpl_confirmed_es text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.sistemagestao_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.prereservations(id),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sistemagestao_outbox_booking_uidx ON public.sistemagestao_outbox (booking_id);
GRANT SELECT ON public.sistemagestao_outbox TO authenticated;
GRANT ALL ON public.sistemagestao_outbox TO service_role;
ALTER TABLE public.sistemagestao_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin reads sistemagestao outbox" ON public.sistemagestao_outbox FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  booking_id uuid,
  provider_order_id text,
  status text NOT NULL DEFAULT '',
  outcome text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin reads payment events" ON public.payment_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TABLE public.payment_orphans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ref text NOT NULL UNIQUE,
 provider text NOT NULL DEFAULT 'stripe',
 stripe_session_id text, stripe_payment_intent_id text,
 booking_id uuid,
 amount_usd numeric, customer_name text, customer_email text,
 reason text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','recovered','dismissed')),
 event_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);
GRANT SELECT ON public.payment_orphans TO authenticated;
GRANT ALL ON public.payment_orphans TO service_role;
ALTER TABLE public.payment_orphans ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_read_payment_orphans ON public.payment_orphans FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
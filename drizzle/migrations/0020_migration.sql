ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'inherit';
ALTER TABLE public.prereservations
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'signal',
  ADD COLUMN IF NOT EXISTS original_vehicle_id uuid,
  ADD COLUMN IF NOT EXISTS original_vehicle_name text,
  ADD COLUMN IF NOT EXISTS substitute_status text,
  ADD COLUMN IF NOT EXISTS substitute_offered_at timestamptz,
  ADD COLUMN IF NOT EXISTS substitute_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS substitute_explicit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS substitute_reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS substitute_refund_usd numeric,
  ADD COLUMN IF NOT EXISTS substitute_info jsonb;
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS payment_modes jsonb NOT NULL DEFAULT '{"exotics":"full","sports":"full"}'::jsonb,
  ADD COLUMN IF NOT EXISTS substitute_window_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS substitute_reminder_hours integer NOT NULL DEFAULT 4;

CREATE TABLE public.booking_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prereservation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL DEFAULT 'system',
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.booking_audit TO authenticated;
GRANT ALL ON public.booking_audit TO service_role;
ALTER TABLE public.booking_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read booking audit" ON public.booking_audit FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX booking_audit_pre_idx ON public.booking_audit (prereservation_id, created_at);
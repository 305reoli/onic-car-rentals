ALTER TABLE public.prereservations ADD COLUMN IF NOT EXISTS client_type text CHECK (client_type IS NULL OR client_type IN ('brazilian','international')),
  ADD COLUMN IF NOT EXISTS gp_refund_due_usd numeric, ADD COLUMN IF NOT EXISTS gp_refund_marked_at timestamptz;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS gp_interest_free_installments integer NOT NULL DEFAULT 6;
UPDATE public.settings SET payment_modes = '{"exotics":"full","sports":"full"}'::jsonb WHERE id = 1;
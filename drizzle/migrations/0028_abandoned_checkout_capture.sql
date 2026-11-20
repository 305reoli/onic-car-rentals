CREATE TABLE public.checkout_captures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 status text NOT NULL DEFAULT 'pending_payment',
 first_name text NOT NULL, last_name text NOT NULL, email text NOT NULL, phone text NOT NULL,
 vehicle_id uuid NOT NULL REFERENCES public.vehicles(id), vehicle_name text NOT NULL, vehicle_slug text NOT NULL,
 base_city text NOT NULL, service_city text NOT NULL,
 pickup_at timestamptz NOT NULL, return_at timestamptz NOT NULL, total_usd numeric,
 language text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
 booking_id uuid REFERENCES public.prereservations(id),
 recovery_attempted_at timestamptz, recovery_sent_at timestamptz, recovery_receipt text, recovery_error text,
 CONSTRAINT capture_status CHECK (status IN ('pending_payment','completed','expired')),
 CONSTRAINT capture_language CHECK (language IN ('pt','en','es'))
);
GRANT SELECT, DELETE ON public.checkout_captures TO authenticated;
GRANT ALL ON public.checkout_captures TO service_role;
ALTER TABLE public.checkout_captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_read_captures ON public.checkout_captures FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY admin_delete_captures ON public.checkout_captures FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin') AND status <> 'completed');
CREATE INDEX capture_recovery_due ON public.checkout_captures(created_at) WHERE status = 'pending_payment';
ALTER TABLE public.prereservations ADD COLUMN checkout_capture_token uuid;
CREATE OR REPLACE FUNCTION public.track_checkout_capture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NEW.checkout_capture_token IS NULL THEN RETURN NEW; END IF;
 IF TG_OP = 'INSERT' THEN
  UPDATE public.checkout_captures SET booking_id = NEW.id
  WHERE token = NEW.checkout_capture_token AND status = 'pending_payment' AND expires_at > now()
    AND lower(email) = lower(NEW.email) AND vehicle_id = NEW.vehicle_id AND pickup_at = NEW.pickup_at AND return_at = NEW.return_at;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid checkout capture'; END IF;
 END IF;
 IF NEW.status IN ('pending_approval','approved','confirmed','substitute_offered','paid_conflict','amount_review') OR NEW.stripe_status IN ('requires_capture','succeeded') OR NEW.captured_at IS NOT NULL OR NEW.settled_at IS NOT NULL OR NEW.balance_paid_at IS NOT NULL OR coalesce(NEW.paid_amount_usd,0) > 0 THEN
  UPDATE public.checkout_captures SET status = 'completed' WHERE token = NEW.checkout_capture_token;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER track_checkout_capture AFTER INSERT OR UPDATE ON public.prereservations FOR EACH ROW EXECUTE FUNCTION public.track_checkout_capture();
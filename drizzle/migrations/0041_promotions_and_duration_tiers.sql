ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS duration_tiers jsonb NOT NULL DEFAULT '{"two": 5, "three": 10}'::jsonb;

CREATE TABLE public.vehicle_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  pct integer NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vehicle_promotions_vehicle_idx ON public.vehicle_promotions(vehicle_id);

GRANT SELECT ON public.vehicle_promotions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_promotions TO authenticated;
GRANT ALL ON public.vehicle_promotions TO service_role;
ALTER TABLE public.vehicle_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promotions public read active" ON public.vehicle_promotions FOR SELECT TO anon, authenticated USING (active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "promotions admin insert" ON public.vehicle_promotions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "promotions admin update" ON public.vehicle_promotions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "promotions admin delete" ON public.vehicle_promotions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.validate_vehicle_promotion() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.pct < 1 OR NEW.pct > 100 THEN RAISE EXCEPTION 'PROMO_PCT: percentage must be 1-100'; END IF;
  IF NEW.ends_on < NEW.starts_on THEN RAISE EXCEPTION 'PROMO_DATES: end date must be on or after start date'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = NEW.vehicle_id AND v.daily_price_usd > 0) THEN RAISE EXCEPTION 'PROMO_PRICELESS: car has no daily price'; END IF;
  IF NEW.active AND EXISTS (SELECT 1 FROM public.vehicle_promotions p WHERE p.vehicle_id = NEW.vehicle_id AND p.active AND p.id <> NEW.id AND p.starts_on <= NEW.ends_on AND p.ends_on >= NEW.starts_on) THEN
    RAISE EXCEPTION 'PROMO_OVERLAP: this car already has a promotion overlapping these dates';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER vehicle_promotions_validate BEFORE INSERT OR UPDATE ON public.vehicle_promotions FOR EACH ROW EXECUTE FUNCTION public.validate_vehicle_promotion();

CREATE OR REPLACE FUNCTION public.validate_duration_tiers() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT ((NEW.duration_tiers->>'two')::numeric BETWEEN 0 AND 100 AND (NEW.duration_tiers->>'three')::numeric BETWEEN 0 AND 100) THEN
    RAISE EXCEPTION 'TIERS: each tier must be 0-100';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER settings_validate_tiers BEFORE UPDATE OF duration_tiers ON public.settings FOR EACH ROW EXECUTE FUNCTION public.validate_duration_tiers();
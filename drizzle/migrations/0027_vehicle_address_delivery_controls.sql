ALTER TABLE public.vehicles ADD COLUMN delivery_pricing jsonb DEFAULT NULL, ADD COLUMN allows_one_way boolean NOT NULL DEFAULT true;
GRANT SELECT (allows_one_way) ON public.vehicles TO anon;
GRANT SELECT (delivery_pricing, allows_one_way), UPDATE (delivery_pricing, allows_one_way) ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicle_delivery_pricing_object CHECK (delivery_pricing IS NULL OR jsonb_typeof(delivery_pricing) = 'object');
COMMENT ON COLUMN public.vehicles.delivery_pricing IS 'Admin-only nullable address delivery overrides; null inherits category settings for new quotes.';
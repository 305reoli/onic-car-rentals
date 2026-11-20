ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS extra_mile_price_usd numeric NULL;
GRANT SELECT (extra_mile_price_usd) ON public.vehicles TO anon;
GRANT SELECT (extra_mile_price_usd) ON public.vehicles TO authenticated;
UPDATE public.vehicles SET mileage_limit = '200', extra_mile_price_usd = 2 WHERE slug = 'tesla-cybertruck';
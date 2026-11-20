ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS fleet_from_city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delivery_fee_usd numeric;
UPDATE public.cities SET fleet_from_city = CASE slug WHEN 'tampa' THEN 'orlando' WHEN 'fort-lauderdale' THEN 'miami' ELSE slug END WHERE fleet_from_city = '';
ALTER TABLE public.prereservations
  ADD COLUMN IF NOT EXISTS service_city text,
  ADD COLUMN IF NOT EXISTS base_city text;
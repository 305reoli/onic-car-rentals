ALTER TABLE public.prereservations
 ADD COLUMN IF NOT EXISTS logistics_mode text CHECK (logistics_mode IN ('delivery','collection','both')),
 ADD COLUMN IF NOT EXISTS logistics_fee_usd numeric,
 ADD COLUMN IF NOT EXISTS base_daily_usd numeric,
 ADD COLUMN IF NOT EXISTS all_in_daily_usd numeric;
COMMENT ON COLUMN public.cities.delivery_fee_usd IS 'DEPRECATED: replaced by settings.delivery_config (owner delivery table)';
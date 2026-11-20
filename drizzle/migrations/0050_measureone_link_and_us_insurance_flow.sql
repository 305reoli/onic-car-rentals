ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS measureone_static_link text NOT NULL DEFAULT '';
GRANT SELECT (measureone_static_link) ON public.settings TO anon, authenticated;
ALTER TABLE public.prereservations ADD COLUMN IF NOT EXISTS insurance_us_flow text CHECK (insurance_us_flow IN ('measureone_started','fallback_uploaded'));
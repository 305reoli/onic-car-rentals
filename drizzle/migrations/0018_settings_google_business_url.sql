ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS google_business_url text NOT NULL DEFAULT '';
GRANT SELECT (google_business_url) ON public.settings TO anon, authenticated;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS rentalcover_affiliate_link text NOT NULL DEFAULT '';
GRANT SELECT (rentalcover_affiliate_link) ON public.settings TO anon, authenticated;
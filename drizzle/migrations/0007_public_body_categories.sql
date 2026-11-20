ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS body_category text NOT NULL DEFAULT 'suv',
  ADD COLUMN IF NOT EXISTS is_convertible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_category boolean NOT NULL DEFAULT false;
GRANT SELECT (body_category, is_convertible) ON public.vehicles TO anon;
GRANT SELECT (body_category, is_convertible, review_category) ON public.vehicles TO authenticated;
GRANT UPDATE (body_category, is_convertible, review_category), INSERT (body_category, is_convertible, review_category) ON public.vehicles TO authenticated;
UPDATE public.vehicles SET body_category = CASE category
  WHEN 'luxury_suv' THEN 'luxury' WHEN 'sport' THEN 'sports' WHEN 'exotic' THEN 'exotics'
  ELSE CASE WHEN name IN ('Hyundai Elantra','Toyota Corolla') THEN 'sedan' ELSE 'suv' END END;
UPDATE public.vehicles SET is_convertible = true WHERE name IN ('Mercedes-Benz C300 Cabrio','Ferrari Portofino','Lamborghini Huracan Evo Spyder');
UPDATE public.vehicles SET review_category = true WHERE name IN ('Kia Carnival','Chrysler Pacifica','Dodge Ram 2500','Tesla Cybertruck','Ford New Mustang','Chevrolet Corvette C8');
REVOKE SELECT ON public.vehicles FROM anon;
GRANT SELECT (id, slug, name, brand, model, city, catalog_group, category, color, seats, bags, doors, hp, transmission,
  daily_price_usd, min_days, mileage_limit, min_age, security_deposit_usd, prereservation_amount_usd,
  description_en, description_pt, description_es, highlights, photos, blocked_dates, is_sample, sort_order, active,
  created_at, updated_at) ON public.vehicles TO anon;
COMMENT ON COLUMN public.vehicles.owner_type IS 'INTERNAL: admin only, never exposed publicly';
COMMENT ON COLUMN public.vehicles.confirmation_type IS 'INTERNAL: admin only, never exposed publicly';
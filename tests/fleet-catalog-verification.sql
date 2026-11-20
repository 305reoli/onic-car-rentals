-- Read-only live-data regression checks. Each check raises division by zero on failure.
SELECT 'exactly_two_escalades' AS rule,
  1 / CASE WHEN (SELECT count(*) FROM public.vehicles WHERE name ILIKE '%escalade%') = 2 THEN 1 ELSE 0 END AS passed
UNION ALL
SELECT '2024_escalade_399',
  1 / CASE WHEN (SELECT count(*) FROM public.vehicles WHERE name = 'Cadillac Escalade ESV Sport 2024' AND daily_price_usd = 399 AND is_sample = false) = 1 THEN 1 ELSE 0 END
UNION ALL
SELECT '2026_escalade_499',
  1 / CASE WHEN (SELECT count(*) FROM public.vehicles WHERE name = 'Cadillac Escalade ESV Sport 2026' AND daily_price_usd = 499 AND is_sample = false) = 1 THEN 1 ELSE 0 END
UNION ALL
SELECT 'template_escalades_removed',
  1 / CASE WHEN NOT EXISTS (SELECT 1 FROM public.vehicles WHERE slug IN ('cadillac-escalade', 'cadillac-escalade-600')) THEN 1 ELSE 0 END
UNION ALL
SELECT 'boats_and_motorhomes_excluded',
  1 / CASE WHEN NOT EXISTS (SELECT 1 FROM public.vehicles WHERE category ~* '(boat|motorhome)' OR body_category ~* '(boat|motorhome)' OR name ~* '(schaefer|nx 400|azimut|flybridge|motorhome|motor home)') THEN 1 ELSE 0 END;
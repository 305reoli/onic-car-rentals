ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS delivery_config jsonb NOT NULL DEFAULT '{
 "bases": {
  "orlando": {"address": "123 Sua Rua, Orlando, FL 00000", "lat": 28.4497, "lng": -81.3615},
  "miami": {"address": "456 Sua Avenida, Miami Beach, FL 00000", "lat": 25.7887, "lng": -80.1417}
 },
 "airports": {
  "orlando": {"code": "MCO", "terminal": "Orlando International Airport (MCO) — Terminal A arrivals", "lat": 28.4312, "lng": -81.3081},
  "tampa": {"code": "TPA", "terminal": "Tampa International Airport (TPA) — Main Terminal arrivals", "lat": 27.9755, "lng": -82.5332},
  "miami": {"code": "MIA", "terminal": "Miami International Airport (MIA) — arrivals", "lat": 25.7959, "lng": -80.2870},
  "fort-lauderdale": {"code": "FLL", "terminal": "Fort Lauderdale-Hollywood International Airport (FLL) — arrivals", "lat": 26.0726, "lng": -80.1527}
 },
 "standard": {"airport_one_way": 40, "airport_round_trip": 60, "address_threshold_mi": 15, "address_near": 60, "address_far": 80},
 "exotic": {"a_mi": 7, "a_fee": 120, "b_mi": 15, "b_fee": 150},
 "insurance_by_category": {"suv": true, "sedan": true, "luxury": true, "sports": false, "exotics": false}
}'::jsonb;

ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS insurance_override text NOT NULL DEFAULT 'inherit' CHECK (insurance_override IN ('inherit','on','off'));
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS delivery_tier_override text NOT NULL DEFAULT 'inherit' CHECK (delivery_tier_override IN ('inherit','standard','exotic'));
GRANT SELECT (insurance_override, delivery_tier_override) ON public.vehicles TO anon;

ALTER TABLE public.prereservations
 ADD COLUMN IF NOT EXISTS delivery_type text CHECK (delivery_type IN ('pickup','airport','address')),
 ADD COLUMN IF NOT EXISTS airport_mode text CHECK (airport_mode IN ('one_way','round_trip')),
 ADD COLUMN IF NOT EXISTS delivery_address text,
 ADD COLUMN IF NOT EXISTS delivery_lat double precision,
 ADD COLUMN IF NOT EXISTS delivery_lng double precision,
 ADD COLUMN IF NOT EXISTS distance_mi numeric,
 ADD COLUMN IF NOT EXISTS delivery_tier text CHECK (delivery_tier IN ('standard','exotic')),
 ADD COLUMN IF NOT EXISTS delivery_fee_usd numeric,
 ADD COLUMN IF NOT EXISTS delivery_status text CHECK (delivery_status IN ('priced','quote_pending','set_by_owner'));
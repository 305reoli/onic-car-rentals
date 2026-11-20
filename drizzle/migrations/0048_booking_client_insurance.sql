ALTER TABLE public.prereservations
  ADD COLUMN IF NOT EXISTS insurance_choice text CHECK (insurance_choice IN ('own','ben')),
  ADD COLUMN IF NOT EXISTS insurance_status text CHECK (insurance_status IN ('pending_review','verified','denied')),
  ADD COLUMN IF NOT EXISTS insurance_denial_reason text CHECK (insurance_denial_reason IN ('not_active','missing_collision_comprehensive','liability_below_minimum','deductible_too_high')),
  ADD COLUMN IF NOT EXISTS insurance_reviewed_at timestamptz;
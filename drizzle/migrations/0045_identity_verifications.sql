CREATE TABLE public.identity_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  client_ref uuid NOT NULL DEFAULT gen_random_uuid(),
  license_country text NOT NULL,
  mode text NOT NULL,
  status text NOT NULL DEFAULT 'requires_input',
  verified_at timestamptz,
  outputs jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.identity_verifications TO service_role;
ALTER TABLE public.identity_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prereservations ADD COLUMN IF NOT EXISTS identity_verification jsonb;
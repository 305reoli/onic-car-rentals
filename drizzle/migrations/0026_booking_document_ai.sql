ALTER TABLE public.prereservations ADD COLUMN IF NOT EXISTS document_ai jsonb, ADD COLUMN IF NOT EXISTS license_number text, ADD COLUMN IF NOT EXISTS license_expiry date, ADD COLUMN IF NOT EXISTS passport_number text;
CREATE TABLE public.document_checks (folder text PRIMARY KEY, results jsonb NOT NULL DEFAULT '{}'::jsonb, state text NOT NULL DEFAULT 'ready', error text, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_checks TO service_role;
ALTER TABLE public.document_checks ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.document_checks IS 'Private document extraction cache and durable AI access state; server-only writes, no browser grants.';
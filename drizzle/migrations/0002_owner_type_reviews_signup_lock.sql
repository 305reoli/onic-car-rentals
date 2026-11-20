ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS owner_type text NOT NULL DEFAULT 'own' CHECK (owner_type IN ('own','partner'));
UPDATE public.vehicles SET owner_type = 'partner', confirmation_type = 'on_request' WHERE slug = 'ferrari-portofino';

ALTER TABLE public.prereservations ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- Internal partner names: admin only, never public.
CREATE TABLE public.vehicle_partners (
  vehicle_id uuid PRIMARY KEY REFERENCES public.vehicles(id) ON DELETE CASCADE,
  partner_name text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_partners TO authenticated;
GRANT ALL ON public.vehicle_partners TO service_role;
ALTER TABLE public.vehicle_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manages partners" ON public.vehicle_partners FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Server-side cache for Google reviews (service role only).
CREATE TABLE public.google_reviews_cache (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.google_reviews_cache TO service_role;
ALTER TABLE public.google_reviews_cache ENABLE ROW LEVEL SECURITY;

-- Once the owner exists, block any further sign-ups.
CREATE OR REPLACE FUNCTION public.block_signup_after_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'Sign-ups are closed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER before_auth_user_created_block BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.block_signup_after_owner();

CREATE OR REPLACE FUNCTION public.owner_exists()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
$$;
GRANT EXECUTE ON FUNCTION public.owner_exists() TO anon, authenticated;
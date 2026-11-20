CREATE TABLE public.fleet_base_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  changed_by_email text NOT NULL DEFAULT '',
  fleet text NOT NULL,
  old_base jsonb,
  new_base jsonb NOT NULL
);
GRANT SELECT ON public.fleet_base_changes TO authenticated;
GRANT ALL ON public.fleet_base_changes TO service_role;
ALTER TABLE public.fleet_base_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read base changes" ON public.fleet_base_changes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
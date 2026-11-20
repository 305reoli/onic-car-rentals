CREATE OR REPLACE FUNCTION public.block_signup_after_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'Sign-ups are closed';
  END IF;
  IF lower(coalesce(NEW.email, '')) <> 'dono@seudominio.com' THEN
    RAISE EXCEPTION 'Only the owner email can create the admin account';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.assign_first_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(coalesce(NEW.email, '')) = 'dono@seudominio.com'
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END $$;
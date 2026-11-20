CREATE OR REPLACE FUNCTION public.queue_site_fleet_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.vehicles; typ text; photo_list jsonb; rc_origin boolean; changed text[]:='{}'; other boolean:=false;
BEGIN
 IF current_setting('app.fleet_sync_inbound',true)='true' THEN RETURN NULL; END IF;
 v:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 rc_origin:=EXISTS(SELECT 1 FROM public.fleet_sync_links WHERE site_vehicle_id=v.id AND provenance='sistemagestao');
 IF TG_OP='UPDATE' THEN
  IF to_jsonb(NEW)-'updated_at'=to_jsonb(OLD)-'updated_at' THEN RETURN NULL; END IF;
  IF NEW.daily_price_usd IS DISTINCT FROM OLD.daily_price_usd THEN changed:=array_append(changed,'daily_price'); END IF;
  IF NEW.security_deposit_usd IS DISTINCT FROM OLD.security_deposit_usd THEN changed:=array_append(changed,'security_deposit'); END IF;
  IF NEW.insurance_deductible_usd IS DISTINCT FROM OLD.insurance_deductible_usd THEN changed:=array_append(changed,'deductible'); END IF;
  IF NEW.min_days IS DISTINCT FROM OLD.min_days THEN changed:=array_append(changed,'minimum_days'); END IF;
  IF NEW.min_age IS DISTINCT FROM OLD.min_age THEN changed:=array_append(changed,'minimum_age'); END IF;
  IF NEW.body_category IS DISTINCT FROM OLD.body_category THEN changed:=array_append(changed,'category'); END IF;
  IF coalesce(array_length(changed,1),0) > 0 THEN
   INSERT INTO public.fleet_sync_outbox(vehicle_id,event_type,snapshot,schema_version,changed_fields) VALUES(v.id,'vehicle.updated',jsonb_build_object('daily_price',v.daily_price_usd,'security_deposit',v.security_deposit_usd,'deductible',v.insurance_deductible_usd,'minimum_days',v.min_days,'minimum_age',v.min_age,'category',v.body_category),2,to_jsonb(changed));
  END IF;
  IF NEW.active IS DISTINCT FROM OLD.active OR NEW.blocked_dates IS DISTINCT FROM OLD.blocked_dates THEN PERFORM public.queue_site_availability(v.id); END IF;
  other:=(to_jsonb(NEW)-ARRAY['updated_at','daily_price_usd','security_deposit_usd','insurance_deductible_usd','min_days','min_age','body_category','blocked_dates','active']) <> (to_jsonb(OLD)-ARRAY['updated_at','daily_price_usd','security_deposit_usd','insurance_deductible_usd','min_days','min_age','body_category','blocked_dates','active']);
  IF rc_origin THEN RETURN NULL; END IF;
  IF OLD.active AND NOT NEW.active THEN typ:='vehicle.archived';
  ELSIF other OR (NOT OLD.active AND NEW.active) THEN typ:='vehicle.updated';
  ELSE RETURN NULL; END IF;
 ELSIF TG_OP='DELETE' THEN typ:='vehicle.deleted';
 ELSE typ:='vehicle.created';
 END IF;
 IF rc_origin THEN RETURN NULL; END IF;
 SELECT coalesce(jsonb_agg(CASE WHEN p LIKE 'https://%' THEN p WHEN p LIKE '/%' THEN 'https://seudominio.com'||p ELSE 'https://seudominio.com/api/public/photo/'||p END ORDER BY n),'[]'::jsonb) INTO photo_list FROM unnest(v.photos) WITH ORDINALITY x(p,n);
 INSERT INTO public.fleet_sync_outbox(vehicle_id,event_type,snapshot) VALUES(v.id,typ,jsonb_build_object('name',v.name,'brand',v.brand,'model',v.model,'year',NULL,'color',v.color,'category',v.body_category,'daily_price',v.daily_price_usd,'security_deposit',v.security_deposit_usd,'deductible',v.insurance_deductible_usd,'photos',photo_list,'base_city',v.city,'status',CASE WHEN v.active THEN 'active' ELSE 'inactive' END));
 RETURN NULL;
END $$;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS insurance_deductible_usd numeric NULL CHECK (insurance_deductible_usd IS NULL OR insurance_deductible_usd >= 0);
COMMENT ON COLUMN public.vehicles.insurance_deductible_usd IS 'Admin-only per-car deductible override; NULL = category rule in insuranceDeductible().';
ALTER TABLE public.fleet_sync_events ADD COLUMN IF NOT EXISTS payload_hash text;
ALTER TABLE public.fleet_sync_outbox ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1, ADD COLUMN IF NOT EXISTS changed_fields jsonb, ADD COLUMN IF NOT EXISTS availability jsonb;

CREATE TABLE public.fleet_sync_remote_availability (
 site_vehicle_id uuid PRIMARY KEY REFERENCES public.vehicles(id) ON DELETE CASCADE,
 available boolean NOT NULL, reason text, ranges jsonb NOT NULL DEFAULT '[]',
 source_revision bigint NOT NULL, event_id text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fleet_sync_remote_availability TO authenticated;
GRANT ALL ON public.fleet_sync_remote_availability TO service_role;
ALTER TABLE public.fleet_sync_remote_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY fleet_remote_avail_admin ON public.fleet_sync_remote_availability FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Local (site-owned) availability only; remote SistemaGestao blocks are never echoed back.
CREATE OR REPLACE FUNCTION public.site_vehicle_availability(vid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.vehicles; rs jsonb; busy_now boolean;
BEGIN
 SELECT * INTO v FROM public.vehicles WHERE id=vid;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT coalesce(jsonb_agg(x ORDER BY x->>'start_at'),'[]'::jsonb) INTO rs FROM (
  SELECT jsonb_build_object('start_at',to_char(pickup_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'end_at',to_char(return_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'reason','booking') x
   FROM public.prereservations WHERE vehicle_id=vid AND return_at>now() AND status IN ('pending_approval','substitute_offered','approved','confirmed','paid_conflict','amount_review')
  UNION ALL
  SELECT jsonb_build_object('start_at',to_char((d::date)::timestamp AT TIME ZONE 'America/New_York' AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'end_at',to_char(((d::date)+1)::timestamp AT TIME ZONE 'America/New_York' AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'reason','blocked')
   FROM unnest(v.blocked_dates) d WHERE (d::date) >= (now() AT TIME ZONE 'America/New_York')::date
 ) q;
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(rs) r WHERE (r->>'start_at')::timestamptz<=now() AND (r->>'end_at')::timestamptz>now()) INTO busy_now;
 RETURN jsonb_build_object('available', v.active AND NOT busy_now, 'reason', CASE WHEN NOT v.active THEN 'inactive' WHEN busy_now THEN (SELECT r->>'reason' FROM jsonb_array_elements(rs) r WHERE (r->>'start_at')::timestamptz<=now() AND (r->>'end_at')::timestamptz>now() LIMIT 1) ELSE 'available' END, 'ranges', rs);
END $$;
REVOKE ALL ON FUNCTION public.site_vehicle_availability(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.site_vehicle_availability(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.queue_site_availability(vid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF vid IS NULL OR current_setting('app.fleet_sync_inbound',true)='true' THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.vehicles WHERE id=vid) THEN RETURN; END IF;
 INSERT INTO public.fleet_sync_outbox(vehicle_id,event_type,snapshot,schema_version,availability) VALUES(vid,'vehicle.availability_changed','{}'::jsonb,2,public.site_vehicle_availability(vid));
END $$;
REVOKE ALL ON FUNCTION public.queue_site_availability(uuid) FROM PUBLIC,anon,authenticated;

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

CREATE OR REPLACE FUNCTION public.queue_booking_availability() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE blocking text[]:=ARRAY['pending_approval','substitute_offered','approved','confirmed','paid_conflict','amount_review']; ob boolean:=false; nb boolean:=false;
BEGIN
 IF TG_OP<>'INSERT' THEN ob:=OLD.status=ANY(blocking); END IF;
 IF TG_OP<>'DELETE' THEN nb:=NEW.status=ANY(blocking); END IF;
 IF TG_OP='UPDATE' AND ob=nb AND (NOT nb OR (NEW.vehicle_id IS NOT DISTINCT FROM OLD.vehicle_id AND NEW.pickup_at=OLD.pickup_at AND NEW.return_at=OLD.return_at)) THEN RETURN NULL; END IF;
 IF NOT ob AND NOT nb THEN RETURN NULL; END IF;
 IF TG_OP<>'INSERT' AND ob THEN PERFORM public.queue_site_availability(OLD.vehicle_id); END IF;
 IF TG_OP<>'DELETE' AND nb AND (TG_OP='INSERT' OR NOT ob OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id OR NEW.pickup_at<>OLD.pickup_at OR NEW.return_at<>OLD.return_at) AND (TG_OP='INSERT' OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id OR NOT ob) THEN PERFORM public.queue_site_availability(NEW.vehicle_id);
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.queue_booking_availability() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER site_booking_availability AFTER INSERT OR UPDATE OF status,vehicle_id,pickup_at,return_at OR DELETE ON public.prereservations FOR EACH ROW EXECUTE FUNCTION public.queue_booking_availability();

-- v2 inbound: idempotent on event_id (hash conflict rejected), stale revisions ignored, applies only the given patch; inbound flag suppresses echoes.
CREATE OR REPLACE FUNCTION public.apply_sistemagestao_fleet_v2(e jsonb, hash text, patch jsonb, avail jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior public.fleet_sync_events; l public.fleet_sync_links; rev bigint:=(e->>'source_revision')::bigint; typ text:=e->>'event_type'; act text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('site-fleet-sync',0));
 SELECT * INTO prior FROM public.fleet_sync_events WHERE event_id=e->>'event_id';
 IF FOUND THEN
  IF prior.payload_hash IS NOT NULL AND prior.payload_hash<>hash THEN RETURN jsonb_build_object('ok',false,'error','conflicting_event_id'); END IF;
  RETURN jsonb_build_object('ok',true,'duplicate',true,'site_vehicle_id',prior.site_vehicle_id,'action',prior.action);
 END IF;
 SELECT * INTO l FROM public.fleet_sync_links WHERE origin_system='sistemagestao' AND origin_vehicle_id=e->>'origin_vehicle_id';
 IF NOT FOUND THEN RAISE EXCEPTION 'vehicle_not_mapped' USING ERRCODE='P0001'; END IF;
 IF rev<=l.source_revision OR EXISTS(SELECT 1 FROM public.fleet_sync_events WHERE origin_vehicle_id=e->>'origin_vehicle_id' AND source_revision>=rev) THEN
  act:='stale_ignored';
 ELSE
  PERFORM set_config('app.fleet_sync_inbound','true',true);
  IF typ='vehicle.availability_changed' THEN
   INSERT INTO public.fleet_sync_remote_availability(site_vehicle_id,available,reason,ranges,source_revision,event_id) VALUES(l.site_vehicle_id,(avail->>'available')::boolean,avail->>'reason',coalesce(avail->'ranges','[]'),rev,e->>'event_id')
   ON CONFLICT(site_vehicle_id) DO UPDATE SET available=EXCLUDED.available,reason=EXCLUDED.reason,ranges=EXCLUDED.ranges,source_revision=EXCLUDED.source_revision,event_id=EXCLUDED.event_id,updated_at=now();
   act:='availability_applied';
  ELSE
   UPDATE public.vehicles SET
    daily_price_usd=CASE WHEN patch ? 'daily_price_usd' THEN (patch->>'daily_price_usd')::numeric ELSE daily_price_usd END,
    security_deposit_usd=CASE WHEN patch ? 'security_deposit_usd' THEN (patch->>'security_deposit_usd')::numeric ELSE security_deposit_usd END,
    insurance_deductible_usd=CASE WHEN patch ? 'insurance_deductible_usd' THEN (patch->>'insurance_deductible_usd')::numeric ELSE insurance_deductible_usd END,
    min_days=CASE WHEN patch ? 'min_days' THEN (patch->>'min_days')::integer ELSE min_days END,
    min_age=CASE WHEN patch ? 'min_age' THEN (patch->>'min_age')::integer ELSE min_age END,
    body_category=CASE WHEN patch ? 'body_category' THEN patch->>'body_category' ELSE body_category END,
    updated_at=now() WHERE id=l.site_vehicle_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'mapped_vehicle_missing'; END IF;
   act:='rules_applied';
  END IF;
  UPDATE public.fleet_sync_links SET source_revision=rev,updated_at=now() WHERE origin_system='sistemagestao' AND origin_vehicle_id=e->>'origin_vehicle_id';
 END IF;
 INSERT INTO public.fleet_sync_events(event_id,origin_vehicle_id,source_revision,event_type,site_vehicle_id,action,flags,payload_hash) VALUES(e->>'event_id',e->>'origin_vehicle_id',rev,typ,l.site_vehicle_id,act,'[]'::jsonb,hash);
 RETURN jsonb_build_object('ok',true,'duplicate',false,'site_vehicle_id',l.site_vehicle_id,'action',act);
END $$;
REVOKE ALL ON FUNCTION public.apply_sistemagestao_fleet_v2(jsonb,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_sistemagestao_fleet_v2(jsonb,text,jsonb,jsonb) TO service_role;
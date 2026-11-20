CREATE OR REPLACE FUNCTION public.apply_sistemagestao_fleet_v2(e jsonb, hash text, patch jsonb, avail jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
   -- Price freeze (owner decision): daily_price_usd is never written from SistemaGestao.
   UPDATE public.vehicles SET
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
END $function$;
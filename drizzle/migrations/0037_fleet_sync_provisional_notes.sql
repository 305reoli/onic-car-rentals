CREATE OR REPLACE FUNCTION public.guard_fleet_source_revision()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE latest bigint;
BEGIN
 -- Note-only edits (same revision) are allowed; only a revision change must be newer than recorded events.
 IF TG_OP='UPDATE' AND NEW.source_revision=OLD.source_revision THEN RETURN NEW; END IF;
 SELECT max(source_revision) INTO latest FROM public.fleet_sync_events WHERE origin_vehicle_id=NEW.origin_vehicle_id;
 IF latest IS NOT NULL AND NEW.source_revision<=latest THEN RAISE EXCEPTION 'stale_fleet_revision' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.apply_sistemagestao_fleet_event(e jsonb, p jsonb, flags jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE l public.fleet_sync_links; prior public.fleet_sync_events; vid uuid; act text; candidate text; stem text; code text; suffix integer:=1; rev bigint:=(e->>'source_revision')::bigint; typ text:=e->>'event_type';
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('site-fleet-sync',0));
 SELECT * INTO prior FROM public.fleet_sync_events WHERE event_id=e->>'event_id';
 IF FOUND THEN RETURN jsonb_build_object('ok',true,'site_vehicle_id',prior.site_vehicle_id,'action','duplicate_ignored'); END IF;
 SELECT * INTO l FROM public.fleet_sync_links WHERE origin_system='sistemagestao' AND origin_vehicle_id=e->>'origin_vehicle_id';
 vid:=l.site_vehicle_id;
 IF (vid IS NOT NULL AND rev<=l.source_revision) OR EXISTS(SELECT 1 FROM public.fleet_sync_events WHERE origin_vehicle_id=e->>'origin_vehicle_id' AND source_revision>=rev) THEN act:='duplicate_ignored';
 ELSE
  PERFORM set_config('app.fleet_sync_inbound','true',true);
  IF typ IN ('vehicle.archived','vehicle.deleted') THEN
   IF vid IS NOT NULL THEN UPDATE public.vehicles SET active=false,updated_at=now() WHERE id=vid; END IF;
   act:=CASE WHEN vid IS NULL THEN 'unmapped_ignored' ELSE 'inactivated' END;
  ELSIF vid IS NULL AND typ='vehicle.updated' THEN
   RAISE EXCEPTION 'vehicle_not_mapped' USING ERRCODE='P0001';
  ELSIF vid IS NULL THEN
   stem:=p->>'slug'; candidate:=stem;
   WHILE EXISTS(SELECT 1 FROM public.vehicles WHERE slug=candidate) LOOP suffix:=suffix+1; candidate:=stem||'-'||suffix; END LOOP;
   suffix:=1; code:=p->>'internal_label';
   WHILE EXISTS(SELECT 1 FROM public.vehicles WHERE internal_label=code) LOOP suffix:=suffix+1; code:=(p->>'internal_label')||'-'||suffix; END LOOP;
   INSERT INTO public.vehicles(name,brand,model,color,city,body_category,category,daily_price_usd,security_deposit_usd,active,photos,slug,internal_label,min_days,mileage_limit,admin_note)
   VALUES(p->>'name',p->>'brand',p->>'model',p->>'color',p->>'city',p->>'body_category',p->>'category',(p->>'daily_price_usd')::numeric,(p->>'security_deposit_usd')::numeric,(p->>'active')::boolean,ARRAY(SELECT jsonb_array_elements_text(p->'photos')),candidate,code,NULL,'',coalesce(p->>'admin_note','')) RETURNING id INTO vid;
   act:='created';
  ELSE
   UPDATE public.vehicles SET name=p->>'name',brand=p->>'brand',model=p->>'model',color=p->>'color',city=p->>'city',body_category=p->>'body_category',category=p->>'category',photos=ARRAY(SELECT jsonb_array_elements_text(p->'photos')),active=(p->>'active')::boolean,updated_at=now() WHERE id=vid;
   IF NOT FOUND THEN RAISE EXCEPTION 'mapped_vehicle_missing'; END IF;
   act:='updated';
  END IF;
  IF vid IS NOT NULL THEN
   INSERT INTO public.fleet_sync_links(origin_system,origin_vehicle_id,site_vehicle_id,source_revision,active,reason) VALUES('sistemagestao',e->>'origin_vehicle_id',vid,rev,CASE WHEN typ IN ('vehicle.archived','vehicle.deleted') THEN false ELSE (p->>'active')::boolean END,CASE WHEN typ IN ('vehicle.archived','vehicle.deleted') THEN typ ELSE nullif(p->>'link_reason','') END)
   ON CONFLICT(origin_system,origin_vehicle_id) DO UPDATE SET source_revision=EXCLUDED.source_revision,active=EXCLUDED.active,reason=coalesce(EXCLUDED.reason,CASE WHEN fleet_sync_links.reason LIKE 'vehicle.%' THEN NULL ELSE fleet_sync_links.reason END),updated_at=now();
  END IF;
 END IF;
 INSERT INTO public.fleet_sync_events(event_id,origin_vehicle_id,source_revision,event_type,site_vehicle_id,action,flags) VALUES(e->>'event_id',e->>'origin_vehicle_id',rev,typ,vid,act,flags);
 RETURN jsonb_build_object('ok',true,'site_vehicle_id',vid,'action',act);
END $function$;
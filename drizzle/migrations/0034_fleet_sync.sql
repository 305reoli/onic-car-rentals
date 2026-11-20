CREATE TABLE public.fleet_sync_links (
 origin_system text NOT NULL, origin_vehicle_id text NOT NULL, site_vehicle_id uuid NOT NULL,
 source_revision bigint NOT NULL, active boolean NOT NULL DEFAULT true, reason text,
 provenance text NOT NULL DEFAULT 'sistemagestao', updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(origin_system, origin_vehicle_id), UNIQUE(site_vehicle_id)
);
GRANT SELECT ON public.fleet_sync_links TO authenticated;
GRANT ALL ON public.fleet_sync_links TO service_role;
ALTER TABLE public.fleet_sync_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY fleet_links_admin ON public.fleet_sync_links FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE TABLE public.fleet_sync_events (
 event_id text PRIMARY KEY, origin_vehicle_id text NOT NULL, source_revision bigint NOT NULL,
 event_type text NOT NULL, site_vehicle_id uuid, action text NOT NULL, flags jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fleet_sync_events TO authenticated;
GRANT ALL ON public.fleet_sync_events TO service_role;
ALTER TABLE public.fleet_sync_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fleet_events_admin ON public.fleet_sync_events FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE SEQUENCE public.fleet_sync_revision_seq;
GRANT USAGE, SELECT ON SEQUENCE public.fleet_sync_revision_seq TO service_role;
CREATE TABLE public.fleet_sync_outbox (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vehicle_id uuid NOT NULL,
 source_revision bigint NOT NULL DEFAULT nextval('public.fleet_sync_revision_seq'),
 event_type text NOT NULL, snapshot jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
 last_error text, http_status integer, next_attempt_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
GRANT SELECT ON public.fleet_sync_outbox TO authenticated;
GRANT ALL ON public.fleet_sync_outbox TO service_role;
ALTER TABLE public.fleet_sync_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY fleet_outbox_admin ON public.fleet_sync_outbox FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE INDEX fleet_outbox_pending ON public.fleet_sync_outbox(status, next_attempt_at);
CREATE FUNCTION public.queue_site_fleet_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.vehicles; typ text; photo_list jsonb;
BEGIN
 IF current_setting('app.fleet_sync_inbound',true)='true' THEN RETURN NULL; END IF;
 IF TG_OP='DELETE' THEN v:=OLD; typ:='vehicle.deleted';
 ELSIF TG_OP='INSERT' THEN v:=NEW; typ:='vehicle.created';
 ELSE
  v:=NEW;
  IF to_jsonb(NEW)-'updated_at'=to_jsonb(OLD)-'updated_at' THEN RETURN NULL; END IF;
  typ:=CASE WHEN OLD.active AND NOT NEW.active THEN 'vehicle.archived' ELSE 'vehicle.updated' END;
 END IF;
 IF EXISTS(SELECT 1 FROM public.fleet_sync_links WHERE site_vehicle_id=v.id AND provenance='sistemagestao') THEN RETURN NULL; END IF;
 SELECT coalesce(jsonb_agg(CASE WHEN p LIKE 'https://%' THEN p WHEN p LIKE '/%' THEN 'https://seudominio.com'||p ELSE 'https://seudominio.com/api/public/photo/'||p END ORDER BY n),'[]'::jsonb) INTO photo_list FROM unnest(v.photos) WITH ORDINALITY x(p,n);
 INSERT INTO public.fleet_sync_outbox(vehicle_id,event_type,snapshot) VALUES(v.id,typ,jsonb_build_object('name',v.name,'brand',v.brand,'model',v.model,'year',NULL,'color',v.color,'category',v.body_category,'daily_price',v.daily_price_usd,'security_deposit',v.security_deposit_usd,'deductible',NULL,'photos',photo_list,'base_city',v.city,'status',CASE WHEN v.active THEN 'active' ELSE 'inactive' END));
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.queue_site_fleet_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER site_fleet_outbox AFTER INSERT OR UPDATE OR DELETE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.queue_site_fleet_change();
CREATE FUNCTION public.apply_sistemagestao_fleet_event(e jsonb, p jsonb, flags jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.fleet_sync_links; prior public.fleet_sync_events; vid uuid; act text; candidate text; stem text; code text; suffix integer:=1; rev bigint:=(e->>'source_revision')::bigint; typ text:=e->>'event_type';
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('site-fleet-sync',0));
 SELECT * INTO prior FROM public.fleet_sync_events WHERE event_id=e->>'event_id';
 IF FOUND THEN RETURN jsonb_build_object('ok',true,'site_vehicle_id',prior.site_vehicle_id,'action','duplicate_ignored'); END IF;
 SELECT * INTO l FROM public.fleet_sync_links WHERE origin_system='sistemagestao' AND origin_vehicle_id=e->>'origin_vehicle_id';
 vid:=l.site_vehicle_id;
 IF vid IS NOT NULL AND rev<=l.source_revision THEN act:='duplicate_ignored';
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
   INSERT INTO public.vehicles(name,brand,model,color,city,body_category,category,daily_price_usd,security_deposit_usd,active,photos,slug,internal_label,min_days,mileage_limit)
   VALUES(p->>'name',p->>'brand',p->>'model',p->>'color',p->>'city',p->>'body_category',p->>'category',(p->>'daily_price_usd')::numeric,(p->>'security_deposit_usd')::numeric,(p->>'active')::boolean,ARRAY(SELECT jsonb_array_elements_text(p->'photos')),candidate,code,NULL,'') RETURNING id INTO vid;
   act:='created';
  ELSE
   UPDATE public.vehicles SET name=p->>'name',brand=p->>'brand',model=p->>'model',color=p->>'color',city=p->>'city',body_category=p->>'body_category',category=p->>'category',photos=ARRAY(SELECT jsonb_array_elements_text(p->'photos')),active=(p->>'active')::boolean,updated_at=now() WHERE id=vid;
   IF NOT FOUND THEN RAISE EXCEPTION 'mapped_vehicle_missing'; END IF;
   act:='updated';
  END IF;
  IF vid IS NOT NULL THEN
   INSERT INTO public.fleet_sync_links(origin_system,origin_vehicle_id,site_vehicle_id,source_revision,active,reason) VALUES('sistemagestao',e->>'origin_vehicle_id',vid,rev,CASE WHEN typ IN ('vehicle.archived','vehicle.deleted') THEN false ELSE (p->>'active')::boolean END,CASE WHEN typ IN ('vehicle.archived','vehicle.deleted') THEN typ ELSE NULL END)
   ON CONFLICT(origin_system,origin_vehicle_id) DO UPDATE SET source_revision=EXCLUDED.source_revision,active=EXCLUDED.active,reason=EXCLUDED.reason,updated_at=now();
  END IF;
 END IF;
 INSERT INTO public.fleet_sync_events(event_id,origin_vehicle_id,source_revision,event_type,site_vehicle_id,action,flags) VALUES(e->>'event_id',e->>'origin_vehicle_id',rev,typ,vid,act,flags);
 RETURN jsonb_build_object('ok',true,'site_vehicle_id',vid,'action',act);
END $$;
REVOKE ALL ON FUNCTION public.apply_sistemagestao_fleet_event(jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_sistemagestao_fleet_event(jsonb,jsonb,jsonb) TO service_role;
CREATE FUNCTION public.claim_site_fleet_events(v_id uuid) RETURNS SETOF public.fleet_sync_outbox LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.fleet_sync_outbox SET status='sending',attempts=attempts+1,next_attempt_at=now()+interval '2 minutes'
 WHERE event_id IN (SELECT event_id FROM public.fleet_sync_outbox WHERE (v_id IS NULL OR vehicle_id=v_id) AND status IN ('pending','failed','sending') AND next_attempt_at<=now() ORDER BY source_revision LIMIT 20 FOR UPDATE SKIP LOCKED) RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_site_fleet_events(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_site_fleet_events(uuid) TO service_role;
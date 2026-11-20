CREATE OR REPLACE FUNCTION public.site_vehicle_availability(vid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.vehicles; rs jsonb; busy_now boolean;
BEGIN
 SELECT * INTO v FROM public.vehicles WHERE id=vid;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT coalesce(jsonb_agg(x ORDER BY x->>'start_at'),'[]'::jsonb) INTO rs FROM (
  SELECT jsonb_build_object('start_at',to_char(pickup_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'end_at',to_char(return_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'reason','booking') x
   FROM public.prereservations WHERE vehicle_id=vid AND return_at>now() AND status IN ('pending_approval','substitute_offered','approved','confirmed','paid_conflict','amount_review')
  UNION ALL
  SELECT jsonb_build_object('start_at',to_char(d::date::timestamp AT TIME ZONE 'America/New_York' AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'end_at',to_char((d::date+1)::timestamp AT TIME ZONE 'America/New_York' AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'reason','blocked')
   FROM unnest(v.blocked_dates) d WHERE d::date >= (now() AT TIME ZONE 'America/New_York')::date
 ) q;
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(rs) r WHERE (r->>'start_at')::timestamptz<=now() AND (r->>'end_at')::timestamptz>now()) INTO busy_now;
 RETURN jsonb_build_object('available', v.active AND NOT busy_now, 'reason', CASE WHEN NOT v.active THEN 'inactive' WHEN busy_now THEN (SELECT r->>'reason' FROM jsonb_array_elements(rs) r WHERE (r->>'start_at')::timestamptz<=now() AND (r->>'end_at')::timestamptz>now() LIMIT 1) ELSE 'available' END, 'ranges', rs);
END $$;

-- Sync must never block a booking or a car save: any queueing error is swallowed (event simply not queued, divergence check will surface it).
CREATE OR REPLACE FUNCTION public.queue_site_availability(vid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF vid IS NULL OR current_setting('app.fleet_sync_inbound',true)='true' THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.vehicles WHERE id=vid) THEN RETURN; END IF;
 BEGIN
  INSERT INTO public.fleet_sync_outbox(vehicle_id,event_type,snapshot,schema_version,availability) VALUES(vid,'vehicle.availability_changed','{}'::jsonb,2,public.site_vehicle_availability(vid));
 EXCEPTION WHEN OTHERS THEN RAISE WARNING 'fleet availability queue failed: %', SQLERRM;
 END;
END $$;
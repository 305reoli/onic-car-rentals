CREATE OR REPLACE FUNCTION public.guard_fleet_source_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE latest bigint;
BEGIN
 SELECT max(source_revision) INTO latest FROM public.fleet_sync_events WHERE origin_vehicle_id=NEW.origin_vehicle_id;
 IF latest IS NOT NULL AND NEW.source_revision<=latest THEN RAISE EXCEPTION 'stale_fleet_revision' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_fleet_source_revision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER fleet_link_revision_guard BEFORE INSERT OR UPDATE ON public.fleet_sync_links FOR EACH ROW EXECUTE FUNCTION public.guard_fleet_source_revision();
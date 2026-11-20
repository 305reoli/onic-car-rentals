import json,os,subprocess
# Run only against a disposable local PostgreSQL database with fleet-sync migrations applied.
if os.environ.get('FLEET_SYNC_ISOLATED_TEST') != 'true':
 raise RuntimeError('Requires FLEET_SYNC_ISOLATED_TEST=true; never run against production')
ENV={**os.environ,'PGSSLMODE':'disable'}
def sql(q):
 r=subprocess.run(['psql','-h','127.0.0.1','-p','55439','-U','lovable','-d','fleet_repeat','-At','-v','ON_ERROR_STOP=1','-c',q],env=ENV,capture_output=True,text=True)
 if r.returncode: raise RuntimeError(r.stderr)
 return r.stdout.strip()
def apply(ev,origin,rev,typ='vehicle.created',rate=99,deposit=200,name='Unit'):
 e={'event_id':ev,'origin_vehicle_id':origin,'source_revision':rev,'event_type':typ}
 p={'name':name,'brand':'Example','model':'Unit','color':'Black','city':'orlando','body_category':'suv','category':'family','daily_price_usd':rate,'security_deposit_usd':deposit,'active':True,'photos':['https://example.com/one.jpg'],'slug':'unit','internal_label':'SUV-ORL-BLK'}
 return json.loads(sql("SELECT public.apply_sistemagestao_fleet_event('"+json.dumps(e)+"'::jsonb,'"+json.dumps(p)+"'::jsonb,'[]'::jsonb)"))
a=apply('a','rc-a',1); assert a['action']=='created'; vid=a['site_vehicle_id']
assert apply('a','rc-a',1)['action']=='duplicate_ignored'
assert sql('SELECT count(*) FROM vehicles')=='1'
assert sql('SELECT count(*) FROM fleet_sync_outbox')=='0'
assert apply('b','rc-a',2,'vehicle.updated',999,999,'Updated')['action']=='updated'
assert sql(f"SELECT daily_price_usd||'|'||security_deposit_usd||'|'||name FROM vehicles WHERE id='{vid}'")=='99.00|200.00|Updated'
assert apply('c','rc-a',1,'vehicle.updated')['action']=='duplicate_ignored'
assert apply('d','rc-a',3,'vehicle.deleted')['action']=='inactivated'
assert sql(f"SELECT active FROM vehicles WHERE id='{vid}'")=='f'
assert sql("SELECT active||'|'||reason FROM fleet_sync_links WHERE origin_vehicle_id='rc-a'")=='false|vehicle.deleted'
assert sql('SELECT count(*) FROM vehicles')=='1'
assert apply('e','rc-a',4,'vehicle.updated')['action']=='updated'
sql(f"UPDATE vehicles SET name='Admin edited' WHERE id='{vid}'")
assert sql('SELECT count(*) FROM fleet_sync_outbox')=='0'
b=apply('f','rc-b',1); assert b['site_vehicle_id']!=vid
assert sql("SELECT slug||'|'||internal_label FROM vehicles WHERE id='"+b['site_vehicle_id']+"'")=='unit-2|SUV-ORL-BLK-2'
assert apply('g','never-created',10,'vehicle.archived')['action']=='unmapped_ignored'
assert apply('h','never-created',2)['action']=='duplicate_ignored'
sql("INSERT INTO vehicles(name,city,slug,category,internal_label) VALUES('Local','orlando','local','family','LOCAL')")
assert sql("SELECT event_type FROM fleet_sync_outbox")=='vehicle.created'
sql("UPDATE vehicles SET active=false WHERE slug='local'")
sql("DELETE FROM vehicles WHERE slug='local'")
assert sql("SELECT string_agg(event_type,',' ORDER BY source_revision) FROM fleet_sync_outbox")=='vehicle.created,vehicle.archived,vehicle.deleted'
sql("INSERT INTO vehicles(name,city,slug,category,internal_label,active) SELECT name,city,'copy','family','',false FROM vehicles LIMIT 1")
assert sql("SELECT event_type FROM fleet_sync_outbox ORDER BY source_revision DESC LIMIT 1")=='vehicle.created'
print('Isolated PostgreSQL assertions passed: duplicate ID, older revision, unchanged prices/deposits, soft delete/link reason, inbound/admin provenance suppression, unique slug/code, archive-before-create, local create/archive/delete and duplicate-created outbox.')

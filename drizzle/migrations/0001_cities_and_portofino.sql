
create table public.cities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  hero_photo text not null default '',
  description_en text not null default '',
  description_pt text not null default '',
  description_es text not null default '',
  delivery_locations jsonb not null default '[]',
  created_at timestamptz not null default now()
);
grant select on public.cities to anon;
grant select, insert, update, delete on public.cities to authenticated;
grant all on public.cities to service_role;
alter table public.cities enable row level security;
create policy "public reads active cities" on public.cities for select to anon, authenticated using (active or public.has_role(auth.uid(),'admin'));
create policy "admin writes cities" on public.cities for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

alter table public.vehicles drop constraint if exists vehicles_city_check;

insert into public.cities (slug,name,sort_order,hero_photo,description_en,description_pt,description_es,delivery_locations) values
('orlando','Orlando',1,'/images/city-orlando.jpg',
 'Theme parks, resorts and lakes — delivered to MCO, your hotel or villa.',
 'Parques, resorts e lagos — entrega no MCO, no seu hotel ou casa.',
 'Parques, resorts y lagos — entrega en MCO, tu hotel o villa.',
 '[{"key":"mco","en":"MCO Airport","pt":"Aeroporto MCO","es":"Aeropuerto MCO"},{"key":"hotel","en":"Hotel or address","pt":"Hotel ou endereço","es":"Hotel o dirección"},{"key":"winter_garden","en":"Winter Garden base (by appointment)","pt":"Base Winter Garden (com agendamento)","es":"Base Winter Garden (con cita)"}]'),
('miami','Miami',2,'/images/portofino/hero-desktop.jpg',
 'Beaches, Brickell and Design District — delivered to MIA, Miami Beach or your hotel.',
 'Praias, Brickell e Design District — entrega no MIA, Miami Beach ou no seu hotel.',
 'Playas, Brickell y Design District — entrega en MIA, Miami Beach o tu hotel.',
 '[{"key":"mia","en":"MIA Airport","pt":"Aeroporto MIA","es":"Aeropuerto MIA"},{"key":"hotel","en":"Hotel or address","pt":"Hotel ou endereço","es":"Hotel o dirección"},{"key":"miami_beach","en":"Miami Beach base (by appointment)","pt":"Base Miami Beach (com agendamento)","es":"Base Miami Beach (con cita)"}]'),
('fort-lauderdale','Fort Lauderdale',3,'/images/city-fort-lauderdale.jpg',
 'Las Olas, the beach and the port — delivered to FLL or your hotel.',
 'Las Olas, praia e porto — entrega no FLL ou no seu hotel.',
 'Las Olas, la playa y el puerto — entrega en FLL o tu hotel.',
 '[{"key":"fll","en":"FLL Airport","pt":"Aeroporto FLL","es":"Aeropuerto FLL"},{"key":"hotel","en":"Hotel or address","pt":"Hotel ou endereço","es":"Hotel o dirección"}]'),
('tampa','Tampa',4,'/images/city-tampa.jpg',
 'Bayshore, Clearwater and St. Pete — delivered to TPA or your hotel.',
 'Bayshore, Clearwater e St. Pete — entrega no TPA ou no seu hotel.',
 'Bayshore, Clearwater y St. Pete — entrega en TPA o tu hotel.',
 '[{"key":"tpa","en":"TPA Airport","pt":"Aeroporto TPA","es":"Aeropuerto TPA"},{"key":"hotel","en":"Hotel or address","pt":"Hotel ou endereço","es":"Hotel o dirección"}]');

alter table public.vehicles add constraint vehicles_city_fk foreign key (city) references public.cities(slug) on update cascade;

insert into public.vehicles (slug,name,brand,model,city,catalog_group,category,color,seats,bags,doors,hp,transmission,confirmation_type,description_en,description_pt,description_es,highlights,photos,is_sample,sort_order,min_days) values
('ferrari-portofino','Ferrari Portofino','Ferrari','Portofino','miami','luxury_sport_exotic','convertible','Rosso Corsa / Brown',4,2,2,612,'Automatic','on_request',
 'The Ferrari Portofino pairs a 612 hp twin-turbo V8 with a retractable hard top that opens in seconds — Italian grand touring made for Miami Beach mornings and Ocean Drive nights. Rosso Corsa paint, rich brown leather, four seats.',
 'A Ferrari Portofino une um V8 biturbo de 612 cv a um teto rígido retrátil que abre em segundos — gran turismo italiano feito para manhãs em Miami Beach e noites na Ocean Drive. Pintura Rosso Corsa, couro marrom e quatro lugares.',
 'El Ferrari Portofino combina un V8 biturbo de 612 hp con un techo rígido retráctil que se abre en segundos — gran turismo italiano hecho para mañanas en Miami Beach y noches en Ocean Drive. Pintura Rosso Corsa, cuero marrón y cuatro plazas.',
 '{"V8 twin-turbo","Retractable hard top","Tolls included"}',
 '{"/images/portofino/01.jpg","/images/portofino/02.jpg","/images/portofino/03.jpg","/images/portofino/04.jpg","/images/portofino/05.jpg","/images/portofino/06.jpg","/images/portofino/07.jpg","/images/portofino/08.jpg","/images/portofino/09.jpg","/images/portofino/10.jpg","/images/portofino/11.jpg","/images/portofino/12.jpg"}',
 false,0,1);

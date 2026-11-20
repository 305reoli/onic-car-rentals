
create type public.app_role as enum ('admin','user');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- First account ever created becomes the owner/admin.
create or replace function public.assign_first_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created_admin after insert on auth.users
for each row execute function public.assign_first_admin();

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  brand text not null default '',
  model text not null default '',
  city text not null check (city in ('miami','orlando')),
  catalog_group text not null default 'luxury_sport_exotic' check (catalog_group in ('standard_family','luxury_sport_exotic')),
  category text not null default 'luxury_suv' check (category in ('exotic','luxury_suv','convertible','family','standard')),
  color text not null default '',
  seats int not null default 4,
  bags int not null default 2,
  doors int not null default 4,
  hp int,
  transmission text not null default 'Automatic',
  daily_price_usd numeric(10,2),
  min_days int not null default 1,
  mileage_limit text not null default '100 mi/day',
  min_age int not null default 25,
  security_deposit_usd numeric(10,2),
  prereservation_amount_usd numeric(10,2),
  confirmation_type text not null default 'on_request' check (confirmation_type in ('instant','on_request')),
  description_en text not null default '',
  description_pt text not null default '',
  description_es text not null default '',
  highlights text[] not null default '{}',
  photos text[] not null default '{}',
  blocked_dates date[] not null default '{}',
  is_sample boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.vehicles to anon;
grant select, insert, update, delete on public.vehicles to authenticated;
grant all on public.vehicles to service_role;
alter table public.vehicles enable row level security;
create policy "public reads active vehicles" on public.vehicles for select to anon, authenticated using (active or public.has_role(auth.uid(),'admin'));
create policy "admin writes vehicles" on public.vehicles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.settings (
  id int primary key default 1 check (id = 1),
  prereservation_min_usd numeric(10,2) not null default 75,
  prereservation_days int not null default 1,
  addon_insurance_per_day numeric(10,2) not null default 35,
  addon_hotel_checkin numeric(10,2) not null default 50,
  addon_luggage_car numeric(10,2) not null default 150,
  whatsapp_number text not null default '15551234567',
  approval_window_hours int not null default 24,
  cutoff_hours_before_pickup int not null default 3,
  min_lead_time_hours int not null default 6,
  contact_email text not null default 'reservations@seudominio.com',
  owner_notification_email text not null default '',
  terms_version text not null default 'v0-placeholder',
  sistemagestao_integration_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
grant select on public.settings to anon;
grant select, update on public.settings to authenticated;
grant all on public.settings to service_role;
alter table public.settings enable row level security;
create policy "settings public read" on public.settings for select to anon, authenticated using (true);
create policy "admin updates settings" on public.settings for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
insert into public.settings (id) values (1);

create table public.prereservations (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(24),'hex'),
  status text not null default 'pending_approval' check (status in ('draft','pending_approval','approved','declined','expired','cancelled')),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  vehicle_name text not null,
  first_name text not null, last_name text not null, email text not null, phone text not null,
  country text not null default '', date_of_birth date, address text not null default '', flight_number text,
  pickup_at timestamptz not null, return_at timestamptz not null,
  pickup_location text not null, return_location text not null,
  addons jsonb not null default '{}',
  price_breakdown jsonb not null default '{}',
  prereservation_amount_usd numeric(10,2) not null,
  stripe_payment_intent_id text unique,
  stripe_status text,
  captured_at timestamptz,
  documents jsonb not null default '{}',
  language text not null default 'en',
  terms_accepted_at timestamptz, terms_ip text, terms_version text,
  expires_at timestamptz not null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, update on public.prereservations to authenticated;
grant all on public.prereservations to service_role;
alter table public.prereservations enable row level security;
create policy "admin reads prereservations" on public.prereservations for select to authenticated using (public.has_role(auth.uid(),'admin'));
create index on public.prereservations (status, expires_at);
create index on public.prereservations (vehicle_id, pickup_at);

-- Vehicle photos: admin uploads; read through server proxy.
create policy "admin manages vehicle photos" on storage.objects for all to authenticated
  using (bucket_id = 'vehicle-photos' and public.has_role(auth.uid(),'admin'))
  with check (bucket_id = 'vehicle-photos' and public.has_role(auth.uid(),'admin'));

insert into public.vehicles (slug,name,brand,model,city,catalog_group,category,color,seats,bags,doors,hp,confirmation_type,description_en,description_pt,description_es,highlights,photos,is_sample,sort_order,security_deposit_usd,min_days) values
('ferrari-purosangue','Ferrari Purosangue','Ferrari','Purosangue','miami','luxury_sport_exotic','exotic','Rosso Corsa',4,2,4,715,'instant','SAMPLE — Ferrari''s first four-door, four-seat V12. Delivered to your hotel, airport or door.','AMOSTRA — O primeiro Ferrari de quatro portas e quatro lugares com V12. Entregamos no hotel, aeroporto ou na sua porta.','MUESTRA — El primer Ferrari de cuatro puertas y cuatro plazas V12. Entrega en hotel, aeropuerto o a domicilio.','{"V12 engine","4 seats","Tolls included"}','{"/images/car-purosangue.jpg"}',true,1,null,2),
('rolls-royce-cullinan','Rolls-Royce Cullinan','Rolls-Royce','Cullinan','miami','luxury_sport_exotic','luxury_suv','Arctic White',5,4,4,563,'on_request','SAMPLE — The definitive luxury SUV. Effortless, silent, unforgettable.','AMOSTRA — O SUV de luxo definitivo. Silencioso, suave, inesquecível.','MUESTRA — El SUV de lujo definitivo. Silencioso, suave, inolvidable.','{"Starlight headliner","5 seats","Tolls included"}','{"/images/car-cullinan.jpg"}',true,2,null,2),
('lamborghini-urus-performante','Lamborghini Urus Performante','Lamborghini','Urus Performante','miami','luxury_sport_exotic','exotic','Giallo Inti',4,3,4,657,'instant','SAMPLE — Super SUV performance with everyday comfort.','AMOSTRA — Desempenho de super SUV com conforto para o dia a dia.','MUESTRA — Rendimiento de super SUV con confort diario.','{"657 hp","4 seats","Tolls included"}','{"/images/car-urus.jpg"}',true,3,null,1),
('cadillac-escalade-600','Cadillac Escalade 600','Cadillac','Escalade 600','miami','standard_family','luxury_suv','Black Raven',7,5,4,420,'instant','SAMPLE — Seven seats of American luxury, perfect for families and groups.','AMOSTRA — Sete lugares de luxo americano, ideal para famílias e grupos.','MUESTRA — Siete plazas de lujo americano, ideal para familias y grupos.','{"7 seats","Large trunk","Tolls included"}','{"/images/car-escalade.jpg"}',true,4,null,1),
('mercedes-benz-g63-amg','Mercedes-Benz G63 AMG','Mercedes-Benz','G63 AMG','miami','luxury_sport_exotic','luxury_suv','Obsidian Black',5,3,4,577,'on_request','SAMPLE — The icon. Hand-built AMG V8 and unmistakable presence.','AMOSTRA — O ícone. V8 AMG feito à mão e presença inconfundível.','MUESTRA — El icono. V8 AMG hecho a mano y presencia inconfundible.','{"AMG V8","5 seats","Tolls included"}','{"/images/car-g63.jpg"}',true,5,null,1),
('cadillac-escalade','Cadillac Escalade','Cadillac','Escalade','orlando','standard_family','luxury_suv','Black',7,5,4,420,'instant','SAMPLE — Spacious and refined. Ideal for theme-park trips with the family.','AMOSTRA — Espaçoso e refinado. Ideal para os parques com a família.','MUESTRA — Espacioso y refinado. Ideal para los parques con la familia.','{"7 seats","Theme parks ready","Tolls included"}','{"/images/car-escalade-orlando.jpg"}',true,1,null,1);

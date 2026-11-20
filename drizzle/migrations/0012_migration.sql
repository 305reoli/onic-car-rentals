update public.vehicles set is_convertible = true, updated_at = now()
where active and id in ('56164909-12cb-454f-9c04-a2c9ab856d09','6bbe79fb-d588-49cd-be70-1c05b883bab2','0e95b79c-d664-4d13-9d56-44df0284f826')
   or (active and name in ('Ford New Mustang','Chevrolet Corvette C8','Porsche 911 Carrera S'))
   or (active and city='miami' and name='Porsche 911')
   or (active and city='orlando' and name='Nissan 370Z');
update public.vehicles set review_category = false where active and name = 'Ford New Mustang';
update public.vehicles set review_category = true,
  admin_note = trim(both from admin_note || E'\nConvertible? confirm unit'), updated_at = now()
where active and name = 'Jeep Wrangler Rubicon' and admin_note not like '%Convertible? confirm unit%';
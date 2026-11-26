-- =====================================================================
-- 006 · Almacenamiento de archivos (Supabase Storage)
--  - "imagenes": logo y fotos de productos (lectura pública)
--  - "soportes": facturas de proveedores y soportes de gastos (privado)
-- =====================================================================
insert into storage.buckets (id, name, public) values ('imagenes', 'imagenes', true)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('soportes', 'soportes', false)
on conflict (id) do nothing;

create policy "imagenes lectura" on storage.objects for select using (bucket_id = 'imagenes');
create policy "imagenes subida" on storage.objects for insert to authenticated
  with check (bucket_id = 'imagenes' and (public.tiene_permiso('productos.gestionar') or public.tiene_permiso('configuracion.gestionar')));
create policy "imagenes cambio" on storage.objects for update to authenticated
  using (bucket_id = 'imagenes' and (public.tiene_permiso('productos.gestionar') or public.tiene_permiso('configuracion.gestionar')));

create policy "soportes lectura" on storage.objects for select to authenticated
  using (bucket_id = 'soportes' and (public.tiene_permiso('gastos.ver') or public.tiene_permiso('compras.ver')));
create policy "soportes subida" on storage.objects for insert to authenticated
  with check (bucket_id = 'soportes' and (public.tiene_permiso('gastos.registrar') or public.tiene_permiso('compras.gestionar')));

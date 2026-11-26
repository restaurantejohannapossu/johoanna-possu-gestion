-- =====================================================================
-- 003 · Seguridad: Row Level Security (RLS) y privilegios
-- Lecturas: según permiso y sede. Escrituras críticas: solo mediante
-- funciones (002). Escrituras de catálogos: según permiso.
-- =====================================================================

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Helper para crear políticas cortas
-- (lectura) ------------------------------------------------------------
create policy lee on config_empresa for select using (true);
create policy edita on config_empresa for update to authenticated using (tiene_permiso('configuracion.gestionar') or tiene_permiso('facturacion.configurar'));

create policy lee on sedes for select to authenticated using (true);
create policy crea on sedes for insert to authenticated with check (tiene_permiso('sedes.gestionar'));
create policy edita on sedes for update to authenticated using (tiene_permiso('sedes.gestionar'));

create policy lee on permisos for select to authenticated using (true);
create policy lee on roles for select to authenticated using (true);
create policy lee on rol_permisos for select to authenticated using (true);
create policy elimina on roles for delete to authenticated using (tiene_permiso('roles.gestionar') and not es_sistema);

create policy lee on perfiles for select to authenticated using (true);
create policy lee on usuario_sedes for select to authenticated using (true);
create policy lee on usuario_permisos for select to authenticated using (usuario_id = auth.uid() or tiene_permiso('usuarios.ver'));

-- Catálogos generales
create policy lee on unidades for select to authenticated using (true);
create policy gestiona on unidades for all to authenticated
  using (tiene_permiso('configuracion.gestionar') or tiene_permiso('insumos.gestionar'))
  with check (tiene_permiso('configuracion.gestionar') or tiene_permiso('insumos.gestionar'));

create policy lee on categorias for select to authenticated using (true);
create policy gestiona on categorias for all to authenticated
  using (tiene_permiso('configuracion.gestionar') or tiene_permiso('productos.gestionar'))
  with check (tiene_permiso('configuracion.gestionar') or tiene_permiso('productos.gestionar'));

create policy lee on impuestos for select to authenticated using (true);
create policy gestiona on impuestos for all to authenticated
  using (tiene_permiso('configuracion.gestionar')) with check (tiene_permiso('configuracion.gestionar'));

create policy lee on metodos_pago for select to authenticated using (true);
create policy gestiona on metodos_pago for all to authenticated
  using (tiene_permiso('configuracion.gestionar')) with check (tiene_permiso('configuracion.gestionar'));

create policy lee on proveedores for select to authenticated
  using (tiene_permiso('proveedores.ver') or tiene_permiso('compras.ver') or tiene_permiso('inventario.ver'));
create policy crea on proveedores for insert to authenticated with check (tiene_permiso('proveedores.gestionar'));
create policy edita on proveedores for update to authenticated using (tiene_permiso('proveedores.gestionar'));

create policy lee on clientes for select to authenticated using (tiene_permiso('clientes.ver') or tiene_permiso('pos.vender'));
create policy crea on clientes for insert to authenticated with check (tiene_permiso('clientes.gestionar') or tiene_permiso('pos.vender'));
create policy edita on clientes for update to authenticated using (tiene_permiso('clientes.gestionar'));

-- Inventario
create policy lee on insumos for select to authenticated using (true);
create policy crea on insumos for insert to authenticated with check (tiene_permiso('insumos.gestionar'));
create policy edita on insumos for update to authenticated using (tiene_permiso('insumos.gestionar'));

create policy lee on inventario for select to authenticated
  using (puede_sede(sede_id) and (tiene_permiso('inventario.ver') or tiene_permiso('reportes.inventario')));
create policy edita on inventario for update to authenticated
  using (puede_sede(sede_id) and tiene_permiso('inventario.ajustes'));
create policy crea on inventario for insert to authenticated
  with check (puede_sede(sede_id) and tiene_permiso('inventario.ajustes') and cantidad = 0);

create policy lee on lotes for select to authenticated using (puede_sede(sede_id) and tiene_permiso('inventario.ver'));
create policy lee on movimientos_inventario for select to authenticated
  using (puede_sede(sede_id) and (tiene_permiso('inventario.ver') or tiene_permiso('reportes.inventario')));

-- Productos y menú
create policy lee on productos for select to authenticated using (true);
create policy crea on productos for insert to authenticated with check (tiene_permiso('productos.gestionar'));
create policy edita on productos for update to authenticated using (tiene_permiso('productos.gestionar'));

create policy lee on producto_sedes for select to authenticated using (true);
create policy crea on producto_sedes for insert to authenticated with check (
  tiene_permiso('productos.gestionar')
  or (tiene_permiso('productos.agotar') and puede_sede(sede_id) and precio is null and disponible and hora_desde is null and hora_hasta is null and dias is null));
create policy edita on producto_sedes for update to authenticated
  using (puede_sede(sede_id) and (tiene_permiso('productos.gestionar') or tiene_permiso('productos.agotar')));
create policy elimina on producto_sedes for delete to authenticated using (tiene_permiso('productos.gestionar'));

-- Recetas
create policy lee on recetas for select to authenticated
  using (tiene_permiso('recetas.ver') or tiene_permiso('productos.gestionar'));
create policy crea on recetas for insert to authenticated with check (tiene_permiso('recetas.gestionar'));
create policy edita on recetas for update to authenticated using (tiene_permiso('recetas.gestionar'));
create policy lee on receta_items for select to authenticated
  using (tiene_permiso('recetas.ver') or tiene_permiso('productos.gestionar'));
create policy gestiona on receta_items for all to authenticated
  using (tiene_permiso('recetas.gestionar')) with check (tiene_permiso('recetas.gestionar'));
create policy lee on producciones for select to authenticated
  using (puede_sede(sede_id) and (tiene_permiso('recetas.ver') or tiene_permiso('inventario.ver')));

-- Mesas, pedidos, pagos, domicilios
create policy lee on mesas for select to authenticated using (puede_sede(sede_id));
create policy crea on mesas for insert to authenticated with check (puede_sede(sede_id) and tiene_permiso('mesas.configurar'));
create policy edita on mesas for update to authenticated using (puede_sede(sede_id) and tiene_permiso('mesas.configurar'));

create policy lee on pedidos for select to authenticated
  using (puede_sede(sede_id) and (tiene_permiso('pedidos.ver') or tiene_permiso('pos.vender') or tiene_permiso('cocina.ver')
         or tiene_permiso('domicilios.ver') or tiene_permiso('facturacion.ver')));
create policy lee on pedido_items for select to authenticated
  using (exists (select 1 from pedidos p where p.id = pedido_id and puede_sede(p.sede_id))
         and (tiene_permiso('pedidos.ver') or tiene_permiso('pos.vender') or tiene_permiso('cocina.ver')
              or tiene_permiso('domicilios.ver') or tiene_permiso('facturacion.ver')));
create policy lee on pagos for select to authenticated
  using (puede_sede(sede_id) and (tiene_permiso('pedidos.ver') or tiene_permiso('pos.vender') or tiene_permiso('facturacion.ver')));
create policy lee on domicilios for select to authenticated
  using (exists (select 1 from pedidos p where p.id = pedido_id and puede_sede(p.sede_id))
         and (tiene_permiso('domicilios.ver') or tiene_permiso('pos.vender') or tiene_permiso('cocina.ver')));
create policy lee on devoluciones for select to authenticated
  using (puede_sede(sede_id) and (tiene_permiso('pedidos.ver') or tiene_permiso('pos.devolucion')));

-- Caja
create policy lee on cajas for select to authenticated using (puede_sede(sede_id));
create policy crea on cajas for insert to authenticated with check (puede_sede(sede_id) and tiene_permiso('sedes.gestionar'));
create policy edita on cajas for update to authenticated using (puede_sede(sede_id) and tiene_permiso('sedes.gestionar'));
create policy lee on caja_sesiones for select to authenticated
  using (puede_sede(sede_id) and (usuario_id = auth.uid() or tiene_permiso('caja.ver_todas')));
create policy lee on caja_movimientos for select to authenticated
  using (puede_sede(sede_id) and (usuario_id = auth.uid() or tiene_permiso('caja.ver_todas')
         or exists (select 1 from caja_sesiones s where s.id = sesion_id and s.usuario_id = auth.uid())));

-- Gastos
create policy lee on gastos for select to authenticated
  using (puede_sede(sede_id) and (tiene_permiso('gastos.ver') or usuario_id = auth.uid()));
create policy lee on gastos_recurrentes for select to authenticated using (puede_sede(sede_id) and tiene_permiso('gastos.ver'));
create policy gestiona on gastos_recurrentes for all to authenticated
  using (puede_sede(sede_id) and tiene_permiso('gastos.registrar'))
  with check (puede_sede(sede_id) and tiene_permiso('gastos.registrar'));

-- Compras
create policy lee on compras for select to authenticated using (puede_sede(sede_id) and tiene_permiso('compras.ver'));
create policy lee on compra_items for select to authenticated
  using (exists (select 1 from compras c where c.id = compra_id and puede_sede(c.sede_id)) and tiene_permiso('compras.ver'));
create policy lee on pagos_compra for select to authenticated
  using (exists (select 1 from compras c where c.id = compra_id and puede_sede(c.sede_id)) and tiene_permiso('compras.ver'));

-- Transferencias
create policy lee on transferencias for select to authenticated
  using ((puede_sede(sede_origen_id) or puede_sede(sede_destino_id)) and tiene_permiso('transferencias.ver'));
create policy lee on transferencia_items for select to authenticated
  using (exists (select 1 from transferencias t where t.id = transferencia_id
                 and (puede_sede(t.sede_origen_id) or puede_sede(t.sede_destino_id))) and tiene_permiso('transferencias.ver'));

-- Conteos
create policy lee on conteos for select to authenticated using (puede_sede(sede_id) and tiene_permiso('inventario.ver'));
create policy lee on conteo_items for select to authenticated
  using (exists (select 1 from conteos c where c.id = conteo_id and puede_sede(c.sede_id)) and tiene_permiso('inventario.ver'));
create policy edita on conteo_items for update to authenticated
  using (exists (select 1 from conteos c where c.id = conteo_id and c.estado = 'borrador' and puede_sede(c.sede_id))
         and tiene_permiso('inventario.conteos'));

-- Facturación electrónica
create policy lee on resoluciones for select to authenticated using (tiene_permiso('facturacion.ver'));
create policy gestiona on resoluciones for all to authenticated
  using (tiene_permiso('facturacion.configurar')) with check (tiene_permiso('facturacion.configurar'));
create policy lee on documentos_electronicos for select to authenticated
  using (puede_sede(sede_id) and tiene_permiso('facturacion.ver'));

-- Auditoría
create policy lee on auditoria for select to authenticated
  using (tiene_permiso('auditoria.ver') and (sede_id is null or puede_sede(sede_id) or es_superadmin()));
create policy lee on registro_errores for select to authenticated using (tiene_permiso('auditoria.ver'));

-- consecutivos: sin políticas => nadie la lee/escribe directamente.

-- ---------------------------------------------------------------------
-- PRIVILEGIOS
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;
grant select on config_empresa to anon;

-- Funciones: nadie anónimo, salvo las de inicio de sesión
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function email_para_login(text) to anon;
grant execute on function registrar_intento_fallido(text) to anon;

-- Funciones internas: solo se usan dentro de otras funciones
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like '\_%' loop
    execute format('revoke execute on function %s from authenticated', f.firma);
  end loop;
end $$;

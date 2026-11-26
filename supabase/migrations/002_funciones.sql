-- =====================================================================
-- 002 · Funciones: permisos, auditoría, inventario, ventas, caja,
--        compras, gastos, recetas, transferencias, conteos, usuarios
-- Todas las operaciones críticas pasan por estas funciones (SECURITY
-- DEFINER), que validan permisos y sede antes de escribir.
-- =====================================================================

-- ---------------------------------------------------------------------
-- UTILIDADES Y PERMISOS
-- ---------------------------------------------------------------------
create or replace function hoy() returns date language sql stable as
$$ select (now() at time zone 'America/Bogota')::date $$;

create or replace function tiene_permiso(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfiles pf
    where pf.id = auth.uid() and pf.activo
      and coalesce(
        (select up.concedido from usuario_permisos up where up.usuario_id = pf.id and up.permiso = p),
        exists (select 1 from rol_permisos rp where rp.rol_id = pf.rol_id and (rp.permiso = p or rp.permiso = '*'))
      )
  );
$$;

create or replace function es_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfiles pf join rol_permisos rp on rp.rol_id = pf.rol_id
    where pf.id = auth.uid() and pf.activo and rp.permiso = '*'
  );
$$;

create or replace function puede_sede(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfiles pf left join roles r on r.id = pf.rol_id
    where pf.id = auth.uid() and pf.activo
      and (coalesce(r.todas_las_sedes, false)
           or exists (select 1 from usuario_sedes us where us.usuario_id = pf.id and us.sede_id = s))
  );
$$;

create or replace function requerir(p text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
  end if;
  if not tiene_permiso(p) then
    raise exception 'No tienes permiso para realizar esta acción (%).', p using errcode = '42501';
  end if;
end $$;

create or replace function requerir_sede(s uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if s is null or not puede_sede(s) then
    raise exception 'No tienes acceso a esta sede.' using errcode = '42501';
  end if;
end $$;

create or replace function _autorizar(p boolean) returns void language sql as
$$ select set_config('app.autorizado', case when p then 'si' else 'no' end, true) $$;

create or replace function _auditar(p_accion text, p_tabla text, p_registro text, p_sede uuid,
  p_antes jsonb default null, p_despues jsonb default null, p_detalle text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into auditoria (usuario_id, usuario_nombre, sede_id, accion, tabla, registro_id, antes, despues, detalle)
  values (auth.uid(), (select nombre from perfiles where id = auth.uid()), p_sede, p_accion, p_tabla,
          p_registro, p_antes, p_despues, p_detalle);
end $$;

create or replace function siguiente_consecutivo(p_sede uuid, p_tipo text) returns bigint
language sql security definer set search_path = public as $$
  insert into consecutivos (clave, ultimo) values (coalesce(p_sede::text, 'global') || ':' || p_tipo, 1)
  on conflict (clave) do update set ultimo = consecutivos.ultimo + 1
  returning ultimo;
$$;

create or replace function _metodo_efectivo() returns uuid language sql stable security definer set search_path = public as
$$ select id from metodos_pago where es_efectivo and activo order by orden limit 1 $$;

create or replace function _sesion_abierta(p_sede uuid) returns uuid language sql stable security definer set search_path = public as
$$ select id from caja_sesiones where usuario_id = auth.uid() and sede_id = p_sede and estado = 'abierta' limit 1 $$;

-- ---------------------------------------------------------------------
-- AUDITORÍA AUTOMÁTICA Y PROTECCIÓN DE REGISTROS CRÍTICOS
-- ---------------------------------------------------------------------
create or replace function fn_auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_antes jsonb; v_despues jsonb; v_id text; v_sede uuid;
begin
  if TG_OP in ('UPDATE','DELETE') then v_antes := to_jsonb(OLD); end if;
  if TG_OP in ('INSERT','UPDATE') then v_despues := to_jsonb(NEW); end if;
  if TG_OP = 'UPDATE' then
    if TG_TABLE_NAME = 'perfiles' and
       (v_antes - 'ultimo_inicio' - 'intentos_fallidos' - 'bloqueado_hasta') =
       (v_despues - 'ultimo_inicio' - 'intentos_fallidos' - 'bloqueado_hasta') then
      return NEW;
    end if;
    if v_antes = v_despues then return NEW; end if;
  end if;
  v_id := coalesce(v_despues->>'id', v_antes->>'id',
                   concat_ws(':', coalesce(v_despues->>'producto_id', v_antes->>'producto_id', v_despues->>'rol_id', v_antes->>'rol_id', v_despues->>'usuario_id', v_antes->>'usuario_id'),
                                  coalesce(v_despues->>'sede_id', v_antes->>'sede_id', v_despues->>'permiso', v_antes->>'permiso')));
  begin
    v_sede := nullif(coalesce(v_despues->>'sede_id', v_antes->>'sede_id'), '')::uuid;
  exception when others then v_sede := null;
  end;
  perform _auditar(case TG_OP when 'INSERT' then 'crear' when 'UPDATE' then 'modificar' else 'eliminar' end,
                   TG_TABLE_NAME, v_id, v_sede, v_antes, v_despues, null);
  return coalesce(NEW, OLD);
end $$;

do $$
declare t text;
begin
  foreach t in array array['config_empresa','sedes','roles','rol_permisos','perfiles','usuario_sedes','usuario_permisos',
    'unidades','categorias','impuestos','metodos_pago','proveedores','clientes','productos','producto_sedes','insumos',
    'recetas','receta_items','mesas','cajas','resoluciones','gastos_recurrentes'] loop
    execute format('create trigger auditar_%1$s after insert or update or delete on %1$I for each row execute function fn_auditar()', t);
  end loop;
end $$;

create or replace function fn_proteger() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.autorizado', true), '') = 'si' then
    return coalesce(NEW, OLD);
  end if;
  if TG_OP = 'DELETE' then
    raise exception 'No se permite eliminar registros de "%": es un registro crítico. Use la opción de anulación.', TG_TABLE_NAME;
  end if;
  if TG_OP = 'UPDATE' then
    if TG_TABLE_NAME in ('auditoria','movimientos_inventario','caja_movimientos','pagos','pagos_compra','devoluciones') then
      raise exception 'Los registros de "%" no se pueden modificar.', TG_TABLE_NAME;
    end if;
    if TG_TABLE_NAME = 'caja_sesiones' then
      if OLD.estado = 'cerrada' then
        raise exception 'Un cierre de caja no se puede modificar sin autorización (use corrección de cierre).';
      end if;
    end if;
  end if;
  return NEW;
end $$;

do $$
declare t text;
begin
  foreach t in array array['pedidos','pedido_items','pagos','caja_sesiones','caja_movimientos','movimientos_inventario',
    'gastos','compras','pagos_compra','devoluciones','transferencias','auditoria','producciones','conteos','documentos_electronicos'] loop
    execute format('create trigger proteger_%1$s before update or delete on %1$I for each row execute function fn_proteger()', t);
  end loop;
end $$;

-- Cambios de precio solo con permiso específico
create or replace function fn_validar_precio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and NEW.precio is distinct from OLD.precio and not tiene_permiso('productos.precios') then
    raise exception 'No tienes permiso para cambiar precios.' using errcode = '42501';
  end if;
  return NEW;
end $$;
create trigger validar_precio_productos before update on productos for each row execute function fn_validar_precio();

-- Quien solo puede "agotar" no puede cambiar otra cosa de la disponibilidad por sede
create or replace function fn_validar_producto_sede() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not tiene_permiso('productos.gestionar')
     and (to_jsonb(NEW) - 'agotado') is distinct from (to_jsonb(OLD) - 'agotado') then
    raise exception 'Solo puedes marcar o desmarcar productos agotados.' using errcode = '42501';
  end if;
  return NEW;
end $$;
create trigger validar_producto_sede before update on producto_sedes for each row execute function fn_validar_producto_sede();
create trigger validar_precio_sedes before update on producto_sedes for each row execute function fn_validar_precio();

-- ---------------------------------------------------------------------
-- UNIDADES E INVENTARIO
-- ---------------------------------------------------------------------
create or replace function convertir(p_cantidad numeric, p_de uuid, p_a uuid) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare a unidades; b unidades;
begin
  if p_de = p_a then return p_cantidad; end if;
  select * into a from unidades where id = p_de;
  select * into b from unidades where id = p_a;
  if a.id is null or b.id is null then raise exception 'Unidad de medida no encontrada.'; end if;
  if a.magnitud <> b.magnitud then
    raise exception 'No se puede convertir de % a %: son magnitudes diferentes (% / %).', a.nombre, b.nombre, a.magnitud, b.magnitud;
  end if;
  return p_cantidad * a.factor / b.factor;
end $$;

create or replace function _consumir_lotes(p_sede uuid, p_insumo uuid, p_cantidad numeric) returns void
language plpgsql security definer set search_path = public as $$
declare l record; v_resta numeric := p_cantidad; v_toma numeric;
begin
  for l in select id, cantidad from lotes where sede_id = p_sede and insumo_id = p_insumo and cantidad > 0
           order by vence nulls last, creado_en for update loop
    exit when v_resta <= 0;
    v_toma := least(l.cantidad, v_resta);
    update lotes set cantidad = cantidad - v_toma where id = l.id;
    v_resta := v_resta - v_toma;
  end loop;
end $$;

create or replace function _mover_inventario(p_sede uuid, p_insumo uuid, p_cantidad numeric, p_tipo text,
  p_costo numeric, p_motivo text, p_doc_tipo text, p_doc_id uuid, p_obs text default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_inv inventario; v_nuevo numeric; v_neg boolean; v_costo numeric; v_prom numeric;
begin
  if p_cantidad is null or p_cantidad = 0 then return null; end if;
  insert into inventario (insumo_id, sede_id, cantidad, costo_promedio)
  values (p_insumo, p_sede, 0, coalesce((select costo_unitario from insumos where id = p_insumo), 0))
  on conflict do nothing;
  select * into v_inv from inventario where insumo_id = p_insumo and sede_id = p_sede for update;
  v_nuevo := v_inv.cantidad + p_cantidad;
  v_neg := coalesce((select (inventario->>'permitir_negativo')::boolean from config_empresa where id = 1), true);
  if v_nuevo < 0 and not v_neg then
    raise exception 'Inventario insuficiente de "%": disponible %, requerido %.',
      (select nombre from insumos where id = p_insumo), round(v_inv.cantidad, 3), round(-p_cantidad, 3);
  end if;
  v_prom := v_inv.costo_promedio;
  if p_cantidad > 0 and coalesce(p_costo, 0) > 0
     and p_tipo in ('compra','produccion_entrada','transferencia_entrada','inicial') then
    if v_inv.cantidad <= 0 then
      v_prom := p_costo;
    else
      v_prom := (v_inv.cantidad * v_inv.costo_promedio + p_cantidad * p_costo) / v_nuevo;
    end if;
  end if;
  v_costo := coalesce(nullif(p_costo, 0), v_inv.costo_promedio);
  update inventario set cantidad = v_nuevo, costo_promedio = v_prom, actualizado_en = now()
  where insumo_id = p_insumo and sede_id = p_sede;
  insert into movimientos_inventario (sede_id, insumo_id, tipo, cantidad, costo_unitario, saldo, usuario_id,
                                      motivo, documento_tipo, documento_id, observaciones)
  values (p_sede, p_insumo, p_tipo, p_cantidad, v_costo, v_nuevo, auth.uid(), p_motivo, p_doc_tipo, p_doc_id, p_obs);
  if p_cantidad < 0 then perform _consumir_lotes(p_sede, p_insumo, -p_cantidad); end if;
  return v_nuevo;
end $$;

-- Movimiento manual (entradas, desperdicios, consumo interno, ajustes, vencimientos)
create or replace function registrar_movimiento(p_sede uuid, p_insumo uuid, p_tipo text, p_cantidad numeric,
  p_costo numeric default null, p_motivo text default null, p_obs text default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_cant numeric; v_saldo numeric;
begin
  perform requerir_sede(p_sede);
  if p_cantidad is null or p_cantidad = 0 then raise exception 'La cantidad no puede ser cero.'; end if;
  if p_tipo in ('inicial','compra') then
    perform requerir('inventario.entradas'); v_cant := abs(p_cantidad);
  elsif p_tipo in ('desperdicio','consumo_interno','vencimiento') then
    perform requerir('inventario.desperdicio'); v_cant := -abs(p_cantidad);
  elsif p_tipo = 'devolucion' then
    perform requerir('inventario.ajustes'); v_cant := -abs(p_cantidad);
  elsif p_tipo = 'ajuste' then
    perform requerir('inventario.ajustes'); v_cant := p_cantidad;
  else
    raise exception 'Tipo de movimiento no permitido: %', p_tipo;
  end if;
  if p_tipo in ('ajuste','desperdicio','devolucion','vencimiento') and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Debes indicar el motivo.';
  end if;
  v_saldo := _mover_inventario(p_sede, p_insumo, v_cant, p_tipo, p_costo, p_motivo, 'manual', null, p_obs);
  if p_costo is not null and p_costo > 0 and p_tipo in ('inicial','compra') then
    update insumos set costo_unitario = p_costo where id = p_insumo;
    update inventario set ultima_compra = hoy() where insumo_id = p_insumo and sede_id = p_sede and p_tipo = 'compra';
  end if;
  perform _auditar('movimiento_inventario', 'inventario', p_insumo::text, p_sede, null,
    jsonb_build_object('tipo', p_tipo, 'cantidad', v_cant, 'saldo', v_saldo, 'motivo', p_motivo), p_obs);
  return v_saldo;
end $$;

-- ---------------------------------------------------------------------
-- RECETAS Y COSTOS
-- ---------------------------------------------------------------------
create or replace function consumo_receta(p_receta uuid, p_cantidad numeric)
returns table (r_insumo uuid, r_cantidad numeric, r_costo numeric)
language sql stable security definer set search_path = public as $$
  select ri.insumo_id,
         convertir(ri.cantidad, ri.unidad_id, i.unidad_id) * (1 + ri.desperdicio_pct / 100)
           * (1 + r.merma_pct / 100) / r.rendimiento * p_cantidad,
         i.costo_unitario
  from recetas r
  join receta_items ri on ri.receta_id = r.id
  join insumos i on i.id = ri.insumo_id
  where r.id = p_receta;
$$;

create or replace function costo_receta(p_receta uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_total numeric; v_r recetas; v_items jsonb;
begin
  select * into v_r from recetas where id = p_receta;
  select coalesce(sum(r_cantidad * r_costo), 0),
         coalesce(jsonb_agg(jsonb_build_object('insumo_id', r_insumo, 'cantidad', r_cantidad, 'costo_unitario', r_costo,
                  'costo', r_cantidad * r_costo)), '[]'::jsonb)
    into v_total, v_items
  from consumo_receta(p_receta, v_r.rendimiento);
  return jsonb_build_object('costo_total', round(v_total, 2), 'rendimiento', v_r.rendimiento,
                            'costo_porcion', round(v_total / v_r.rendimiento, 2), 'ingredientes', v_items);
end $$;

create or replace function costo_producto(p_producto uuid) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare v_p productos; v_rec uuid; v_costo numeric;
begin
  select * into v_p from productos where id = p_producto;
  if v_p.control_inventario = 'receta' then
    select id into v_rec from recetas where producto_id = p_producto and activa;
    if v_rec is not null then
      select coalesce(sum(r_cantidad * r_costo), 0) into v_costo from consumo_receta(v_rec, 1);
      return round(v_costo, 2);
    end if;
  elsif v_p.control_inventario = 'directo' and v_p.insumo_id is not null then
    return round(v_p.cantidad_insumo * (select costo_unitario from insumos where id = v_p.insumo_id), 2);
  end if;
  return coalesce(v_p.costo_estimado, 0);
end $$;

create or replace function nueva_version_receta(p_receta uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_r recetas; v_nueva uuid;
begin
  perform requerir('recetas.gestionar');
  select * into v_r from recetas where id = p_receta;
  if v_r.id is null then raise exception 'Receta no encontrada.'; end if;
  update recetas set activa = false where id = p_receta;
  insert into recetas (nombre, producto_id, insumo_resultado_id, rendimiento, merma_pct, version, activa, instrucciones, creado_por)
  values (v_r.nombre, v_r.producto_id, v_r.insumo_resultado_id, v_r.rendimiento, v_r.merma_pct,
          (select max(version) + 1 from recetas where coalesce(producto_id, insumo_resultado_id) = coalesce(v_r.producto_id, v_r.insumo_resultado_id)),
          true, v_r.instrucciones, auth.uid())
  returning id into v_nueva;
  insert into receta_items (receta_id, insumo_id, cantidad, unidad_id, desperdicio_pct)
  select v_nueva, insumo_id, cantidad, unidad_id, desperdicio_pct from receta_items where receta_id = p_receta;
  return v_nueva;
end $$;

create or replace function activar_version_receta(p_receta uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_r recetas;
begin
  perform requerir('recetas.gestionar');
  select * into v_r from recetas where id = p_receta;
  update recetas set activa = false
   where id <> p_receta and activa
     and ((v_r.producto_id is not null and producto_id = v_r.producto_id)
       or (v_r.insumo_resultado_id is not null and insumo_resultado_id = v_r.insumo_resultado_id));
  update recetas set activa = true where id = p_receta;
end $$;

create or replace function registrar_produccion(p_sede uuid, p_receta uuid, p_lotes numeric,
  p_cantidad_real numeric default null, p_obs text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_r recetas; v_prod numeric; v_total numeric := 0; c record; v_id uuid; v_num bigint; v_costo_u numeric;
begin
  perform requerir('produccion.registrar');
  perform requerir_sede(p_sede);
  select * into v_r from recetas where id = p_receta;
  if v_r.insumo_resultado_id is null then
    raise exception 'Esta receta no produce una preparación intermedia (no tiene insumo resultado).';
  end if;
  if coalesce(p_lotes, 0) <= 0 then raise exception 'Indica cuántas tandas se produjeron.'; end if;
  v_prod := coalesce(p_cantidad_real, v_r.rendimiento * p_lotes * (1 - v_r.merma_pct / 100));
  if v_prod <= 0 then raise exception 'La cantidad producida debe ser mayor a cero.'; end if;
  v_num := siguiente_consecutivo(p_sede, 'produccion');
  insert into producciones (numero, sede_id, receta_id, lotes, cantidad_producida, usuario_id, observaciones)
  values (v_num, p_sede, p_receta, p_lotes, v_prod, auth.uid(), p_obs) returning id into v_id;
  for c in
    select ri.insumo_id as ins, convertir(ri.cantidad, ri.unidad_id, i.unidad_id) * (1 + ri.desperdicio_pct / 100) * p_lotes as cant,
           coalesce(nullif(inv.costo_promedio, 0), i.costo_unitario) as costo
    from receta_items ri join insumos i on i.id = ri.insumo_id
    left join inventario inv on inv.insumo_id = ri.insumo_id and inv.sede_id = p_sede
    where ri.receta_id = p_receta
  loop
    perform _mover_inventario(p_sede, c.ins, -c.cant, 'produccion_consumo', c.costo, 'Producción #' || v_num, 'produccion', v_id);
    v_total := v_total + c.cant * c.costo;
  end loop;
  v_costo_u := v_total / v_prod;
  perform _mover_inventario(p_sede, v_r.insumo_resultado_id, v_prod, 'produccion_entrada', v_costo_u, 'Producción #' || v_num, 'produccion', v_id);
  update insumos set costo_unitario = round(v_costo_u, 4) where id = v_r.insumo_resultado_id;
  perform _autorizar(true);
  update producciones set costo_total = round(v_total, 2) where id = v_id;
  perform _autorizar(false);
  perform _auditar('produccion', 'producciones', v_id::text, p_sede, null,
    jsonb_build_object('receta', v_r.nombre, 'lotes', p_lotes, 'producido', v_prod, 'costo_total', v_total));
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- PEDIDOS Y VENTAS
-- ---------------------------------------------------------------------
create or replace function _producto_disponible(p_producto uuid, p_sede uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_p productos; v_ps producto_sedes; v_ahora timestamp := now() at time zone 'America/Bogota';
begin
  select * into v_p from productos where id = p_producto;
  if v_p.id is null or not v_p.activo then return false; end if;
  select * into v_ps from producto_sedes where producto_id = p_producto and sede_id = p_sede;
  if v_ps.producto_id is null then return true; end if;
  if not v_ps.disponible or v_ps.agotado then return false; end if;
  if v_ps.dias is not null and not (extract(dow from v_ahora)::int = any (v_ps.dias)) then return false; end if;
  if v_ps.hora_desde is not null and v_ahora::time < v_ps.hora_desde then return false; end if;
  if v_ps.hora_hasta is not null and v_ahora::time > v_ps.hora_hasta then return false; end if;
  return true;
end $$;

create or replace function _recalcular_pedido(p_pedido uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_tot numeric; v_imp numeric;
begin
  update pedido_items set
    impuesto_valor = case
      when impuesto_pct = 0 then 0
      when impuesto_incluido then round((cantidad * precio_unitario - descuento) - (cantidad * precio_unitario - descuento) / (1 + impuesto_pct / 100), 2)
      else round((cantidad * precio_unitario - descuento) * impuesto_pct / 100, 2) end,
    total = case
      when impuesto_incluido or impuesto_pct = 0 then cantidad * precio_unitario - descuento
      else (cantidad * precio_unitario - descuento) + round((cantidad * precio_unitario - descuento) * impuesto_pct / 100, 2) end
  where pedido_id = p_pedido and estado = 'activo';
  select coalesce(sum(total), 0), coalesce(sum(impuesto_valor), 0) into v_tot, v_imp
  from pedido_items where pedido_id = p_pedido and estado = 'activo';
  update pedidos set impuestos = v_imp, subtotal = v_tot - v_imp,
         total = greatest(v_tot - descuento + valor_domicilio, 0), actualizado_en = now()
  where id = p_pedido;
end $$;

create or replace function _pedido_abierto(p_pedido uuid) returns pedidos
language plpgsql security definer set search_path = public as $$
declare v pedidos;
begin
  select * into v from pedidos where id = p_pedido for update;
  if v.id is null then raise exception 'Pedido no encontrado.'; end if;
  perform requerir_sede(v.sede_id);
  if v.estado = 'cancelado' or v.estado_pago not in ('abierto','parcial') then
    raise exception 'El pedido #% ya está cerrado o cancelado.', v.numero;
  end if;
  return v;
end $$;

create or replace function _liberar_mesa(p_mesa uuid) returns void
language sql security definer set search_path = public as $$
  update mesas set estado = 'libre'
  where id = p_mesa and not exists (
    select 1 from pedidos where mesa_id = p_mesa and estado <> 'cancelado' and estado_pago in ('abierto','parcial'));
$$;

create or replace function crear_pedido(p_sede uuid, p_tipo text, p_mesa uuid default null, p_cliente uuid default null,
  p_observaciones text default null, p_domicilio jsonb default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num bigint; v_mesa mesas;
begin
  perform requerir('pos.vender');
  perform requerir_sede(p_sede);
  if p_tipo = 'mesa' then
    select * into v_mesa from mesas where id = p_mesa and sede_id = p_sede and activa;
    if v_mesa.id is null then raise exception 'Selecciona una mesa válida de esta sede.'; end if;
    if exists (select 1 from pedidos where mesa_id = p_mesa and estado <> 'cancelado' and estado_pago in ('abierto','parcial')) then
      raise exception 'La mesa % ya tiene una cuenta abierta.', v_mesa.nombre;
    end if;
  elsif p_tipo = 'domicilio' then
    if coalesce(trim(p_domicilio->>'direccion'), '') = '' then raise exception 'El domicilio necesita una dirección.'; end if;
  end if;
  v_num := siguiente_consecutivo(p_sede, 'pedido');
  insert into pedidos (sede_id, numero, tipo_servicio, mesa_id, cliente_id, usuario_id, observaciones, valor_domicilio)
  values (p_sede, v_num, p_tipo, case when p_tipo = 'mesa' then p_mesa end, p_cliente, auth.uid(), p_observaciones,
          coalesce((p_domicilio->>'valor_domicilio')::numeric, 0))
  returning id into v_id;
  if p_tipo = 'mesa' then
    update mesas set estado = 'ocupada', nota_reserva = null where id = p_mesa;
  elsif p_tipo = 'domicilio' then
    insert into domicilios (pedido_id, cliente_nombre, telefono, direccion, barrio, referencias, domiciliario, observaciones)
    values (v_id, p_domicilio->>'cliente_nombre', p_domicilio->>'telefono', p_domicilio->>'direccion', p_domicilio->>'barrio',
            p_domicilio->>'referencias', p_domicilio->>'domiciliario', p_domicilio->>'observaciones');
  end if;
  perform _recalcular_pedido(v_id);
  return v_id;
end $$;

create or replace function agregar_items(p_pedido uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; it jsonb; v_p productos; v_cant numeric; v_precio numeric; v_desc numeric;
        v_pct numeric; v_incl boolean; v_nombre text; v_cocina boolean; v_personal boolean; v_hay_cocina boolean := false;
begin
  perform requerir('pos.vender');
  v_ped := _pedido_abierto(p_pedido);
  for it in select * from jsonb_array_elements(p_items) loop
    v_cant := coalesce((it->>'cantidad')::numeric, 1);
    if v_cant <= 0 then raise exception 'La cantidad debe ser mayor a cero.'; end if;
    v_pct := 0; v_incl := true; v_personal := false;
    if nullif(it->>'producto_id', '') is not null then
      select * into v_p from productos where id = (it->>'producto_id')::uuid;
      if not _producto_disponible(v_p.id, v_ped.sede_id) then
        raise exception 'El producto "%" no está disponible en este momento.', coalesce(v_p.nombre, '?');
      end if;
      v_nombre := v_p.nombre;
      v_precio := coalesce((select precio from producto_sedes where producto_id = v_p.id and sede_id = v_ped.sede_id), v_p.precio);
      v_cocina := v_p.va_a_cocina;
      select porcentaje, incluido_en_precio into v_pct, v_incl from impuestos where id = v_p.impuesto_id and activo;
      v_pct := coalesce(v_pct, 0); v_incl := coalesce(v_incl, true);
    else
      perform requerir('pos.producto_personalizado');
      v_nombre := nullif(trim(it->>'nombre'), '');
      v_precio := (it->>'precio')::numeric;
      if v_nombre is null or v_precio is null or v_precio < 0 then raise exception 'Producto personalizado: indica nombre y precio.'; end if;
      v_cocina := coalesce((it->>'va_a_cocina')::boolean, false);
      v_personal := true;
    end if;
    v_desc := coalesce((it->>'descuento')::numeric, 0);
    if v_desc > 0 then
      perform requerir('pos.descuento');
      if v_desc > v_cant * v_precio then raise exception 'El descuento no puede superar el valor del producto.'; end if;
    end if;
    insert into pedido_items (pedido_id, producto_id, nombre, cantidad, precio_unitario, descuento, impuesto_pct,
                              impuesto_incluido, observaciones, personalizado, va_a_cocina, creado_por)
    values (p_pedido, case when v_personal then null else v_p.id end, v_nombre, v_cant, v_precio, v_desc, v_pct, v_incl,
            nullif(trim(it->>'observaciones'), ''), v_personal, v_cocina, auth.uid());
    v_hay_cocina := v_hay_cocina or v_cocina;
  end loop;
  if v_hay_cocina and v_ped.estado in ('listo','entregado') then
    update pedidos set estado = 'pendiente' where id = p_pedido;
  end if;
  perform _recalcular_pedido(p_pedido);
end $$;

create or replace function modificar_item(p_item uuid, p_cantidad numeric, p_observaciones text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_it pedido_items; v_ped pedidos;
begin
  perform requerir('pos.vender');
  select * into v_it from pedido_items where id = p_item;
  v_ped := _pedido_abierto(v_it.pedido_id);
  if p_cantidad <= 0 then raise exception 'Para quitar un producto usa "eliminar".'; end if;
  if p_cantidad < v_it.cantidad and v_it.va_a_cocina and v_ped.estado <> 'pendiente' then
    perform requerir('pos.cancelar_venta');
  end if;
  update pedido_items set cantidad = p_cantidad, observaciones = coalesce(p_observaciones, observaciones) where id = p_item;
  perform _recalcular_pedido(v_it.pedido_id);
end $$;

create or replace function cancelar_item(p_item uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_it pedido_items; v_ped pedidos;
begin
  perform requerir('pos.vender');
  select * into v_it from pedido_items where id = p_item;
  v_ped := _pedido_abierto(v_it.pedido_id);
  if v_it.va_a_cocina and v_ped.estado <> 'pendiente' then
    perform requerir('pos.cancelar_venta');
    if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo para quitar un producto ya enviado a cocina.'; end if;
  end if;
  update pedido_items set estado = 'cancelado', motivo_cancelacion = p_motivo where id = p_item;
  perform _recalcular_pedido(v_it.pedido_id);
  if (select total from pedidos where id = v_it.pedido_id) < v_ped.pagado then
    raise exception 'No se puede quitar: el pedido ya tiene pagos por un valor mayor al nuevo total.';
  end if;
  perform _auditar('producto_retirado_pedido', 'pedido_items', p_item::text, v_ped.sede_id, to_jsonb(v_it), null, p_motivo);
end $$;

create or replace function descuento_pedido(p_pedido uuid, p_valor numeric, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_ped pedidos;
begin
  perform requerir('pos.descuento');
  v_ped := _pedido_abierto(p_pedido);
  if p_valor < 0 then raise exception 'Descuento inválido.'; end if;
  if p_valor > 0 and coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo del descuento.'; end if;
  update pedidos set descuento = p_valor, descuento_motivo = p_motivo where id = p_pedido;
  perform _recalcular_pedido(p_pedido);
  perform _auditar('descuento', 'pedidos', p_pedido::text, v_ped.sede_id,
    jsonb_build_object('descuento', v_ped.descuento), jsonb_build_object('descuento', p_valor), p_motivo);
end $$;

-- Consumo de inventario de una línea de pedido
create or replace function _consumo_item(p_item uuid, p_cantidad numeric)
returns table (r_insumo uuid, r_cantidad numeric, r_costo numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_pr productos; v_rec uuid; v_prod uuid;
begin
  select producto_id into v_prod from pedido_items where id = p_item;
  if v_prod is null then return; end if;
  select * into v_pr from productos where id = v_prod;
  if v_pr.control_inventario = 'receta' then
    select id into v_rec from recetas where producto_id = v_pr.id and activa;
    if v_rec is not null then
      return query select * from consumo_receta(v_rec, p_cantidad);
    end if;
  elsif v_pr.control_inventario = 'directo' and v_pr.insumo_id is not null then
    return query select v_pr.insumo_id, v_pr.cantidad_insumo * p_cantidad, i.costo_unitario from insumos i where i.id = v_pr.insumo_id;
  end if;
end $$;

create or replace function _descontar_inventario_pedido(p_pedido uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; it record; c record; v_costo numeric; v_hubo boolean;
begin
  select * into v_ped from pedidos where id = p_pedido;
  for it in
    select pi.id as item_id, pi.cantidad, pi.producto_id, coalesce(pr.costo_estimado, 0) as costo_manual
    from pedido_items pi left join productos pr on pr.id = pi.producto_id
    where pi.pedido_id = p_pedido and pi.estado = 'activo' and not pi.inventario_descontado
  loop
    v_costo := 0; v_hubo := false;
    for c in select * from _consumo_item(it.item_id, it.cantidad) loop
      perform _mover_inventario(v_ped.sede_id, c.r_insumo, -c.r_cantidad, 'venta', null,
                                'Venta pedido #' || v_ped.numero, 'pedido', p_pedido);
      v_costo := v_costo + c.r_cantidad * c.r_costo;
      v_hubo := true;
    end loop;
    if not v_hubo then v_costo := it.costo_manual * it.cantidad; end if;
    update pedido_items set inventario_descontado = true, costo_unitario = round(v_costo / it.cantidad, 2) where id = it.item_id;
  end loop;
end $$;

create or replace function _cerrar_pedido(p_pedido uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_cocina boolean;
begin
  select * into v_ped from pedidos where id = p_pedido;
  select exists (select 1 from pedido_items where pedido_id = p_pedido and estado = 'activo' and va_a_cocina) into v_cocina;
  update pedidos set estado_pago = 'pagado', cerrado_en = now(),
         comprobante_numero = siguiente_consecutivo(v_ped.sede_id, 'comprobante'),
         estado = case when not v_cocina and estado = 'pendiente' and tipo_servicio in ('mostrador','llevar','recoger','mesa') then 'entregado' else estado end
  where id = p_pedido;
  perform _descontar_inventario_pedido(p_pedido);
  if v_ped.mesa_id is not null then perform _liberar_mesa(v_ped.mesa_id); end if;
  perform _auditar('venta', 'pedidos', p_pedido::text, v_ped.sede_id, null,
    jsonb_build_object('numero', v_ped.numero, 'total', v_ped.total));
end $$;

create or replace function registrar_pago(p_pedido uuid, p_pagos jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_ses uuid; p jsonb; v_val numeric; v_sum numeric := 0; v_met metodos_pago; v_rec numeric; v_cambio numeric := 0;
begin
  perform requerir('pos.vender');
  v_ped := _pedido_abierto(p_pedido);
  if not exists (select 1 from pedido_items where pedido_id = p_pedido and estado = 'activo') then
    raise exception 'El pedido no tiene productos.';
  end if;
  v_ses := _sesion_abierta(v_ped.sede_id);
  if v_ses is null then raise exception 'Debes abrir tu caja en esta sede antes de cobrar.'; end if;
  select coalesce(sum((x->>'valor')::numeric), 0) into v_sum from jsonb_array_elements(p_pagos) x;
  if v_sum <= 0 then raise exception 'Indica el valor a pagar.'; end if;
  if v_sum > (v_ped.total - v_ped.pagado) + 0.5 then
    raise exception 'El pago (%) supera el saldo pendiente (%).', v_sum, v_ped.total - v_ped.pagado;
  end if;
  for p in select * from jsonb_array_elements(p_pagos) loop
    v_val := (p->>'valor')::numeric;
    continue when coalesce(v_val, 0) <= 0;
    select * into v_met from metodos_pago where id = (p->>'metodo_id')::uuid and activo;
    if v_met.id is null then raise exception 'Método de pago no válido o deshabilitado.'; end if;
    v_rec := (p->>'recibido')::numeric;
    v_cambio := case when v_met.es_efectivo and v_rec is not null and v_rec > v_val then v_rec - v_val else 0 end;
    insert into pagos (pedido_id, sede_id, metodo_id, valor, recibido, cambio, referencia, caja_sesion_id, usuario_id)
    values (p_pedido, v_ped.sede_id, v_met.id, v_val, v_rec, v_cambio, p->>'referencia', v_ses, auth.uid());
    insert into caja_movimientos (sesion_id, sede_id, tipo, metodo_id, valor, descripcion, referencia_tipo, referencia_id, usuario_id)
    values (v_ses, v_ped.sede_id, 'venta', v_met.id, v_val, 'Pedido #' || v_ped.numero, 'pedido', p_pedido, auth.uid());
  end loop;
  update pedidos set pagado = pagado + v_sum, estado_pago = 'parcial' where id = p_pedido;
  if v_ped.pagado + v_sum >= v_ped.total - 0.5 then
    perform _cerrar_pedido(p_pedido);
  end if;
  return (select jsonb_build_object('estado_pago', estado_pago, 'pagado', pagado, 'saldo', total - pagado,
                                    'comprobante_numero', comprobante_numero, 'cambio', v_cambio)
          from pedidos where id = p_pedido);
end $$;

create or replace function cancelar_pedido(p_pedido uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_ped pedidos;
begin
  perform requerir('pos.cancelar_venta');
  v_ped := _pedido_abierto(p_pedido);
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo de la cancelación.'; end if;
  if v_ped.pagado > 0 then raise exception 'El pedido tiene pagos registrados. Registra primero la devolución.'; end if;
  update pedidos set estado = 'cancelado', estado_pago = 'anulado', motivo_cancelacion = p_motivo,
         cancelado_por = auth.uid(), actualizado_en = now() where id = p_pedido;
  update domicilios set estado = 'cancelado' where pedido_id = p_pedido;
  if v_ped.mesa_id is not null then perform _liberar_mesa(v_ped.mesa_id); end if;
  perform _auditar('pedido_cancelado', 'pedidos', p_pedido::text, v_ped.sede_id, to_jsonb(v_ped), null, p_motivo);
end $$;

create or replace function registrar_devolucion(p_pedido uuid, p_valor numeric, p_motivo text, p_metodo uuid default null,
  p_reintegrar boolean default false, p_items jsonb default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_ses uuid; v_id uuid; v_met uuid; it jsonb; c record;
begin
  perform requerir('pos.devolucion');
  select * into v_ped from pedidos where id = p_pedido for update;
  perform requerir_sede(v_ped.sede_id);
  if v_ped.estado_pago not in ('pagado','parcial') then raise exception 'Solo se pueden devolver ventas con pagos.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'La devolución debe registrar su motivo.'; end if;
  if coalesce(p_valor, 0) < 0 or p_valor > v_ped.pagado - v_ped.devuelto + 0.5 then
    raise exception 'El valor a devolver supera lo pagado (disponible: %).', v_ped.pagado - v_ped.devuelto;
  end if;
  v_met := coalesce(p_metodo, _metodo_efectivo());
  v_ses := _sesion_abierta(v_ped.sede_id);
  if p_valor > 0 and v_ses is null then raise exception 'Debes tener tu caja abierta para registrar la devolución.'; end if;
  insert into devoluciones (numero, sede_id, pedido_id, motivo, valor, metodo_id, caja_sesion_id, reintegrar_inventario, items, usuario_id)
  values (siguiente_consecutivo(v_ped.sede_id, 'devolucion'), v_ped.sede_id, p_pedido, p_motivo, p_valor, v_met, v_ses,
          p_reintegrar, p_items, auth.uid())
  returning id into v_id;
  if p_valor > 0 then
    insert into caja_movimientos (sesion_id, sede_id, tipo, metodo_id, valor, descripcion, referencia_tipo, referencia_id, usuario_id)
    values (v_ses, v_ped.sede_id, 'devolucion', v_met, -p_valor, 'Devolución pedido #' || v_ped.numero, 'devolucion', v_id, auth.uid());
  end if;
  if p_reintegrar and p_items is not null then
    for it in select * from jsonb_array_elements(p_items) loop
      for c in select * from _consumo_item((it->>'item_id')::uuid, (it->>'cantidad')::numeric) loop
        perform _mover_inventario(v_ped.sede_id, c.r_insumo, c.r_cantidad, 'devolucion', null,
          'Devolución pedido #' || v_ped.numero, 'devolucion', v_id);
      end loop;
    end loop;
  end if;
  perform _autorizar(true);
  update pedidos set devuelto = devuelto + p_valor, actualizado_en = now() where id = p_pedido;
  perform _autorizar(false);
  perform _auditar('devolucion', 'devoluciones', v_id::text, v_ped.sede_id, null,
    jsonb_build_object('pedido', v_ped.numero, 'valor', p_valor, 'reintegrar', p_reintegrar), p_motivo);
  return v_id;
end $$;

create or replace function anular_venta(p_pedido uuid, p_motivo text, p_metodo uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_ses uuid; v_valor numeric; v_dev uuid; m record; v_met uuid;
begin
  perform requerir('pos.anular_venta');
  select * into v_ped from pedidos where id = p_pedido for update;
  perform requerir_sede(v_ped.sede_id);
  if v_ped.estado_pago <> 'pagado' then raise exception 'Solo se pueden anular ventas pagadas.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'La anulación debe registrar su motivo.'; end if;
  v_valor := v_ped.pagado - v_ped.devuelto;
  v_met := coalesce(p_metodo, _metodo_efectivo());
  v_ses := _sesion_abierta(v_ped.sede_id);
  if v_valor > 0 and v_ses is null then raise exception 'Debes tener tu caja abierta para anular la venta.'; end if;
  insert into devoluciones (numero, sede_id, pedido_id, motivo, valor, metodo_id, caja_sesion_id, reintegrar_inventario, es_anulacion, usuario_id)
  values (siguiente_consecutivo(v_ped.sede_id, 'devolucion'), v_ped.sede_id, p_pedido, p_motivo, v_valor, v_met, v_ses, true, true, auth.uid())
  returning id into v_dev;
  if v_valor > 0 then
    insert into caja_movimientos (sesion_id, sede_id, tipo, metodo_id, valor, descripcion, referencia_tipo, referencia_id, usuario_id)
    values (v_ses, v_ped.sede_id, 'devolucion', v_met, -v_valor, 'Anulación venta #' || v_ped.numero, 'devolucion', v_dev, auth.uid());
  end if;
  -- Reintegra exactamente lo que se descontó (neto de devoluciones previas con reintegro)
  for m in select insumo_id, -sum(cantidad) as cant from movimientos_inventario
           where documento_id in (select p_pedido union select id from devoluciones where pedido_id = p_pedido)
             and tipo in ('venta','devolucion')
           group by insumo_id having -sum(cantidad) > 0 loop
    perform _mover_inventario(v_ped.sede_id, m.insumo_id, m.cant, 'anulacion', null, 'Anulación venta #' || v_ped.numero, 'devolucion', v_dev);
  end loop;
  perform _autorizar(true);
  update pedidos set estado_pago = 'anulado', estado = 'cancelado', devuelto = pagado, motivo_cancelacion = p_motivo,
         cancelado_por = auth.uid(), actualizado_en = now() where id = p_pedido;
  perform _autorizar(false);
  perform _auditar('venta_anulada', 'pedidos', p_pedido::text, v_ped.sede_id, to_jsonb(v_ped), null, p_motivo);
end $$;

create or replace function cambiar_estado_pedido(p_pedido uuid, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
declare v_ped pedidos;
begin
  if not (tiene_permiso('cocina.actualizar') or tiene_permiso('pos.vender') or tiene_permiso('domicilios.gestionar')) then
    perform requerir('cocina.actualizar');
  end if;
  select * into v_ped from pedidos where id = p_pedido;
  perform requerir_sede(v_ped.sede_id);
  if p_estado not in ('pendiente','en_preparacion','listo','entregado') then raise exception 'Estado no válido.'; end if;
  if v_ped.estado = 'cancelado' then raise exception 'El pedido está cancelado.'; end if;
  update pedidos set estado = p_estado, actualizado_en = now() where id = p_pedido;
  if v_ped.tipo_servicio = 'domicilio' and p_estado in ('en_preparacion','listo') then
    update domicilios set estado = p_estado where pedido_id = p_pedido and estado in ('recibido','en_preparacion','listo');
  end if;
end $$;

create or replace function cambiar_estado_domicilio(p_pedido uuid, p_estado text, p_domiciliario text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_ped pedidos;
begin
  perform requerir('domicilios.gestionar');
  select * into v_ped from pedidos where id = p_pedido;
  perform requerir_sede(v_ped.sede_id);
  if p_estado = 'cancelado' then raise exception 'Para cancelar un domicilio cancela el pedido.'; end if;
  update domicilios set estado = p_estado,
         domiciliario = coalesce(nullif(p_domiciliario, ''), domiciliario),
         hora_salida = case when p_estado = 'en_camino' then now() else hora_salida end,
         hora_entrega = case when p_estado = 'entregado' then now() else hora_entrega end
  where pedido_id = p_pedido;
  if p_estado in ('en_preparacion','listo') then
    update pedidos set estado = p_estado where id = p_pedido and estado <> 'cancelado';
  elsif p_estado = 'entregado' then
    update pedidos set estado = 'entregado' where id = p_pedido and estado <> 'cancelado';
  end if;
end $$;

create or replace function cambiar_estado_mesa(p_mesa uuid, p_estado text, p_nota text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_m mesas;
begin
  perform requerir('mesas.gestionar');
  select * into v_m from mesas where id = p_mesa;
  perform requerir_sede(v_m.sede_id);
  if p_estado in ('libre','reservada') and exists (select 1 from pedidos where mesa_id = p_mesa and estado <> 'cancelado' and estado_pago in ('abierto','parcial')) then
    raise exception 'La mesa tiene una cuenta abierta.';
  end if;
  update mesas set estado = p_estado, nota_reserva = case when p_estado = 'reservada' then p_nota end where id = p_mesa;
end $$;

create or replace function trasladar_pedido(p_pedido uuid, p_mesa uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_m mesas;
begin
  perform requerir('pos.vender');
  v_ped := _pedido_abierto(p_pedido);
  select * into v_m from mesas where id = p_mesa and sede_id = v_ped.sede_id and activa;
  if v_m.id is null then raise exception 'Mesa destino no válida.'; end if;
  if exists (select 1 from pedidos where mesa_id = p_mesa and id <> p_pedido and estado <> 'cancelado' and estado_pago in ('abierto','parcial')) then
    raise exception 'La mesa % ya tiene una cuenta abierta: usa "unir cuentas".', v_m.nombre;
  end if;
  update pedidos set mesa_id = p_mesa, tipo_servicio = 'mesa' where id = p_pedido;
  update mesas set estado = 'ocupada', nota_reserva = null where id = p_mesa;
  if v_ped.mesa_id is not null then perform _liberar_mesa(v_ped.mesa_id); end if;
  perform _auditar('traslado_mesa', 'pedidos', p_pedido::text, v_ped.sede_id,
    jsonb_build_object('mesa_id', v_ped.mesa_id), jsonb_build_object('mesa_id', p_mesa));
end $$;

create or replace function unir_pedidos(p_origen uuid, p_destino uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_o pedidos; v_d pedidos;
begin
  perform requerir('pos.vender');
  v_o := _pedido_abierto(p_origen);
  v_d := _pedido_abierto(p_destino);
  if v_o.sede_id <> v_d.sede_id or p_origen = p_destino then raise exception 'Solo se unen cuentas distintas de la misma sede.'; end if;
  if v_o.pagado > 0 then raise exception 'La cuenta origen tiene pagos; únela en sentido contrario.'; end if;
  update pedido_items set pedido_id = p_destino where pedido_id = p_origen and estado = 'activo';
  update pedidos set estado = 'cancelado', estado_pago = 'anulado', motivo_cancelacion = 'Unido al pedido #' || v_d.numero,
         cancelado_por = auth.uid() where id = p_origen;
  perform _recalcular_pedido(p_origen);
  perform _recalcular_pedido(p_destino);
  if v_o.mesa_id is not null then perform _liberar_mesa(v_o.mesa_id); end if;
  perform _auditar('unir_cuentas', 'pedidos', p_destino::text, v_d.sede_id, jsonb_build_object('origen', v_o.numero), jsonb_build_object('destino', v_d.numero));
end $$;

create or replace function separar_cuenta(p_pedido uuid, p_items jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_nuevo uuid; it jsonb; v_it pedido_items; v_cant numeric;
begin
  perform requerir('pos.vender');
  v_ped := _pedido_abierto(p_pedido);
  insert into pedidos (sede_id, numero, tipo_servicio, mesa_id, cliente_id, usuario_id, estado, observaciones)
  values (v_ped.sede_id, siguiente_consecutivo(v_ped.sede_id, 'pedido'), v_ped.tipo_servicio, v_ped.mesa_id, null,
          auth.uid(), v_ped.estado, 'Separada del pedido #' || v_ped.numero)
  returning id into v_nuevo;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into v_it from pedido_items where id = (it->>'item_id')::uuid and pedido_id = p_pedido and estado = 'activo';
    if v_it.id is null then raise exception 'Producto no encontrado en la cuenta.'; end if;
    v_cant := coalesce((it->>'cantidad')::numeric, v_it.cantidad);
    if v_cant <= 0 or v_cant > v_it.cantidad then raise exception 'Cantidad inválida para "%".', v_it.nombre; end if;
    if v_cant = v_it.cantidad then
      update pedido_items set pedido_id = v_nuevo where id = v_it.id;
    else
      update pedido_items set cantidad = cantidad - v_cant,
             descuento = round(descuento * (cantidad - v_cant) / cantidad, 2) where id = v_it.id;
      insert into pedido_items (pedido_id, producto_id, nombre, cantidad, precio_unitario, descuento, impuesto_pct, impuesto_incluido,
                                observaciones, personalizado, va_a_cocina, creado_por, creado_en)
      values (v_nuevo, v_it.producto_id, v_it.nombre, v_cant, v_it.precio_unitario, round(v_it.descuento * v_cant / v_it.cantidad, 2),
              v_it.impuesto_pct, v_it.impuesto_incluido, v_it.observaciones, v_it.personalizado, v_it.va_a_cocina, v_it.creado_por, v_it.creado_en);
    end if;
  end loop;
  perform _recalcular_pedido(p_pedido);
  perform _recalcular_pedido(v_nuevo);
  if (select total from pedidos where id = p_pedido) < v_ped.pagado then
    raise exception 'No se puede separar: lo pagado supera lo que queda en la cuenta original.';
  end if;
  return v_nuevo;
end $$;

-- ---------------------------------------------------------------------
-- CAJA
-- ---------------------------------------------------------------------
create or replace function abrir_caja(p_caja uuid, p_saldo numeric, p_denominaciones jsonb default null, p_obs text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_c cajas; v_id uuid;
begin
  perform requerir('caja.operar');
  select * into v_c from cajas where id = p_caja and activa;
  if v_c.id is null then raise exception 'Caja no encontrada.'; end if;
  perform requerir_sede(v_c.sede_id);
  if exists (select 1 from caja_sesiones where caja_id = p_caja and estado = 'abierta') then
    raise exception 'La caja "%" ya está abierta por otro usuario.', v_c.nombre;
  end if;
  if exists (select 1 from caja_sesiones where usuario_id = auth.uid() and estado = 'abierta') then
    raise exception 'Ya tienes una caja abierta. Ciérrala antes de abrir otra.';
  end if;
  insert into caja_sesiones (caja_id, sede_id, usuario_id, saldo_inicial, denominaciones_apertura, observaciones_apertura)
  values (p_caja, v_c.sede_id, auth.uid(), coalesce(p_saldo, 0), p_denominaciones, p_obs) returning id into v_id;
  perform _auditar('apertura_caja', 'caja_sesiones', v_id::text, v_c.sede_id, null,
    jsonb_build_object('caja', v_c.nombre, 'saldo_inicial', p_saldo));
  return v_id;
end $$;

create or replace function _puede_ver_sesion(p_sesion uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from caja_sesiones s where s.id = p_sesion and puede_sede(s.sede_id)
                 and (s.usuario_id = auth.uid() or tiene_permiso('caja.ver_todas')));
$$;

create or replace function resumen_caja(p_sesion uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s caja_sesiones; v jsonb;
begin
  select * into s from caja_sesiones where id = p_sesion;
  if not _puede_ver_sesion(p_sesion) then raise exception 'No tienes acceso a esta caja.' using errcode = '42501'; end if;
  select jsonb_build_object(
    'saldo_inicial', s.saldo_inicial,
    'total_ventas', coalesce(sum(m.valor) filter (where m.tipo = 'venta'), 0),
    'ventas_efectivo', coalesce(sum(m.valor) filter (where m.tipo = 'venta' and coalesce(mp.es_efectivo, true)), 0),
    'ventas_otros_medios', coalesce(sum(m.valor) filter (where m.tipo = 'venta' and not coalesce(mp.es_efectivo, true)), 0),
    'ingresos', coalesce(sum(m.valor) filter (where m.tipo = 'ingreso'), 0),
    'gastos', coalesce(-sum(m.valor) filter (where m.tipo in ('gasto','pago_proveedor')), 0),
    'retiros', coalesce(-sum(m.valor) filter (where m.tipo = 'retiro'), 0),
    'devoluciones', coalesce(-sum(m.valor) filter (where m.tipo = 'devolucion'), 0),
    'ajustes', coalesce(sum(m.valor) filter (where m.tipo in ('ajuste','transferencia')), 0),
    'saldo_esperado', s.saldo_inicial + coalesce(sum(m.valor) filter (where coalesce(mp.es_efectivo, true)), 0),
    'movimientos', count(m.id)
  ) into v
  from caja_movimientos m left join metodos_pago mp on mp.id = m.metodo_id
  where m.sesion_id = p_sesion;
  v := v || jsonb_build_object('por_metodo', coalesce((
    select jsonb_agg(jsonb_build_object('metodo', mp.nombre, 'es_efectivo', mp.es_efectivo, 'total', t.total) order by mp.orden)
    from (select metodo_id, sum(valor) total from caja_movimientos where sesion_id = p_sesion and tipo = 'venta' group by metodo_id) t
    join metodos_pago mp on mp.id = t.metodo_id), '[]'::jsonb));
  return v;
end $$;

create or replace function movimiento_caja(p_sesion uuid, p_tipo text, p_valor numeric, p_descripcion text, p_metodo uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare s caja_sesiones; v_id uuid; v_val numeric;
begin
  select * into s from caja_sesiones where id = p_sesion;
  if s.estado <> 'abierta' then raise exception 'La caja no está abierta.'; end if;
  if not _puede_ver_sesion(p_sesion) then raise exception 'No tienes acceso a esta caja.' using errcode = '42501'; end if;
  if coalesce(trim(p_descripcion), '') = '' then raise exception 'Describe el movimiento.'; end if;
  if p_tipo = 'ingreso' then perform requerir('caja.movimientos'); v_val := abs(p_valor);
  elsif p_tipo = 'retiro' then perform requerir('caja.movimientos'); v_val := -abs(p_valor);
  elsif p_tipo = 'ajuste' then perform requerir('caja.ajustes'); v_val := p_valor;
  else raise exception 'Tipo de movimiento no permitido.'; end if;
  if v_val = 0 then raise exception 'El valor no puede ser cero.'; end if;
  insert into caja_movimientos (sesion_id, sede_id, tipo, metodo_id, valor, descripcion, usuario_id)
  values (p_sesion, s.sede_id, p_tipo, coalesce(p_metodo, _metodo_efectivo()), v_val, p_descripcion, auth.uid())
  returning id into v_id;
  perform _auditar('movimiento_caja', 'caja_movimientos', v_id::text, s.sede_id, null,
    jsonb_build_object('tipo', p_tipo, 'valor', v_val), p_descripcion);
  return v_id;
end $$;

create or replace function cerrar_caja(p_sesion uuid, p_contado numeric, p_denominaciones jsonb default null, p_obs text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s caja_sesiones; v_res jsonb; v_esp numeric;
begin
  perform requerir('caja.operar');
  select * into s from caja_sesiones where id = p_sesion for update;
  if s.estado <> 'abierta' then raise exception 'Esta caja ya está cerrada.'; end if;
  if not _puede_ver_sesion(p_sesion) then raise exception 'No tienes acceso a esta caja.' using errcode = '42501'; end if;
  if p_contado is null or p_contado < 0 then raise exception 'Registra el dinero contado.'; end if;
  v_res := resumen_caja(p_sesion);
  v_esp := (v_res->>'saldo_esperado')::numeric;
  update caja_sesiones set estado = 'cerrada', cerrada_en = now(), cerrada_por = auth.uid(), resumen = v_res,
         saldo_esperado = v_esp, saldo_contado = p_contado, diferencia = p_contado - v_esp,
         denominaciones_cierre = p_denominaciones, observaciones_cierre = p_obs
  where id = p_sesion;
  perform _auditar('cierre_caja', 'caja_sesiones', p_sesion::text, s.sede_id, null,
    jsonb_build_object('esperado', v_esp, 'contado', p_contado, 'diferencia', p_contado - v_esp));
  return v_res || jsonb_build_object('saldo_contado', p_contado, 'diferencia', p_contado - v_esp);
end $$;

create or replace function corregir_cierre_caja(p_sesion uuid, p_contado numeric, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare s caja_sesiones;
begin
  perform requerir('caja.ajustes');
  select * into s from caja_sesiones where id = p_sesion;
  perform requerir_sede(s.sede_id);
  if s.estado <> 'cerrada' then raise exception 'La caja no está cerrada.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo de la corrección.'; end if;
  perform _autorizar(true);
  update caja_sesiones set saldo_contado = p_contado, diferencia = p_contado - saldo_esperado,
         observaciones_cierre = coalesce(observaciones_cierre || E'\n', '') || 'Corrección: ' || p_motivo
  where id = p_sesion;
  perform _autorizar(false);
  perform _auditar('correccion_cierre_caja', 'caja_sesiones', p_sesion::text, s.sede_id,
    jsonb_build_object('saldo_contado', s.saldo_contado, 'diferencia', s.diferencia),
    jsonb_build_object('saldo_contado', p_contado, 'diferencia', p_contado - s.saldo_esperado), p_motivo);
end $$;

-- ---------------------------------------------------------------------
-- GASTOS / SALIDAS DE DINERO
-- ---------------------------------------------------------------------
create or replace function _registrar_gasto(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_sede uuid := (p->>'sede_id')::uuid; v_val numeric := (p->>'valor')::numeric; v_origen text := coalesce(p->>'origen', 'caja');
        v_ses uuid; v_id uuid; v_num bigint; v_met uuid; v_rec gastos_recurrentes;
begin
  perform requerir_sede(v_sede);
  if coalesce(v_val, 0) <= 0 then raise exception 'El valor debe ser mayor a cero.'; end if;
  if coalesce(trim(p->>'descripcion'), '') = '' then raise exception 'Describe la salida de dinero.'; end if;
  v_met := coalesce(nullif(p->>'metodo_id', '')::uuid, case when v_origen = 'caja' then _metodo_efectivo() end);
  if v_origen = 'caja' then
    v_ses := _sesion_abierta(v_sede);
    if v_ses is null then raise exception 'Para pagar desde caja debes tener tu caja abierta (o registra el gasto como pago desde banco).'; end if;
  end if;
  v_num := siguiente_consecutivo(v_sede, 'gasto');
  insert into gastos (numero, sede_id, fecha, usuario_id, categoria_id, descripcion, valor, metodo_id, origen, caja_sesion_id,
                      beneficiario, proveedor_id, compra_id, recurrente_id, adjunto_url, observaciones, autorizado_por)
  values (v_num, v_sede, coalesce(nullif(p->>'fecha', '')::date, hoy()), auth.uid(), nullif(p->>'categoria_id', '')::uuid,
          p->>'descripcion', v_val, v_met, v_origen, v_ses, p->>'beneficiario', nullif(p->>'proveedor_id', '')::uuid,
          nullif(p->>'compra_id', '')::uuid, nullif(p->>'recurrente_id', '')::uuid, p->>'adjunto_url', p->>'observaciones',
          nullif(p->>'autorizado_por', '')::uuid)
  returning id into v_id;
  if v_origen = 'caja' then
    insert into caja_movimientos (sesion_id, sede_id, tipo, metodo_id, valor, descripcion, referencia_tipo, referencia_id, usuario_id)
    values (v_ses, v_sede, case when p->>'compra_id' is not null then 'pago_proveedor' else 'gasto' end, v_met, -v_val,
            'Salida #' || v_num || ': ' || (p->>'descripcion'), 'gasto', v_id, auth.uid());
  end if;
  if nullif(p->>'recurrente_id', '') is not null then
    select * into v_rec from gastos_recurrentes where id = (p->>'recurrente_id')::uuid;
    update gastos_recurrentes set proxima_fecha = case frecuencia
      when 'semanal' then proxima_fecha + 7 when 'quincenal' then proxima_fecha + 15
      else (proxima_fecha + interval '1 month')::date end
    where id = v_rec.id;
  end if;
  perform _auditar('salida_dinero', 'gastos', v_id::text, v_sede, null,
    jsonb_build_object('numero', v_num, 'valor', v_val, 'origen', v_origen, 'descripcion', p->>'descripcion'));
  return v_id;
end $$;

create or replace function registrar_gasto(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  perform requerir('gastos.registrar');
  if nullif(p->>'compra_id', '') is not null then raise exception 'Los pagos de compras se registran desde el módulo de compras.'; end if;
  return _registrar_gasto(p);
end $$;

create or replace function _recalcular_pago_compra(p_compra uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_pag numeric; v_tot numeric;
begin
  select coalesce(sum(pc.valor), 0) into v_pag from pagos_compra pc join gastos g on g.id = pc.gasto_id
  where pc.compra_id = p_compra and not g.anulado;
  select total into v_tot from compras where id = p_compra;
  update compras set pagado = v_pag,
         estado_pago = case when v_pag <= 0 then 'pendiente' when v_pag >= v_tot - 0.5 then 'pagada' else 'parcial' end
  where id = p_compra;
end $$;

create or replace function anular_gasto(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare g gastos; v_abierta boolean;
begin
  perform requerir('gastos.anular');
  select * into g from gastos where id = p_id for update;
  perform requerir_sede(g.sede_id);
  if g.anulado then raise exception 'La salida ya está anulada.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo de la anulación.'; end if;
  update gastos set anulado = true, motivo_anulacion = p_motivo, anulado_por = auth.uid() where id = p_id;
  if g.caja_sesion_id is not null then
    select estado = 'abierta' into v_abierta from caja_sesiones where id = g.caja_sesion_id;
    if v_abierta then
      insert into caja_movimientos (sesion_id, sede_id, tipo, metodo_id, valor, descripcion, referencia_tipo, referencia_id, usuario_id)
      values (g.caja_sesion_id, g.sede_id, 'ajuste', g.metodo_id, g.valor, 'Anulación salida #' || g.numero, 'gasto', p_id, auth.uid());
    end if;
  end if;
  if g.compra_id is not null then perform _recalcular_pago_compra(g.compra_id); end if;
  perform _auditar('salida_anulada', 'gastos', p_id::text, g.sede_id, to_jsonb(g), null,
    p_motivo || case when g.caja_sesion_id is not null and not coalesce(v_abierta, false) then ' (la caja ya estaba cerrada: sin reintegro automático)' else '' end);
end $$;

-- ---------------------------------------------------------------------
-- COMPRAS
-- ---------------------------------------------------------------------
create or replace function guardar_compra(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_c compras; v_sede uuid := (p->>'sede_id')::uuid; it jsonb;
        v_sub numeric := 0; v_desc numeric := 0; v_imp numeric := 0; v_base numeric; v_ins insumos;
begin
  perform requerir('compras.gestionar');
  perform requerir_sede(v_sede);
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then raise exception 'Agrega al menos un producto a la compra.'; end if;
  if v_id is not null then
    select * into v_c from compras where id = v_id for update;
    if v_c.estado <> 'pendiente' then raise exception 'Solo se pueden editar compras pendientes.'; end if;
    delete from compra_items where compra_id = v_id;
    update compras set sede_id = v_sede, proveedor_id = nullif(p->>'proveedor_id', '')::uuid,
      fecha = coalesce(nullif(p->>'fecha', '')::date, fecha), forma_pago = coalesce(p->>'forma_pago', forma_pago),
      vence = nullif(p->>'vence', '')::date, factura_proveedor = p->>'factura_proveedor', adjunto_url = p->>'adjunto_url',
      observaciones = p->>'observaciones'
    where id = v_id;
  else
    insert into compras (numero, sede_id, proveedor_id, fecha, forma_pago, vence, factura_proveedor, adjunto_url, observaciones, usuario_id)
    values (siguiente_consecutivo(null, 'compra'), v_sede, nullif(p->>'proveedor_id', '')::uuid,
            coalesce(nullif(p->>'fecha', '')::date, hoy()), coalesce(p->>'forma_pago', 'contado'), nullif(p->>'vence', '')::date,
            p->>'factura_proveedor', p->>'adjunto_url', p->>'observaciones', auth.uid())
    returning id into v_id;
  end if;
  for it in select * from jsonb_array_elements(p->'items') loop
    select * into v_ins from insumos where id = (it->>'insumo_id')::uuid;
    if v_ins.id is null then raise exception 'Producto de inventario no encontrado.'; end if;
    perform convertir(1, (it->>'unidad_id')::uuid, v_ins.unidad_id);   -- valida la conversión
    v_base := (it->>'cantidad')::numeric * (it->>'costo_unitario')::numeric - coalesce((it->>'descuento')::numeric, 0);
    insert into compra_items (compra_id, insumo_id, cantidad, unidad_id, costo_unitario, descuento, impuesto_pct, total, vence)
    values (v_id, v_ins.id, (it->>'cantidad')::numeric, (it->>'unidad_id')::uuid, (it->>'costo_unitario')::numeric,
            coalesce((it->>'descuento')::numeric, 0), coalesce((it->>'impuesto_pct')::numeric, 0),
            round(v_base * (1 + coalesce((it->>'impuesto_pct')::numeric, 0) / 100), 2), nullif(it->>'vence', '')::date);
    v_sub := v_sub + (it->>'cantidad')::numeric * (it->>'costo_unitario')::numeric;
    v_desc := v_desc + coalesce((it->>'descuento')::numeric, 0);
    v_imp := v_imp + round(v_base * coalesce((it->>'impuesto_pct')::numeric, 0) / 100, 2);
  end loop;
  update compras set subtotal = v_sub, descuento = v_desc, impuestos = v_imp, total = v_sub - v_desc + v_imp where id = v_id;
  perform _auditar('compra_guardada', 'compras', v_id::text, v_sede, null, jsonb_build_object('total', v_sub - v_desc + v_imp));
  return v_id;
end $$;

create or replace function recibir_compra(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_c compras; it record; v_cant numeric; v_costo numeric;
begin
  if not tiene_permiso('compras.gestionar') then perform requerir('inventario.entradas'); end if;
  select * into v_c from compras where id = p_id for update;
  perform requerir_sede(v_c.sede_id);
  if v_c.estado <> 'pendiente' then raise exception 'La compra ya fue recibida o está cancelada.'; end if;
  for it in select ci.*, i.unidad_id as unidad_insumo from compra_items ci join insumos i on i.id = ci.insumo_id where ci.compra_id = p_id loop
    v_cant := convertir(it.cantidad, it.unidad_id, it.unidad_insumo);
    v_costo := case when v_cant > 0 then it.total / v_cant else 0 end;
    perform _mover_inventario(v_c.sede_id, it.insumo_id, v_cant, 'compra', v_costo, 'Compra #' || v_c.numero, 'compra', p_id);
    update insumos set costo_unitario = round(v_costo, 4), proveedor_id = coalesce(proveedor_id, v_c.proveedor_id) where id = it.insumo_id;
    update inventario set ultima_compra = v_c.fecha where insumo_id = it.insumo_id and sede_id = v_c.sede_id;
    if it.vence is not null then
      insert into lotes (insumo_id, sede_id, cantidad_inicial, cantidad, vence, compra_id)
      values (it.insumo_id, v_c.sede_id, v_cant, v_cant, it.vence, p_id);
    end if;
  end loop;
  update compras set estado = 'recibida', recibida_en = now(), recibida_por = auth.uid() where id = p_id;
  perform _auditar('compra_recibida', 'compras', p_id::text, v_c.sede_id, null, jsonb_build_object('numero', v_c.numero, 'total', v_c.total));
end $$;

create or replace function pagar_compra(p_id uuid, p_valor numeric, p_origen text default 'caja', p_metodo uuid default null,
  p_categoria uuid default null, p_obs text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_c compras; v_gasto uuid; v_cat uuid;
begin
  perform requerir('compras.pagar');
  select * into v_c from compras where id = p_id for update;
  perform requerir_sede(v_c.sede_id);
  if v_c.estado = 'cancelada' then raise exception 'La compra está cancelada.'; end if;
  if coalesce(p_valor, 0) <= 0 or p_valor > v_c.total - v_c.pagado + 0.5 then
    raise exception 'Valor inválido. Saldo pendiente: %.', v_c.total - v_c.pagado;
  end if;
  v_cat := coalesce(p_categoria, (select id from categorias where tipo = 'gasto' and nombre = 'Pago a proveedores'));
  v_gasto := _registrar_gasto(jsonb_build_object('sede_id', v_c.sede_id, 'valor', p_valor, 'origen', p_origen,
    'metodo_id', p_metodo, 'categoria_id', v_cat, 'descripcion', 'Pago compra #' || v_c.numero
      || coalesce(' — ' || (select nombre from proveedores where id = v_c.proveedor_id), ''),
    'proveedor_id', v_c.proveedor_id, 'compra_id', p_id, 'observaciones', p_obs,
    'beneficiario', (select nombre from proveedores where id = v_c.proveedor_id)));
  insert into pagos_compra (compra_id, gasto_id, valor, usuario_id) values (p_id, v_gasto, p_valor, auth.uid());
  perform _autorizar(true);
  perform _recalcular_pago_compra(p_id);
  perform _autorizar(false);
  return v_gasto;
end $$;

create or replace function cancelar_compra(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_c compras;
begin
  perform requerir('compras.gestionar');
  select * into v_c from compras where id = p_id for update;
  perform requerir_sede(v_c.sede_id);
  if v_c.estado <> 'pendiente' then raise exception 'Solo se cancelan compras pendientes (no recibidas).'; end if;
  if v_c.pagado > 0 then raise exception 'La compra tiene pagos: anúlalos primero en salidas de dinero.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo.'; end if;
  update compras set estado = 'cancelada', motivo_cancelacion = p_motivo where id = p_id;
  perform _auditar('compra_cancelada', 'compras', p_id::text, v_c.sede_id, to_jsonb(v_c), null, p_motivo);
end $$;

-- ---------------------------------------------------------------------
-- TRANSFERENCIAS ENTRE SEDES
-- ---------------------------------------------------------------------
create or replace function crear_transferencia(p_origen uuid, p_destino uuid, p_items jsonb, p_obs text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; it jsonb;
begin
  perform requerir('transferencias.solicitar');
  if not (puede_sede(p_origen) or puede_sede(p_destino)) then perform requerir_sede(p_destino); end if;
  if p_origen = p_destino then raise exception 'La sede de origen y destino deben ser diferentes.'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'Agrega productos a la transferencia.'; end if;
  insert into transferencias (numero, sede_origen_id, sede_destino_id, solicitado_por, observaciones)
  values (siguiente_consecutivo(null, 'transferencia'), p_origen, p_destino, auth.uid(), p_obs) returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into transferencia_items (transferencia_id, insumo_id, cantidad_solicitada, costo_unitario)
    values (v_id, (it->>'insumo_id')::uuid, (it->>'cantidad')::numeric,
            coalesce((select costo_promedio from inventario where insumo_id = (it->>'insumo_id')::uuid and sede_id = p_origen),
                     (select costo_unitario from insumos where id = (it->>'insumo_id')::uuid), 0));
  end loop;
  perform _auditar('transferencia_solicitada', 'transferencias', v_id::text, p_origen, null,
    jsonb_build_object('origen', p_origen, 'destino', p_destino));
  return v_id;
end $$;

create or replace function aprobar_transferencia(p_id uuid, p_aprobar boolean, p_obs text default null) returns void
language plpgsql security definer set search_path = public as $$
declare t transferencias;
begin
  perform requerir('transferencias.aprobar');
  select * into t from transferencias where id = p_id for update;
  if t.estado <> 'solicitud' then raise exception 'La transferencia no está en estado de solicitud.'; end if;
  update transferencias set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         aprobado_por = auth.uid(), aprobada_en = now(),
         observaciones = concat_ws(E'\n', observaciones, nullif(p_obs, '')) where id = p_id;
  perform _auditar(case when p_aprobar then 'transferencia_aprobada' else 'transferencia_rechazada' end,
                   'transferencias', p_id::text, t.sede_origen_id, null, null, p_obs);
end $$;

create or replace function despachar_transferencia(p_id uuid, p_items jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare t transferencias; it transferencia_items; v_env numeric; v_costo numeric;
begin
  perform requerir('transferencias.despachar');
  select * into t from transferencias where id = p_id for update;
  perform requerir_sede(t.sede_origen_id);
  if t.estado <> 'aprobada' then raise exception 'Solo se despachan transferencias aprobadas.'; end if;
  for it in select * from transferencia_items where transferencia_id = p_id loop
    v_env := coalesce((select (x->>'cantidad_enviada')::numeric from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
                       where (x->>'id')::uuid = it.id), it.cantidad_solicitada);
    if v_env < 0 then raise exception 'Cantidad enviada inválida.'; end if;
    v_costo := coalesce((select costo_promedio from inventario where insumo_id = it.insumo_id and sede_id = t.sede_origen_id), it.costo_unitario);
    update transferencia_items set cantidad_enviada = v_env, costo_unitario = v_costo where id = it.id;
    perform _mover_inventario(t.sede_origen_id, it.insumo_id, -v_env, 'transferencia_salida', v_costo,
                              'Transferencia #' || t.numero, 'transferencia', p_id);
  end loop;
  update transferencias set estado = 'despachada', despachado_por = auth.uid(), despachada_en = now() where id = p_id;
  perform _auditar('transferencia_despachada', 'transferencias', p_id::text, t.sede_origen_id);
end $$;

create or replace function recibir_transferencia(p_id uuid, p_items jsonb default null, p_obs text default null) returns void
language plpgsql security definer set search_path = public as $$
declare t transferencias; it transferencia_items; v_rec numeric; v_obs text;
begin
  perform requerir('transferencias.recibir');
  select * into t from transferencias where id = p_id for update;
  perform requerir_sede(t.sede_destino_id);
  if t.estado <> 'despachada' then raise exception 'Solo se reciben transferencias despachadas.'; end if;
  for it in select * from transferencia_items where transferencia_id = p_id loop
    select (x->>'cantidad_recibida')::numeric, x->>'observacion' into v_rec, v_obs
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x where (x->>'id')::uuid = it.id;
    v_rec := coalesce(v_rec, it.cantidad_enviada);
    if v_rec < 0 then raise exception 'Cantidad recibida inválida.'; end if;
    update transferencia_items set cantidad_recibida = v_rec, observacion_diferencia = v_obs where id = it.id;
    perform _mover_inventario(t.sede_destino_id, it.insumo_id, v_rec, 'transferencia_entrada', it.costo_unitario,
                              'Transferencia #' || t.numero, 'transferencia', p_id, v_obs);
  end loop;
  update transferencias set estado = 'recibida', recibido_por = auth.uid(), recibida_en = now(),
         observaciones = concat_ws(E'\n', observaciones, nullif(p_obs, '')) where id = p_id;
  perform _auditar('transferencia_recibida', 'transferencias', p_id::text, t.sede_destino_id, null, null, p_obs);
end $$;

create or replace function cancelar_transferencia(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare t transferencias;
begin
  perform requerir('transferencias.solicitar');
  select * into t from transferencias where id = p_id for update;
  if not (puede_sede(t.sede_origen_id) or puede_sede(t.sede_destino_id)) then perform requerir_sede(t.sede_destino_id); end if;
  if t.estado not in ('solicitud','aprobada') then raise exception 'Solo se cancelan transferencias aún no despachadas.'; end if;
  update transferencias set estado = 'cancelada', observaciones = concat_ws(E'\n', observaciones, 'Cancelada: ' || p_motivo) where id = p_id;
  perform _auditar('transferencia_cancelada', 'transferencias', p_id::text, t.sede_origen_id, null, null, p_motivo);
end $$;

-- ---------------------------------------------------------------------
-- INVENTARIO FÍSICO (CONTEOS)
-- ---------------------------------------------------------------------
create or replace function crear_conteo(p_sede uuid, p_categoria uuid default null, p_obs text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform requerir('inventario.conteos');
  perform requerir_sede(p_sede);
  insert into conteos (numero, sede_id, usuario_id, observaciones)
  values (siguiente_consecutivo(p_sede, 'conteo'), p_sede, auth.uid(), p_obs) returning id into v_id;
  insert into conteo_items (conteo_id, insumo_id, cantidad_sistema, costo_unitario)
  select v_id, i.id, coalesce(inv.cantidad, 0), coalesce(nullif(inv.costo_promedio, 0), i.costo_unitario)
  from insumos i left join inventario inv on inv.insumo_id = i.id and inv.sede_id = p_sede
  where i.activo and (p_categoria is null or i.categoria_id = p_categoria);
  return v_id;
end $$;

create or replace function aplicar_conteo(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c conteos; it record; v_actual numeric; v_n int := 0; v_valor numeric := 0;
begin
  perform requerir('inventario.ajustes');
  select * into c from conteos where id = p_id for update;
  perform requerir_sede(c.sede_id);
  if c.estado <> 'borrador' then raise exception 'Este conteo ya fue aplicado o anulado.'; end if;
  for it in select * from conteo_items where conteo_id = p_id and cantidad_contada is not null loop
    select coalesce((select cantidad from inventario where insumo_id = it.insumo_id and sede_id = c.sede_id), 0) into v_actual;
    if it.cantidad_contada <> v_actual then
      perform _mover_inventario(c.sede_id, it.insumo_id, it.cantidad_contada - v_actual, 'conteo_fisico', it.costo_unitario,
                                'Inventario físico #' || c.numero, 'conteo', p_id);
      v_n := v_n + 1;
      v_valor := v_valor + (it.cantidad_contada - v_actual) * it.costo_unitario;
    end if;
  end loop;
  update conteos set estado = 'aplicado', aplicado_por = auth.uid(), aplicado_en = now() where id = p_id;
  perform _auditar('conteo_aplicado', 'conteos', p_id::text, c.sede_id, null,
    jsonb_build_object('ajustes', v_n, 'valor_diferencia', round(v_valor, 2)));
  return jsonb_build_object('ajustes', v_n, 'valor_diferencia', round(v_valor, 2));
end $$;

create or replace function anular_conteo(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c conteos;
begin
  perform requerir('inventario.conteos');
  select * into c from conteos where id = p_id;
  perform requerir_sede(c.sede_id);
  if c.estado <> 'borrador' then raise exception 'Solo se anulan conteos en borrador.'; end if;
  update conteos set estado = 'anulado' where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- SESIÓN, USUARIOS Y ROLES
-- ---------------------------------------------------------------------
create or replace function email_para_login(p_identificador text) returns text
language plpgsql security definer set search_path = public as $$
declare v perfiles;
begin
  if position('@' in coalesce(p_identificador, '')) > 0 then
    select * into v from perfiles where lower(correo) = lower(trim(p_identificador));
    if v.id is null then return lower(trim(p_identificador)); end if;
  else
    select * into v from perfiles where lower(usuario) = lower(trim(p_identificador));
    if v.id is null then return null; end if;
  end if;
  if v.bloqueado_hasta is not null and v.bloqueado_hasta > now() then
    raise exception 'Usuario bloqueado temporalmente por intentos fallidos. Intenta después de las %.',
      to_char(v.bloqueado_hasta at time zone 'America/Bogota', 'HH12:MI AM');
  end if;
  if not v.activo then raise exception 'El usuario está desactivado. Contacta al administrador.'; end if;
  return v.correo;
end $$;

create or replace function registrar_intento_fallido(p_identificador text) returns void
language plpgsql security definer set search_path = public as $$
declare v_max int; v_min int;
begin
  select intentos_bloqueo, minutos_bloqueo into v_max, v_min from config_empresa where id = 1;
  update perfiles set intentos_fallidos = intentos_fallidos + 1,
         bloqueado_hasta = case when intentos_fallidos + 1 >= v_max then now() + make_interval(mins => v_min) else bloqueado_hasta end
  where lower(usuario) = lower(trim(p_identificador)) or lower(correo) = lower(trim(p_identificador));
  update perfiles set intentos_fallidos = 0
  where (lower(usuario) = lower(trim(p_identificador)) or lower(correo) = lower(trim(p_identificador)))
    and intentos_fallidos >= v_max;
end $$;

create or replace function mi_sesion() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', pf.id, 'nombre', pf.nombre, 'usuario', pf.usuario, 'correo', pf.correo, 'activo', pf.activo,
    'rol', r.nombre, 'todas_las_sedes', coalesce(r.todas_las_sedes, false), 'sede_principal_id', pf.sede_principal_id,
    'superadmin', es_superadmin(),
    'permisos', coalesce((select jsonb_agg(p.codigo) from permisos p where tiene_permiso(p.codigo)), '[]'::jsonb),
    'sedes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'codigo', s.codigo) order by s.nombre)
                       from sedes s where s.activa and puede_sede(s.id)), '[]'::jsonb)
  )
  from perfiles pf left join roles r on r.id = pf.rol_id
  where pf.id = auth.uid();
$$;

create or replace function registrar_inicio_sesion() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v perfiles;
begin
  select * into v from perfiles where id = auth.uid();
  if v.id is null then raise exception 'Tu cuenta no tiene un perfil asignado. Contacta al administrador.'; end if;
  if not v.activo then raise exception 'Tu usuario está desactivado.'; end if;
  if v.bloqueado_hasta is not null and v.bloqueado_hasta > now() then raise exception 'Usuario bloqueado temporalmente.'; end if;
  update perfiles set ultimo_inicio = now(), intentos_fallidos = 0, bloqueado_hasta = null where id = v.id;
  perform _auditar('inicio_sesion', 'perfiles', v.id::text, v.sede_principal_id);
  return mi_sesion();
end $$;

create or replace function registrar_cierre_sesion() returns void
language sql security definer set search_path = public as $$
  select _auditar('cierre_sesion', 'perfiles', auth.uid()::text, null);
$$;

create or replace function registrar_error(p_ruta text, p_mensaje text, p_detalle jsonb default null) returns void
language sql security definer set search_path = public as $$
  insert into registro_errores (usuario_id, ruta, mensaje, detalle) values (auth.uid(), left(p_ruta, 300), left(p_mensaje, 2000), p_detalle);
$$;

create or replace function _validar_gestion_usuario(p_rol uuid, p_sedes uuid[], p_objetivo uuid default null) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_r roles; s uuid;
begin
  perform requerir('usuarios.gestionar');
  if es_superadmin() then return; end if;
  select * into v_r from roles where id = p_rol;
  if v_r.todas_las_sedes or exists (select 1 from rol_permisos where rol_id = p_rol and permiso in ('*','roles.gestionar','sedes.gestionar','configuracion.gestionar')) then
    raise exception 'Solo el administrador general puede asignar este rol.' using errcode = '42501';
  end if;
  if p_objetivo is not null and exists (select 1 from perfiles pf join rol_permisos rp on rp.rol_id = pf.rol_id
                                        where pf.id = p_objetivo and rp.permiso = '*') then
    raise exception 'No puedes modificar al administrador general.' using errcode = '42501';
  end if;
  foreach s in array coalesce(p_sedes, '{}') loop
    if not puede_sede(s) then raise exception 'No puedes asignar sedes a las que no tienes acceso.' using errcode = '42501'; end if;
  end loop;
end $$;

create or replace function validar_gestion_usuario(p_rol uuid, p_sedes uuid[]) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  perform _validar_gestion_usuario(p_rol, p_sedes, null);
  return true;
end $$;

create or replace function puede_gestionar_usuario(p_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v perfiles;
begin
  select * into v from perfiles where id = p_id;
  if v.id is null then raise exception 'Usuario no encontrado.'; end if;
  perform _validar_gestion_usuario(v.rol_id, array(select sede_id from usuario_sedes where usuario_id = p_id), p_id);
  return true;
end $$;

create or replace function crear_perfil_usuario(p_id uuid, p_nombre text, p_usuario text, p_correo text, p_telefono text,
  p_rol uuid, p_sedes uuid[], p_sede_principal uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _validar_gestion_usuario(p_rol, p_sedes, null);
  if not exists (select 1 from auth.users where id = p_id) then raise exception 'Usuario de autenticación no encontrado.'; end if;
  insert into perfiles (id, nombre, usuario, correo, telefono, rol_id, sede_principal_id)
  values (p_id, p_nombre, lower(nullif(trim(p_usuario), '')), lower(p_correo), p_telefono, p_rol,
          coalesce(p_sede_principal, p_sedes[1]));
  insert into usuario_sedes (usuario_id, sede_id) select p_id, unnest(coalesce(p_sedes, '{}'));
end $$;

create or replace function actualizar_usuario(p_id uuid, p_nombre text, p_usuario text, p_telefono text, p_rol uuid,
  p_sedes uuid[], p_activo boolean, p_sede_principal uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _validar_gestion_usuario(p_rol, p_sedes, p_id);
  if p_id = auth.uid() and not p_activo then raise exception 'No puedes desactivar tu propio usuario.'; end if;
  if p_id = auth.uid() and p_rol is distinct from (select rol_id from perfiles where id = p_id) and es_superadmin() then
    raise exception 'No puedes cambiar tu propio rol de administrador general.';
  end if;
  update perfiles set nombre = p_nombre, usuario = lower(nullif(trim(p_usuario), '')), telefono = p_telefono, rol_id = p_rol,
         activo = p_activo, sede_principal_id = coalesce(p_sede_principal, p_sedes[1]),
         bloqueado_hasta = case when p_activo then null else bloqueado_hasta end
  where id = p_id;
  delete from usuario_sedes where usuario_id = p_id and sede_id <> all (coalesce(p_sedes, '{}'));
  insert into usuario_sedes (usuario_id, sede_id) select p_id, unnest(coalesce(p_sedes, '{}')) on conflict do nothing;
end $$;

create or replace function asignar_permisos_usuario(p_id uuid, p_permisos jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k text; v jsonb;
begin
  perform requerir('roles.gestionar');
  delete from usuario_permisos where usuario_id = p_id;
  for k, v in select * from jsonb_each(coalesce(p_permisos, '{}'::jsonb)) loop
    if jsonb_typeof(v) = 'boolean' then
      insert into usuario_permisos (usuario_id, permiso, concedido) values (p_id, k, v::text::boolean);
    end if;
  end loop;
end $$;

create or replace function guardar_rol(p_id uuid, p_nombre text, p_descripcion text, p_todas boolean, p_permisos text[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id;
begin
  perform requerir('roles.gestionar');
  if v_id is not null and exists (select 1 from rol_permisos where rol_id = v_id and permiso = '*') then
    raise exception 'El rol de administrador general no se puede modificar.';
  end if;
  if '*' = any (coalesce(p_permisos, '{}')) and not es_superadmin() then raise exception 'No permitido.'; end if;
  if v_id is null then
    insert into roles (nombre, descripcion, todas_las_sedes) values (p_nombre, p_descripcion, coalesce(p_todas, false)) returning id into v_id;
  else
    update roles set nombre = p_nombre, descripcion = p_descripcion, todas_las_sedes = coalesce(p_todas, false) where id = v_id;
    delete from rol_permisos where rol_id = v_id and permiso <> all (coalesce(p_permisos, '{}'));
  end if;
  insert into rol_permisos (rol_id, permiso) select v_id, unnest(coalesce(p_permisos, '{}')) on conflict do nothing;
  return v_id;
end $$;

-- El primer usuario que se registre en Supabase queda como Administrador general
create or replace function fn_nuevo_usuario_auth() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sede uuid;
begin
  if not exists (select 1 from perfiles) then
    select id into v_sede from sedes order by creado_en limit 1;
    insert into perfiles (id, nombre, usuario, correo, rol_id, sede_principal_id)
    values (NEW.id, coalesce(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
            lower(split_part(NEW.email, '@', 1)), lower(NEW.email),
            (select id from roles where nombre = 'Administrador general'), v_sede);
  end if;
  return NEW;
end $$;
create trigger nuevo_usuario_auth after insert on auth.users for each row execute function fn_nuevo_usuario_auth();

-- ---------------------------------------------------------------------
-- DATOS DE DEMOSTRACIÓN
-- ---------------------------------------------------------------------
create or replace function eliminar_datos_demo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prod int := 0; v_ins int := 0; v_desact int := 0;
begin
  perform requerir('datos_demo.eliminar');
  delete from receta_items where receta_id in (select id from recetas where es_demo);
  delete from recetas r where r.es_demo and not exists (select 1 from producciones p where p.receta_id = r.id);
  update recetas set activa = false where es_demo;
  delete from producto_sedes where producto_id in (select id from productos where es_demo);
  with d as (delete from productos p where p.es_demo and not exists (select 1 from pedido_items pi where pi.producto_id = p.id) returning 1)
  select count(*) into v_prod from d;
  update productos set activo = false where es_demo;
  get diagnostics v_desact = row_count;
  delete from inventario inv using insumos i where i.id = inv.insumo_id and i.es_demo
    and not exists (select 1 from movimientos_inventario m where m.insumo_id = i.id);
  with d as (delete from insumos i where i.es_demo
               and not exists (select 1 from movimientos_inventario m where m.insumo_id = i.id)
               and not exists (select 1 from receta_items ri where ri.insumo_id = i.id)
               and not exists (select 1 from compra_items ci where ci.insumo_id = i.id)
               and not exists (select 1 from conteo_items ct where ct.insumo_id = i.id)
               and not exists (select 1 from transferencia_items ti where ti.insumo_id = i.id)
               and not exists (select 1 from lotes lo where lo.insumo_id = i.id)
               and not exists (select 1 from recetas re where re.insumo_resultado_id = i.id)
               and not exists (select 1 from productos p where p.insumo_id = i.id) returning 1)
  select count(*) into v_ins from d;
  update insumos set activo = false where es_demo;
  delete from proveedores pr where pr.es_demo and not exists (select 1 from compras c where c.proveedor_id = pr.id)
    and not exists (select 1 from insumos i where i.proveedor_id = pr.id);
  delete from clientes c where c.es_demo and not exists (select 1 from pedidos p where p.cliente_id = c.id);
  perform _auditar('datos_demo_eliminados', null, null, null, null,
    jsonb_build_object('productos_eliminados', v_prod, 'insumos_eliminados', v_ins, 'desactivados_con_historial', v_desact));
  return jsonb_build_object('productos_eliminados', v_prod, 'insumos_eliminados', v_ins, 'desactivados_con_historial', v_desact);
end $$;

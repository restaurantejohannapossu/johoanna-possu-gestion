-- =====================================================================
-- 004 · Dashboard, reportes y analítica
-- Ventas = pedidos pagados (no anulados), neto de devoluciones,
-- fechados por la hora de cierre en Colombia (America/Bogota).
-- =====================================================================

create or replace function _rango_ini(d date) returns timestamptz language sql immutable as
$$ select d::timestamp at time zone 'America/Bogota' $$;
create or replace function _rango_fin(d date) returns timestamptz language sql immutable as
$$ select (d + 1)::timestamp at time zone 'America/Bogota' $$;

create or replace function _sede_ok(p_fila uuid, p_filtro uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select case when p_filtro is null then puede_sede(p_fila) else p_fila = p_filtro end $$;

create or replace function _ventas(p_desde date, p_hasta date, p_sede uuid, p_usuario uuid default null)
returns table (id uuid, sede_id uuid, usuario_id uuid, tipo_servicio text, total numeric, dia date, cerrado_en timestamptz, costo numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.sede_id, p.usuario_id, p.tipo_servicio, p.total - p.devuelto,
         (p.cerrado_en at time zone 'America/Bogota')::date, p.cerrado_en,
         coalesce((select sum(pi.costo_unitario * pi.cantidad) from pedido_items pi where pi.pedido_id = p.id and pi.estado = 'activo'), 0)
  from pedidos p
  where p.estado_pago = 'pagado'
    and p.cerrado_en >= _rango_ini(p_desde) and p.cerrado_en < _rango_fin(p_hasta)
    and _sede_ok(p.sede_id, p_sede)
    and (p_usuario is null or p.usuario_id = p_usuario);
$$;

create or replace function _items(p_desde date, p_hasta date, p_sede uuid, p_usuario uuid default null)
returns table (pedido_id uuid, sede_id uuid, producto_id uuid, nombre text, categoria text, cantidad numeric, total numeric, costo numeric, dia date)
language sql stable security definer set search_path = public as $$
  select v.id, v.sede_id, pi.producto_id, pi.nombre, coalesce(c.nombre, 'Sin categoría'), pi.cantidad, pi.total,
         pi.costo_unitario * pi.cantidad, v.dia
  from _ventas(p_desde, p_hasta, p_sede, p_usuario) v
  join pedido_items pi on pi.pedido_id = v.id and pi.estado = 'activo'
  left join productos pr on pr.id = pi.producto_id
  left join categorias c on c.id = pr.categoria_id;
$$;

create or replace function _gastos(p_desde date, p_hasta date, p_sede uuid, p_usuario uuid default null)
returns setof gastos language sql stable security definer set search_path = public as $$
  select g.* from gastos g
  where not g.anulado and g.fecha between p_desde and p_hasta and _sede_ok(g.sede_id, p_sede)
    and (p_usuario is null or g.usuario_id = p_usuario);
$$;

-- ---------------------------------------------------------------------
-- DASHBOARD
-- ---------------------------------------------------------------------
create or replace function dashboard(p_desde date, p_hasta date, p_sede uuid default null, p_usuario uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb := '{}'::jsonb; v_hoy date := hoy(); v_dias int := (p_hasta - p_desde) + 1;
  v_dias_venc int := coalesce((select (inventario->>'dias_alerta_vencimiento')::int from config_empresa where id = 1), 5);
  v_fin boolean := tiene_permiso('reportes.financieros');
begin
  perform requerir('dashboard.ver');
  if p_sede is not null then perform requerir_sede(p_sede); end if;

  v := v || (select jsonb_build_object(
      'ventas', coalesce(sum(total), 0), 'pedidos', count(*),
      'ticket_promedio', coalesce(round(avg(total)), 0),
      'costo', case when v_fin then coalesce(round(sum(costo)), 0) end)
    from _ventas(p_desde, p_hasta, p_sede, p_usuario));
  v := v || jsonb_build_object('gastos', (select coalesce(sum(valor), 0) from _gastos(p_desde, p_hasta, p_sede, p_usuario)),
                               'gastos_operativos', (select coalesce(sum(valor), 0) from _gastos(p_desde, p_hasta, p_sede, p_usuario) where compra_id is null));
  if v_fin then
    -- Ganancia = ventas − costo de ingredientes − gastos operativos (los pagos a proveedores ya están en el costo)
    v := v || jsonb_build_object('ganancia_estimada', (v->>'ventas')::numeric - (v->>'costo')::numeric - (v->>'gastos_operativos')::numeric);
  end if;
  v := v || jsonb_build_object(
    'ventas_hoy', (select coalesce(sum(total), 0) from _ventas(v_hoy, v_hoy, p_sede, p_usuario)),
    'pedidos_hoy', (select count(*) from _ventas(v_hoy, v_hoy, p_sede, p_usuario)),
    'gastos_hoy', (select coalesce(sum(valor), 0) from _gastos(v_hoy, v_hoy, p_sede, p_usuario)),
    'ventas_mes', (select coalesce(sum(total), 0) from _ventas(date_trunc('month', v_hoy)::date, v_hoy, p_sede, p_usuario)));

  v := v || jsonb_build_object('por_sede', coalesce((
    select jsonb_agg(jsonb_build_object('sede', s.nombre, 'ventas', x.ventas, 'pedidos', x.pedidos) order by x.ventas desc)
    from (select sede_id, sum(total) ventas, count(*) pedidos from _ventas(p_desde, p_hasta, p_sede, p_usuario) group by sede_id) x
    join sedes s on s.id = x.sede_id), '[]'::jsonb));

  v := v || jsonb_build_object('por_metodo', coalesce((
    select jsonb_agg(jsonb_build_object('metodo', mp.nombre, 'total', x.total) order by x.total desc)
    from (select pg.metodo_id, sum(pg.valor) total from pagos pg join _ventas(p_desde, p_hasta, p_sede, p_usuario) vv on vv.id = pg.pedido_id
          group by pg.metodo_id) x join metodos_pago mp on mp.id = x.metodo_id), '[]'::jsonb));

  v := v || jsonb_build_object('top_productos', coalesce((
    select jsonb_agg(to_jsonb(t)) from (
      select nombre as producto, sum(cantidad) cantidad, sum(total) ventas from _items(p_desde, p_hasta, p_sede, p_usuario)
      group by nombre order by sum(cantidad) desc limit 8) t), '[]'::jsonb));

  v := v || jsonb_build_object('serie', coalesce((
    select jsonb_agg(jsonb_build_object('dia', d::date, 'ventas', coalesce(a.t, 0), 'anterior', coalesce(b.t, 0)) order by d)
    from generate_series(p_desde, p_hasta, interval '1 day') d
    left join (select dia, sum(total) t from _ventas(p_desde, p_hasta, p_sede, p_usuario) group by dia) a on a.dia = d::date
    left join (select dia + v_dias as dia, sum(total) t from _ventas(p_desde - v_dias, p_desde - 1, p_sede, p_usuario) group by dia) b on b.dia = d::date
  ), '[]'::jsonb));
  v := v || jsonb_build_object('ventas_periodo_anterior',
    (select coalesce(sum(total), 0) from _ventas(p_desde - v_dias, p_desde - 1, p_sede, p_usuario)));

  v := v || jsonb_build_object('caja_actual', (
    select coalesce(sum(s.saldo_inicial + coalesce((select sum(m.valor) from caja_movimientos m left join metodos_pago mp on mp.id = m.metodo_id
                                                     where m.sesion_id = s.id and coalesce(mp.es_efectivo, true)), 0)), 0)
    from caja_sesiones s where s.estado = 'abierta' and _sede_ok(s.sede_id, p_sede)
      and (s.usuario_id = auth.uid() or tiene_permiso('caja.ver_todas'))),
    'cajas_abiertas', (select count(*) from caja_sesiones s where s.estado = 'abierta' and _sede_ok(s.sede_id, p_sede)));

  if tiene_permiso('inventario.ver') or tiene_permiso('reportes.inventario') then
    v := v || jsonb_build_object(
      'inventario_valorizado', (select coalesce(round(sum(cantidad * costo_promedio)), 0) from inventario where cantidad > 0 and _sede_ok(sede_id, p_sede)),
      'inventario_bajo', coalesce((select jsonb_agg(to_jsonb(t)) from (
          select i.nombre as insumo, s.nombre as sede, round(inv.cantidad, 2) as cantidad, coalesce(inv.minimo, i.minimo) as minimo, u.abreviatura as unidad
          from inventario inv join insumos i on i.id = inv.insumo_id join sedes s on s.id = inv.sede_id join unidades u on u.id = i.unidad_id
          where i.activo and inv.cantidad > 0 and inv.cantidad <= coalesce(inv.minimo, i.minimo) and _sede_ok(inv.sede_id, p_sede)
          order by inv.cantidad / nullif(coalesce(inv.minimo, i.minimo), 0) limit 10) t), '[]'::jsonb),
      'inventario_bajo_total', (select count(*) from inventario inv join insumos i on i.id = inv.insumo_id
          where i.activo and inv.cantidad > 0 and inv.cantidad <= coalesce(inv.minimo, i.minimo) and _sede_ok(inv.sede_id, p_sede)),
      'agotados', coalesce((select jsonb_agg(to_jsonb(t)) from (
          select i.nombre as insumo, s.nombre as sede from inventario inv join insumos i on i.id = inv.insumo_id join sedes s on s.id = inv.sede_id
          where i.activo and inv.cantidad <= 0 and _sede_ok(inv.sede_id, p_sede) order by i.nombre limit 10) t), '[]'::jsonb),
      'agotados_total', (select count(*) from inventario inv join insumos i on i.id = inv.insumo_id
          where i.activo and inv.cantidad <= 0 and _sede_ok(inv.sede_id, p_sede)),
      'vencimientos', coalesce((select jsonb_agg(to_jsonb(t)) from (
          select i.nombre as insumo, s.nombre as sede, round(l.cantidad, 2) as cantidad, l.vence, (l.vence - v_hoy) as dias
          from lotes l join insumos i on i.id = l.insumo_id join sedes s on s.id = l.sede_id
          where l.cantidad > 0 and l.vence is not null and l.vence <= v_hoy + v_dias_venc and _sede_ok(l.sede_id, p_sede)
          order by l.vence limit 10) t), '[]'::jsonb));
  end if;

  v := v || jsonb_build_object(
    'productos_agotados_menu', (select count(*) from producto_sedes ps join productos p on p.id = ps.producto_id
                                where p.activo and ps.agotado and _sede_ok(ps.sede_id, p_sede)),
    'cuentas_abiertas', (select jsonb_build_object('cantidad', count(*), 'valor', coalesce(sum(total - pagado), 0))
                         from pedidos where estado <> 'cancelado' and estado_pago in ('abierto','parcial') and _sede_ok(sede_id, p_sede)));
  if tiene_permiso('compras.ver') then
    v := v || jsonb_build_object('cuentas_por_pagar', (select jsonb_build_object('cantidad', count(*), 'valor', coalesce(sum(total - pagado), 0))
      from compras where estado <> 'cancelada' and estado_pago <> 'pagada' and _sede_ok(sede_id, p_sede)));
  end if;
  if tiene_permiso('auditoria.ver') then
    v := v || jsonb_build_object('actividad', coalesce((select jsonb_agg(to_jsonb(t)) from (
      select fecha, usuario_nombre, accion, tabla, detalle from auditoria
      where (p_sede is null and (sede_id is null or puede_sede(sede_id))) or sede_id = p_sede
      order by fecha desc limit 10) t), '[]'::jsonb));
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- REPORTES
-- ---------------------------------------------------------------------
create or replace function reporte(p_tipo text, p_desde date, p_hasta date, p_sede uuid default null, p_agrupar text default 'dia')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_trunc text := case p_agrupar when 'semana' then 'week' when 'mes' then 'month' when 'anio' then 'year' else 'day' end;
        v_hoy date := hoy();
begin
  if p_sede is not null then perform requerir_sede(p_sede); end if;
  if p_tipo like 'ventas_%' or p_tipo in ('productos_mas_vendidos','productos_menos_vendidos','productos_baja_rotacion') then
    perform requerir('reportes.ventas');
  elsif p_tipo like 'inventario_%' then perform requerir('reportes.inventario');
  elsif p_tipo like 'gastos_%' then perform requerir('reportes.gastos');
  else perform requerir('reportes.financieros');
  end if;

  case p_tipo
  -- ======================= VENTAS =======================
  when 'ventas_periodo' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select to_char(date_trunc(v_trunc, dia), case v_trunc when 'month' then 'YYYY-MM' when 'year' then 'YYYY' else 'YYYY-MM-DD' end) as periodo,
             count(*) as pedidos, sum(total) as ventas, round(avg(total)) as ticket_promedio
      from _ventas(p_desde, p_hasta, p_sede) group by 1 order by 1) t;
  when 'ventas_sede' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select s.nombre as sede, count(*) as pedidos, sum(x.total) as ventas, round(avg(x.total)) as ticket_promedio
      from _ventas(p_desde, p_hasta, p_sede) x join sedes s on s.id = x.sede_id group by s.nombre order by 3 desc) t;
  when 'ventas_usuario' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select coalesce(pf.nombre, '—') as usuario, count(*) as pedidos, sum(x.total) as ventas, round(avg(x.total)) as ticket_promedio
      from _ventas(p_desde, p_hasta, p_sede) x left join perfiles pf on pf.id = x.usuario_id group by 1 order by 3 desc) t;
  when 'ventas_producto' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select nombre as producto, categoria, sum(cantidad) as cantidad, sum(total) as ventas
      from _items(p_desde, p_hasta, p_sede) group by nombre, categoria order by 4 desc) t;
  when 'ventas_categoria' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select categoria, sum(cantidad) as cantidad, sum(total) as ventas from _items(p_desde, p_hasta, p_sede) group by categoria order by 3 desc) t;
  when 'ventas_metodo' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select mp.nombre as metodo, count(distinct pg.pedido_id) as pedidos, sum(pg.valor) as total
      from pagos pg join _ventas(p_desde, p_hasta, p_sede) x on x.id = pg.pedido_id join metodos_pago mp on mp.id = pg.metodo_id
      group by mp.nombre order by 3 desc) t;
  when 'ventas_servicio' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select tipo_servicio as servicio, count(*) as pedidos, sum(total) as ventas from _ventas(p_desde, p_hasta, p_sede) group by 1 order by 3 desc) t;
  when 'ventas_hora' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select lpad(extract(hour from cerrado_en at time zone 'America/Bogota')::text, 2, '0') || ':00' as hora,
             count(*) as pedidos, sum(total) as ventas from _ventas(p_desde, p_hasta, p_sede) group by 1 order by 1) t;
  when 'ventas_dia_semana' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select (array['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'])[extract(dow from dia)::int + 1] as dia_semana,
             count(*) as pedidos, sum(total) as ventas, round(avg(total)) as ticket_promedio
      from _ventas(p_desde, p_hasta, p_sede) group by extract(dow from dia), 1 order by extract(dow from dia)) t;
  when 'ventas_detalle' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select p.numero, p.comprobante_numero as comprobante, to_char(x.cerrado_en at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI') as fecha,
             s.nombre as sede, coalesce(pf.nombre, '—') as usuario, x.tipo_servicio as servicio, x.total
      from _ventas(p_desde, p_hasta, p_sede) x join pedidos p on p.id = x.id join sedes s on s.id = x.sede_id
      left join perfiles pf on pf.id = x.usuario_id order by x.cerrado_en) t;

  -- ======================= PRODUCTOS =======================
  when 'productos_mas_vendidos' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select nombre as producto, sum(cantidad) as cantidad, sum(total) as ventas from _items(p_desde, p_hasta, p_sede)
      group by nombre order by 2 desc limit 30) t;
  when 'productos_menos_vendidos', 'productos_baja_rotacion' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select p.nombre as producto, coalesce(c.nombre, 'Sin categoría') as categoria, coalesce(sum(i.cantidad), 0) as cantidad, coalesce(sum(i.total), 0) as ventas
      from productos p left join categorias c on c.id = p.categoria_id
      left join _items(p_desde, p_hasta, p_sede) i on i.producto_id = p.id
      where p.activo group by p.nombre, c.nombre order by 3 asc, 1 limit 30) t;
  when 'productos_rentables' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select nombre as producto, sum(cantidad) as cantidad, sum(total) as ventas, round(sum(costo)) as costo,
             round(sum(total) - sum(costo)) as margen,
             case when sum(total) > 0 then round((sum(total) - sum(costo)) / sum(total) * 100, 1) end as margen_pct
      from _items(p_desde, p_hasta, p_sede) group by nombre order by 5 desc) t;
  when 'productos_consumo' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select nombre as producto, sum(cantidad) as cantidad, round(sum(costo)) as costo_ingredientes,
             round(sum(costo) / nullif(sum(cantidad), 0)) as costo_unitario
      from _items(p_desde, p_hasta, p_sede) group by nombre order by 3 desc) t;
  when 'productos_margen_menu' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select p.codigo, p.nombre as producto, p.precio, costo_producto(p.id) as costo,
             p.precio - costo_producto(p.id) as margen,
             case when p.precio > 0 then round((p.precio - costo_producto(p.id)) / p.precio * 100, 1) end as margen_pct
      from productos p where p.activo order by 6 nulls last) t;

  -- ======================= INVENTARIO =======================
  when 'inventario_actual' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select s.nombre as sede, i.codigo, i.nombre as insumo, coalesce(c.nombre, '') as categoria, u.abreviatura as unidad,
             round(inv.cantidad, 3) as cantidad, coalesce(inv.minimo, i.minimo) as minimo, round(inv.costo_promedio, 2) as costo_promedio,
             round(inv.cantidad * inv.costo_promedio) as valor_total, inv.ultima_compra
      from inventario inv join insumos i on i.id = inv.insumo_id join sedes s on s.id = inv.sede_id join unidades u on u.id = i.unidad_id
      left join categorias c on c.id = i.categoria_id where i.activo and _sede_ok(inv.sede_id, p_sede) order by s.nombre, i.nombre) t;
  when 'inventario_valorizado' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select s.nombre as sede, coalesce(c.nombre, 'Sin categoría') as categoria, count(*) as items,
             round(sum(greatest(inv.cantidad, 0) * inv.costo_promedio)) as valor_total
      from inventario inv join insumos i on i.id = inv.insumo_id join sedes s on s.id = inv.sede_id
      left join categorias c on c.id = i.categoria_id where i.activo and _sede_ok(inv.sede_id, p_sede)
      group by s.nombre, c.nombre order by 1, 4 desc) t;
  when 'inventario_minimo' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select s.nombre as sede, i.nombre as insumo, u.abreviatura as unidad, round(inv.cantidad, 3) as cantidad,
             coalesce(inv.minimo, i.minimo) as minimo, i.maximo
      from inventario inv join insumos i on i.id = inv.insumo_id join sedes s on s.id = inv.sede_id join unidades u on u.id = i.unidad_id
      where i.activo and inv.cantidad > 0 and inv.cantidad <= coalesce(inv.minimo, i.minimo) and _sede_ok(inv.sede_id, p_sede) order by 1, 2) t;
  when 'inventario_agotados' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select s.nombre as sede, i.nombre as insumo, u.abreviatura as unidad, round(inv.cantidad, 3) as cantidad, inv.ultima_compra
      from inventario inv join insumos i on i.id = inv.insumo_id join sedes s on s.id = inv.sede_id join unidades u on u.id = i.unidad_id
      where i.activo and inv.cantidad <= 0 and _sede_ok(inv.sede_id, p_sede) order by 1, 2) t;
  when 'inventario_por_vencer', 'inventario_vencidos' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select s.nombre as sede, i.nombre as insumo, round(l.cantidad, 3) as cantidad, u.abreviatura as unidad, l.vence, l.vence - v_hoy as dias
      from lotes l join insumos i on i.id = l.insumo_id join sedes s on s.id = l.sede_id join unidades u on u.id = i.unidad_id
      where l.cantidad > 0 and l.vence is not null and _sede_ok(l.sede_id, p_sede)
        and case when p_tipo = 'inventario_vencidos' then l.vence < v_hoy else l.vence between v_hoy and v_hoy + 15 end
      order by l.vence) t;
  when 'inventario_movimientos', 'inventario_ajustes', 'inventario_desperdicios', 'inventario_transferencias' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select to_char(m.fecha at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI') as fecha, s.nombre as sede, i.nombre as insumo,
             m.tipo, round(m.cantidad, 3) as cantidad, u.abreviatura as unidad, round(m.cantidad * m.costo_unitario) as valor,
             round(m.saldo, 3) as saldo, coalesce(pf.nombre, '—') as usuario, m.motivo
      from movimientos_inventario m join insumos i on i.id = m.insumo_id join sedes s on s.id = m.sede_id join unidades u on u.id = i.unidad_id
      left join perfiles pf on pf.id = m.usuario_id
      where m.fecha >= _rango_ini(p_desde) and m.fecha < _rango_fin(p_hasta) and _sede_ok(m.sede_id, p_sede)
        and case p_tipo
          when 'inventario_ajustes' then m.tipo in ('ajuste','conteo_fisico')
          when 'inventario_desperdicios' then m.tipo in ('desperdicio','vencimiento','consumo_interno')
          when 'inventario_transferencias' then m.tipo in ('transferencia_salida','transferencia_entrada')
          else true end
      order by m.fecha desc limit 5000) t;
  when 'inventario_diferencias' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select c.numero as conteo, to_char(c.aplicado_en at time zone 'America/Bogota', 'YYYY-MM-DD') as fecha, s.nombre as sede,
             i.nombre as insumo, ci.cantidad_sistema as sistema, ci.cantidad_contada as contado,
             ci.cantidad_contada - ci.cantidad_sistema as diferencia, round((ci.cantidad_contada - ci.cantidad_sistema) * ci.costo_unitario) as valor
      from conteo_items ci join conteos c on c.id = ci.conteo_id join insumos i on i.id = ci.insumo_id join sedes s on s.id = c.sede_id
      where c.estado = 'aplicado' and ci.cantidad_contada is not null and ci.cantidad_contada <> ci.cantidad_sistema
        and c.aplicado_en >= _rango_ini(p_desde) and c.aplicado_en < _rango_fin(p_hasta) and _sede_ok(c.sede_id, p_sede)
      order by c.aplicado_en desc) t;
  when 'inventario_consumo' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select i.nombre as insumo, u.abreviatura as unidad, round(-sum(m.cantidad), 3) as consumido, round(-sum(m.cantidad * m.costo_unitario)) as valor
      from movimientos_inventario m join insumos i on i.id = m.insumo_id join unidades u on u.id = i.unidad_id
      where m.tipo in ('venta','produccion_consumo') and m.fecha >= _rango_ini(p_desde) and m.fecha < _rango_fin(p_hasta)
        and _sede_ok(m.sede_id, p_sede)
      group by i.nombre, u.abreviatura order by 4 desc) t;

  -- ======================= GASTOS =======================
  when 'gastos_periodo' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select to_char(date_trunc(v_trunc, fecha), case v_trunc when 'month' then 'YYYY-MM' when 'year' then 'YYYY' else 'YYYY-MM-DD' end) as periodo,
             count(*) as registros, sum(valor) as total from _gastos(p_desde, p_hasta, p_sede) group by 1 order by 1) t;
  when 'gastos_sede' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select s.nombre as sede, count(*) as registros, sum(g.valor) as total from _gastos(p_desde, p_hasta, p_sede) g
      join sedes s on s.id = g.sede_id group by 1 order by 3 desc) t;
  when 'gastos_categoria' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select coalesce(c.nombre, 'Sin categoría') as categoria, count(*) as registros, sum(g.valor) as total
      from _gastos(p_desde, p_hasta, p_sede) g left join categorias c on c.id = g.categoria_id group by 1 order by 3 desc) t;
  when 'gastos_usuario' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select coalesce(pf.nombre, '—') as usuario, count(*) as registros, sum(g.valor) as total
      from _gastos(p_desde, p_hasta, p_sede) g left join perfiles pf on pf.id = g.usuario_id group by 1 order by 3 desc) t;
  when 'gastos_metodo' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select coalesce(mp.nombre, g.origen) as metodo, g.origen, count(*) as registros, sum(g.valor) as total
      from _gastos(p_desde, p_hasta, p_sede) g left join metodos_pago mp on mp.id = g.metodo_id group by 1, 2 order by 4 desc) t;
  when 'gastos_detalle' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select g.numero, g.fecha, s.nombre as sede, coalesce(c.nombre, '') as categoria, g.descripcion, g.beneficiario, g.origen,
             g.valor as total, coalesce(pf.nombre, '—') as usuario
      from _gastos(p_desde, p_hasta, p_sede) g join sedes s on s.id = g.sede_id left join categorias c on c.id = g.categoria_id
      left join perfiles pf on pf.id = g.usuario_id order by g.fecha, g.numero) t;

  -- ======================= FINANCIEROS =======================
  when 'financiero_resumen' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select concepto, valor from (values
        (1, 'Ventas netas', (select coalesce(sum(total), 0) from _ventas(p_desde, p_hasta, p_sede))),
        (2, 'Costo estimado de producción', (select coalesce(round(sum(costo)), 0) from _ventas(p_desde, p_hasta, p_sede))),
        (3, 'Margen bruto estimado', (select coalesce(round(sum(total) - sum(costo)), 0) from _ventas(p_desde, p_hasta, p_sede))),
        (4, 'Gastos operativos (sin pagos de compras)', (select coalesce(sum(valor), 0) from _gastos(p_desde, p_hasta, p_sede) where compra_id is null)),
        (5, 'Pagos a proveedores', (select coalesce(sum(valor), 0) from _gastos(p_desde, p_hasta, p_sede) where compra_id is not null)),
        (6, 'Utilidad operativa estimada', (select coalesce(round(sum(total) - sum(costo)), 0) from _ventas(p_desde, p_hasta, p_sede))
                                         - (select coalesce(sum(valor), 0) from _gastos(p_desde, p_hasta, p_sede) where compra_id is null)),
        (7, 'Devoluciones', (select coalesce(sum(d.valor), 0) from devoluciones d where d.creado_en >= _rango_ini(p_desde)
                             and d.creado_en < _rango_fin(p_hasta) and _sede_ok(d.sede_id, p_sede)))
      ) x(orden, concepto, valor) order by orden) t;
  when 'financiero_flujo_caja' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select d::date as dia, coalesce(i.t, 0) as ingresos, coalesce(e.t, 0) as egresos, coalesce(i.t, 0) - coalesce(e.t, 0) as neto,
             sum(coalesce(i.t, 0) - coalesce(e.t, 0)) over (order by d) as acumulado
      from generate_series(p_desde, p_hasta, interval '1 day') d
      left join (select (pg.creado_en at time zone 'America/Bogota')::date dia, sum(pg.valor) t from pagos pg
                 where pg.creado_en >= _rango_ini(p_desde) and pg.creado_en < _rango_fin(p_hasta) and _sede_ok(pg.sede_id, p_sede) group by 1) i on i.dia = d::date
      left join (select dia, sum(t) t from (
                   select fecha as dia, valor t from _gastos(p_desde, p_hasta, p_sede)
                   union all
                   select (creado_en at time zone 'America/Bogota')::date, valor from devoluciones
                   where creado_en >= _rango_ini(p_desde) and creado_en < _rango_fin(p_hasta) and _sede_ok(sede_id, p_sede)) z group by dia) e on e.dia = d::date
      order by d) t;
  when 'financiero_rentabilidad_sede' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select s.nombre as sede,
             coalesce((select sum(total) from _ventas(p_desde, p_hasta, s.id)), 0) as ventas,
             coalesce((select round(sum(costo)) from _ventas(p_desde, p_hasta, s.id)), 0) as costo,
             coalesce((select sum(valor) from _gastos(p_desde, p_hasta, s.id) where compra_id is null), 0) as gastos,
             coalesce((select sum(total) - round(sum(costo)) from _ventas(p_desde, p_hasta, s.id)), 0)
               - coalesce((select sum(valor) from _gastos(p_desde, p_hasta, s.id) where compra_id is null), 0) as utilidad
      from sedes s where puede_sede(s.id) and (p_sede is null or s.id = p_sede) order by 5 desc) t;
  when 'financiero_cuentas_por_pagar' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select c.numero, c.fecha, c.vence, s.nombre as sede, coalesce(p.nombre, '—') as proveedor, c.total, c.pagado, c.total - c.pagado as saldo
      from compras c join sedes s on s.id = c.sede_id left join proveedores p on p.id = c.proveedor_id
      where c.estado <> 'cancelada' and c.estado_pago <> 'pagada' and _sede_ok(c.sede_id, p_sede) order by c.vence nulls last, c.fecha) t;
  when 'financiero_cierres_caja' then
    select jsonb_agg(to_jsonb(t)) into v from (
      select to_char(cs.abierta_en at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI') as apertura,
             to_char(cs.cerrada_en at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI') as cierre,
             s.nombre as sede, c.nombre as caja, pf.nombre as usuario, cs.saldo_inicial, cs.saldo_esperado, cs.saldo_contado, cs.diferencia
      from caja_sesiones cs join sedes s on s.id = cs.sede_id join cajas c on c.id = cs.caja_id join perfiles pf on pf.id = cs.usuario_id
      where cs.abierta_en >= _rango_ini(p_desde) and cs.abierta_en < _rango_fin(p_hasta) and _sede_ok(cs.sede_id, p_sede)
      order by cs.abierta_en desc) t;
  else
    raise exception 'Reporte no reconocido: %', p_tipo;
  end case;
  return coalesce(v, '[]'::jsonb);
end $$;

-- Costos y márgenes del menú (para el módulo de productos)
create or replace function costos_productos() returns table (producto_id uuid, costo numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform requerir('productos.costos');
  return query select p.id, costo_producto(p.id) from productos p;
end $$;

-- Historial de precios de compra de un insumo
create or replace function historial_precios(p_insumo uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
    select c.fecha, c.numero, coalesce(p.nombre, '—') as proveedor, ci.cantidad, u.abreviatura as unidad, ci.costo_unitario,
           round(ci.total / nullif(convertir(ci.cantidad, ci.unidad_id, i.unidad_id), 0), 2) as costo_por_unidad_base
    from compra_items ci join compras c on c.id = ci.compra_id join insumos i on i.id = ci.insumo_id
    join unidades u on u.id = ci.unidad_id left join proveedores p on p.id = c.proveedor_id
    where ci.insumo_id = p_insumo and c.estado <> 'cancelada' and puede_sede(c.sede_id) and tiene_permiso('compras.ver')
    order by c.fecha desc limit 50) t;
$$;

-- Facturación electrónica: cola de solicitudes (se emiten cuando exista integración
-- con un proveedor tecnológico autorizado por la DIAN; aquí NO se simula validación)
create or replace function solicitar_documento_electronico(p_pedido uuid, p_cliente jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_p pedidos; v_id uuid;
begin
  perform requerir('facturacion.ver');
  select * into v_p from pedidos where id = p_pedido;
  perform requerir_sede(v_p.sede_id);
  if v_p.estado_pago <> 'pagado' then raise exception 'Solo se pueden solicitar facturas de ventas pagadas.'; end if;
  if exists (select 1 from documentos_electronicos where pedido_id = p_pedido and tipo = 'factura' and estado <> 'rechazado') then
    raise exception 'Esta venta ya tiene una solicitud de factura electrónica.';
  end if;
  if coalesce(trim(p_cliente->>'documento'), '') = '' or coalesce(trim(p_cliente->>'nombre'), '') = '' then
    raise exception 'Indica nombre y documento (NIT o cédula) del adquiriente.';
  end if;
  insert into documentos_electronicos (sede_id, pedido_id, tipo, estado, cliente, proveedor, usuario_id)
  values (v_p.sede_id, p_pedido, 'factura', 'pendiente', p_cliente, (select fe_proveedor from config_empresa where id = 1), auth.uid())
  returning id into v_id;
  perform _auditar('solicitud_factura_electronica', 'documentos_electronicos', v_id::text, v_p.sede_id, null, p_cliente);
  return v_id;
end $$;

-- Privilegios de las funciones nuevas
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function email_para_login(text) to anon;
grant execute on function registrar_intento_fallido(text) to anon;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like '\_%' loop
    execute format('revoke execute on function %s from authenticated', f.firma);
  end loop;
end $$;

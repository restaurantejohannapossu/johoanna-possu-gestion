-- Pruebas de flujos completos (solo local)
\set ON_ERROR_STOP 1
\pset pager off
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'johoanna@restaurante.co', '{"nombre":"Johoanna Possu"}');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000002', 'cajero@restaurante.co');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000003', 'bodega@restaurante.co');
select nombre, usuario, (select nombre from roles where id = rol_id) rol from perfiles;

-- ===== Como administradora =====
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select registrar_inicio_sesion()->>'rol' as rol, jsonb_array_length(mi_sesion()->'permisos') as n_permisos;

-- Crea cajero e inventarista
select crear_perfil_usuario('00000000-0000-0000-0000-000000000002', 'Carlos Cajero', 'carlos', 'cajero@restaurante.co', null,
  (select id from roles where nombre = 'Cajero'), array[(select id from sedes where codigo = 'PRINCIPAL')]);
select crear_perfil_usuario('00000000-0000-0000-0000-000000000003', 'Bodega', 'bodega', 'bodega@restaurante.co', null,
  (select id from roles where nombre = 'Inventarista'), array[(select id from sedes where codigo = 'PRINCIPAL')]);

-- Producción de la sopa del día (1 tanda = 10.000 ml menos 5% de merma)
select registrar_produccion((select id from sedes where codigo = 'PRINCIPAL'), (select id from recetas where nombre = 'Sopa del día'), 1);
select i.nombre, round(inv.cantidad, 2) cant, round(inv.costo_promedio, 4) costo from inventario inv join insumos i on i.id = inv.insumo_id
where i.codigo in ('DEMO-SOP','DEMO-PAP','DEMO-POL','DEMO-ENS') order by 1;

-- Abre caja y vende en mesa
select abrir_caja((select id from cajas limit 1), 100000) as sesion \gset
select crear_pedido((select id from sedes where codigo = 'PRINCIPAL'), 'mesa', (select id from mesas where nombre = 'Mesa 1')) as ped \gset
select agregar_items(:'ped', jsonb_build_array(
  jsonb_build_object('producto_id', (select id from productos where codigo = 'DEMO-ALM'), 'cantidad', 2, 'observaciones', 'sin cebolla'),
  jsonb_build_object('producto_id', (select id from productos where codigo = 'DEMO-GAS'), 'cantidad', 1)));
select numero, total, (select estado from mesas where nombre = 'Mesa 1') mesa from pedidos where id = :'ped';
-- pago parcial y luego total
select registrar_pago(:'ped', jsonb_build_array(jsonb_build_object('metodo_id', (select id from metodos_pago where nombre = 'Nequi'), 'valor', 10000)));
select registrar_pago(:'ped', jsonb_build_array(jsonb_build_object('metodo_id', (select id from metodos_pago where nombre = 'Efectivo'), 'valor', 23000, 'recibido', 50000)));
select (select estado from mesas where nombre = 'Mesa 1') mesa_despues;
select i.codigo, round(sum(m.cantidad), 3) mov from movimientos_inventario m join insumos i on i.id = m.insumo_id
where m.documento_id = :'ped' group by 1 order by 1;
select nombre, cantidad, costo_unitario from pedido_items where pedido_id = :'ped';

-- Compra de 1 arroba de arroz, recibir y pagar desde caja
select guardar_compra(jsonb_build_object('sede_id', (select id from sedes where codigo = 'PRINCIPAL'),
  'proveedor_id', (select id from proveedores limit 1), 'forma_pago', 'credito',
  'items', jsonb_build_array(jsonb_build_object('insumo_id', (select id from insumos where codigo = 'DEMO-ARR'),
     'cantidad', 1, 'unidad_id', (select id from unidades where abreviatura = '@'), 'costo_unitario', 50000)))) as compra \gset
select recibir_compra(:'compra');
select round(cantidad, 3), round(costo_promedio, 2) from inventario where insumo_id = (select id from insumos where codigo = 'DEMO-ARR');
select pagar_compra(:'compra', 20000, 'caja');
select estado, estado_pago, pagado from compras where id = :'compra';

-- Gasto desde caja y desde banco
select registrar_gasto(jsonb_build_object('sede_id', (select id from sedes where codigo = 'PRINCIPAL'), 'valor', 15000,
  'descripcion', 'Pipeta de gas', 'categoria_id', (select id from categorias where nombre = 'Gas'), 'origen', 'caja')) as gasto \gset
select registrar_gasto(jsonb_build_object('sede_id', (select id from sedes where codigo = 'PRINCIPAL'), 'valor', 800000,
  'descripcion', 'Arriendo', 'origen', 'banco', 'metodo_id', (select id from metodos_pago where nombre = 'Transferencia bancaria')));
select anular_gasto(:'gasto', 'Se registró dos veces');
select movimiento_caja(:'sesion', 'retiro', 30000, 'Consignación al banco');
select resumen_caja(:'sesion');
select cerrar_caja(:'sesion', 140000)->>'diferencia' as diferencia;

-- Intentos indebidos (deben fallar)
\set ON_ERROR_STOP 0
update caja_sesiones set saldo_contado = 1 where id = :'sesion';
delete from movimientos_inventario where id = (select min(id) from movimientos_inventario);
delete from pedidos where id = :'ped';
\set ON_ERROR_STOP 1
select corregir_cierre_caja(:'sesion', 138000, 'Se contó mal un billete');
select saldo_contado, diferencia from caja_sesiones where id = :'sesion';

-- ===== Como cajero =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select mi_sesion()->>'rol' rol, mi_sesion()->'permisos' permisos;
\set ON_ERROR_STOP 0
select registrar_movimiento((select id from sedes where codigo = 'PRINCIPAL'), (select id from insumos where codigo = 'DEMO-ARR'), 'ajuste', 5, null, 'x');
select reporte('financiero_resumen', hoy(), hoy());
select registrar_pago(:'ped', '[{"valor":1}]');
\set ON_ERROR_STOP 1
update productos set precio = 1 where codigo = 'DEMO-ALM';
select precio from productos where codigo = 'DEMO-ALM';
select count(*) as filas_inventario_visibles_cajero from inventario;
select count(*) as auditoria_visible_cajero from auditoria;
-- Venta de mostrador del cajero
select abrir_caja((select id from cajas limit 1), 50000) as ses2 \gset
select crear_pedido((select id from sedes where codigo = 'PRINCIPAL'), 'mostrador') as p2 \gset
select agregar_items(:'p2', jsonb_build_array(jsonb_build_object('producto_id', (select id from productos where codigo = 'DEMO-GAS'), 'cantidad', 2)));
\set ON_ERROR_STOP 0
select agregar_items(:'p2', '[{"nombre":"Torta","precio":3000}]');
select cancelar_pedido(:'p2', 'prueba');
\set ON_ERROR_STOP 1
select registrar_pago(:'p2', jsonb_build_array(jsonb_build_object('metodo_id', (select id from metodos_pago where nombre = 'Efectivo'), 'valor', 6000)));
select estado, estado_pago, comprobante_numero from pedidos where id = :'p2';

-- ===== Admin: anular la venta del cajero (desde la caja del cajero no; admin abre su caja) =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
\set ON_ERROR_STOP 0
select abrir_caja((select id from cajas limit 1), 0);
\set ON_ERROR_STOP 1
insert into cajas (sede_id, nombre) values ((select id from sedes where codigo = 'PRINCIPAL'), 'Caja 2');
select abrir_caja((select id from cajas where nombre = 'Caja 2'), 0) as ses3 \gset
select anular_venta(:'p2', 'Cliente devolvió las gaseosas cerradas');
select estado, estado_pago, devuelto from pedidos where id = :'p2';
select round(cantidad) gaseosas from inventario where insumo_id = (select id from insumos where codigo = 'DEMO-GAS');

-- Mesa: separar, unir y trasladar
select crear_pedido((select id from sedes where codigo = 'PRINCIPAL'), 'mesa', (select id from mesas where nombre = 'Mesa 2')) as m2 \gset
select agregar_items(:'m2', jsonb_build_array(
  jsonb_build_object('producto_id', (select id from productos where codigo = 'DEMO-BAN'), 'cantidad', 3),
  jsonb_build_object('producto_id', (select id from productos where codigo = 'DEMO-JUG'), 'cantidad', 3)));
select separar_cuenta(:'m2', jsonb_build_array(jsonb_build_object('item_id', (select id from pedido_items where pedido_id = :'m2' and nombre = 'Bandeja de fríjoles'), 'cantidad', 1))) as m2b \gset
select numero, total from pedidos where id in (:'m2', :'m2b') order by numero;
select trasladar_pedido(:'m2b', (select id from mesas where nombre = 'Mesa 3'));
select unir_pedidos(:'m2b', :'m2');
select total, (select count(*) from pedido_items where pedido_id = :'m2' and estado = 'activo') items from pedidos where id = :'m2';
select nombre, estado from mesas where nombre in ('Mesa 2','Mesa 3') order by 1;
select cambiar_estado_pedido(:'m2', 'en_preparacion');
select descuento_pedido(:'m2', 6000, 'Cliente frecuente');
select total from pedidos where id = :'m2';

-- Domicilio
select crear_pedido((select id from sedes where codigo = 'PRINCIPAL'), 'domicilio', null, null, null,
  '{"cliente_nombre":"Ana","telefono":"3001112233","direccion":"Cra 5 # 4-10","barrio":"Centro","valor_domicilio":3000}') as dom \gset
select agregar_items(:'dom', jsonb_build_array(jsonb_build_object('producto_id', (select id from productos where codigo = 'DEMO-ALM'), 'cantidad', 1)));
select total from pedidos where id = :'dom';
select cambiar_estado_domicilio(:'dom', 'en_camino', 'Pedro');
select estado, domiciliario, hora_salida is not null from domicilios where pedido_id = :'dom';

-- Transferencias entre sedes
insert into sedes (codigo, nombre) values ('SEDE2', 'Sede Santander');
select crear_transferencia((select id from sedes where codigo = 'PRINCIPAL'), (select id from sedes where codigo = 'SEDE2'),
  jsonb_build_array(jsonb_build_object('insumo_id', (select id from insumos where codigo = 'DEMO-ARR'), 'cantidad', 5))) as tr \gset
select aprobar_transferencia(:'tr', true);
select despachar_transferencia(:'tr');
select recibir_transferencia(:'tr', jsonb_build_array(jsonb_build_object('id', (select id from transferencia_items where transferencia_id = :'tr'), 'cantidad_recibida', 4.5, 'observacion', 'Se rompió un paquete')));
select s.codigo, round(inv.cantidad, 3) from inventario inv join sedes s on s.id = inv.sede_id
where inv.insumo_id = (select id from insumos where codigo = 'DEMO-ARR') order by 1;

-- Conteo físico
select crear_conteo((select id from sedes where codigo = 'PRINCIPAL')) as cto \gset
update conteo_items set cantidad_contada = 40 where conteo_id = :'cto' and insumo_id = (select id from insumos where codigo = 'DEMO-HUE');
select aplicar_conteo(:'cto');
select round(cantidad) huevos from inventario where insumo_id = (select id from insumos where codigo = 'DEMO-HUE') and sede_id = (select id from sedes where codigo = 'PRINCIPAL');

-- Conversión inválida
\set ON_ERROR_STOP 0
select convertir(1, (select id from unidades where abreviatura = 'kg'), (select id from unidades where abreviatura = 'l'));
\set ON_ERROR_STOP 1

-- Dashboard y todos los reportes
select jsonb_pretty(dashboard(hoy() - 6, hoy()) - 'serie' - 'actividad');
do $$
declare t text;
begin
  foreach t in array array['ventas_periodo','ventas_sede','ventas_usuario','ventas_producto','ventas_categoria','ventas_metodo',
    'ventas_servicio','ventas_hora','ventas_dia_semana','ventas_detalle','productos_mas_vendidos','productos_menos_vendidos',
    'productos_baja_rotacion','productos_rentables','productos_consumo','productos_margen_menu','inventario_actual','inventario_valorizado',
    'inventario_minimo','inventario_agotados','inventario_por_vencer','inventario_vencidos','inventario_movimientos','inventario_ajustes',
    'inventario_desperdicios','inventario_transferencias','inventario_diferencias','inventario_consumo','gastos_periodo','gastos_sede',
    'gastos_categoria','gastos_usuario','gastos_metodo','gastos_detalle','financiero_resumen','financiero_flujo_caja',
    'financiero_rentabilidad_sede','financiero_cuentas_por_pagar','financiero_cierres_caja'] loop
    raise notice '% -> % filas', t, jsonb_array_length(reporte(t, hoy() - 30, hoy(), null, 'dia'));
  end loop;
end $$;
select reporte('financiero_resumen', hoy(), hoy());
select reporte('productos_margen_menu', hoy(), hoy());
select costo_receta((select id from recetas where nombre = 'Almuerzo corriente'))->>'costo_porcion' costo_almuerzo;
select nueva_version_receta((select id from recetas where nombre = 'Almuerzo corriente' and activa));
select nombre, version, activa from recetas where nombre = 'Almuerzo corriente' order by version;
select historial_precios((select id from insumos where codigo = 'DEMO-ARR'));
select accion, count(*) from auditoria group by 1 order by 2 desc limit 12;

-- Login por usuario y bloqueo
reset role;
set role anon;
select email_para_login('carlos');
select registrar_intento_fallido('carlos'), registrar_intento_fallido('carlos'), registrar_intento_fallido('carlos'),
       registrar_intento_fallido('carlos'), registrar_intento_fallido('carlos');
\set ON_ERROR_STOP 0
select email_para_login('carlos');
select count(*) from perfiles;
select dashboard(hoy(), hoy());
\set ON_ERROR_STOP 1
reset role;
-- datos demo
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select eliminar_datos_demo();
select 'FIN OK';

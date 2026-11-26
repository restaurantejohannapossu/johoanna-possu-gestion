\set ON_ERROR_STOP 1
\pset pager off
\pset tuples_only on
select id as n_rest from negocios where codigo='RESTAURANTE' \gset
select id as n_tienda from negocios where codigo='TIENDA' \gset
select id as n_ropa from negocios where codigo='ROPA' \gset
select id as s_tienda from sedes where codigo='TIENDA' \gset
select id as s_ropa from sedes where codigo='ROPA' \gset
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select 'sin negocio: productos visibles', count(*) from productos;
select set_config('request.headers', json_build_object('x-negocio', :'n_tienda')::text, false);
select 'tienda: productos visibles', count(*) from productos;
select 'tienda: sedes visibles', string_agg(codigo, ',') from sedes;
-- TIENDA: cerveza con presentaciones
insert into insumos (codigo, nombre, unidad_id, costo_unitario, minimo) values ('POKER330', 'Cerveza Póker 330 ml', (select id from unidades where abreviatura='und'), 2200, 30) returning id as ins_poker \gset
insert into productos (codigo, nombre, precio, tipo, control_inventario, insumo_id, va_a_cocina, codigo_barras, categoria_id)
values ('POKER', 'Cerveza Póker 330 ml', 3500, 'reventa', 'directo', :'ins_poker', false, '7702004003508', (select id from categorias where nombre='Cervezas')) returning id as p_poker \gset
insert into producto_opciones (producto_id, tipo, nombre, factor, precio, codigo_barras) values
 (:'p_poker', 'presentacion', 'Six pack', 6, 19500, '7702004003515'),
 (:'p_poker', 'presentacion', 'Canasta x30', 30, 90000, generar_codigo_barras());
select 'ean generado', codigo_barras from producto_opciones where nombre='Canasta x30';
select registrar_movimiento(:'s_tienda', :'ins_poker', 'inicial', 60, 2200, null, null);
select abrir_caja((select id from cajas where sede_id=:'s_tienda'), 50000) is not null as caja_tienda;
\set ON_ERROR_STOP 0
select 'mismo codigo duplicado (debe fallar)'; insert into producto_opciones (producto_id, tipo, nombre, codigo_barras) values (:'p_poker','presentacion','x','7702004003515');
\set ON_ERROR_STOP 1
select crear_pedido(:'s_tienda', 'cuenta', p_nombre_cuenta => 'Don Pedro (mesa de afuera)') as cuenta \gset
select 'lector unidad', buscar_codigo_barras('7702004003508', :'s_tienda')->>'nombre';
select buscar_codigo_barras((select codigo_barras from producto_opciones where nombre='Canasta x30'), :'s_tienda') as lec \gset
select 'lector canasta', (:'lec'::jsonb)->>'nombre', (:'lec'::jsonb)->>'precio';
select agregar_items(:'cuenta', jsonb_build_array(
  jsonb_build_object('producto_id', :'p_poker', 'opcion_id', (:'lec'::jsonb)->>'opcion_id', 'cantidad', 1),
  jsonb_build_object('producto_id', :'p_poker', 'cantidad', 4)));
select 'cuenta', nombre_cuenta, total from pedidos where id = :'cuenta';
\set ON_ERROR_STOP 0
select 'producto de otro negocio (debe fallar)'; select agregar_items(:'cuenta', jsonb_build_array(jsonb_build_object('producto_id', (select id from productos p where codigo='DEMO-GAS' and true limit 1))));
\set ON_ERROR_STOP 1
select registrar_pago(:'cuenta', jsonb_build_array(jsonb_build_object('metodo_id',(select id from metodos_pago where nombre='Efectivo'),'valor',104000,'recibido',110000)))->>'estado_pago';
select 'stock poker tras canasta+4', cantidad from inventario where insumo_id=:'ins_poker';
-- ROPA
select set_config('request.headers', json_build_object('x-negocio', :'n_ropa')::text, false);
select 'ropa: productos visibles', count(*) from productos;
insert into productos (codigo, nombre, precio, tipo, costo_estimado, va_a_cocina, categoria_id) values ('BLU01', 'Blusa campesina', 45000, 'reventa', 20000, false, (select id from categorias where nombre='Blusas')) returning id as p_blusa \gset
select 'variantes creadas', generar_variantes(:'p_blusa', array['S','M'], array['Rojo','Negro']);
select 'variante', nombre, codigo_barras from producto_opciones where producto_id=:'p_blusa' order by orden;
select registrar_movimiento(:'s_ropa', insumo_id, 'inicial', 3, 20000, null, null) from producto_opciones where producto_id=:'p_blusa';
select abrir_caja((select id from cajas where sede_id=:'s_ropa'), 0) is not null as caja_ropa;
\set ON_ERROR_STOP 0
select 'abrir 2da caja mismo usuario (debe fallar: ya tiene una abierta)';
\set ON_ERROR_STOP 1

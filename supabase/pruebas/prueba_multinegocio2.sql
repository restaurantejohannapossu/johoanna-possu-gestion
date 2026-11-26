\pset pager off
\pset tuples_only on
select id as n_ropa from negocios where codigo='ROPA' \gset
select id as n_tienda from negocios where codigo='TIENDA' \gset
select id as s_ropa from sedes where codigo='ROPA' \gset
select id as s_tienda from sedes where codigo='TIENDA' \gset
select id as p_rest from productos where codigo='DEMO-GAS' \gset
select id as p_blusa from productos where codigo='BLU01' \gset
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select set_config('request.headers', json_build_object('x-negocio', :'n_ropa')::text, false);
select crear_pedido(:'s_ropa', 'mostrador') as v \gset
select 'sin talla (debe fallar)'; select agregar_items(:'v', jsonb_build_array(jsonb_build_object('producto_id', :'p_blusa')));
select 'producto restaurante en ropa (debe fallar)'; select agregar_items(:'v', jsonb_build_array(jsonb_build_object('producto_id', :'p_rest')));
select buscar_codigo_barras('2900000000049', :'s_ropa') as lec \gset
select 'lector ropa', (:'lec'::jsonb)->>'nombre', (:'lec'::jsonb)->>'precio';
select agregar_items(:'v', jsonb_build_array(jsonb_build_object('producto_id', :'p_blusa', 'opcion_id', (:'lec'::jsonb)->>'opcion_id', 'cantidad', 2)));
select registrar_pago(:'v', jsonb_build_array(jsonb_build_object('metodo_id',(select id from metodos_pago where nombre='Nequi'),'valor',90000)))->>'estado_pago';
select 'stock M/Rojo', inv.cantidad from inventario inv join producto_opciones o on o.insumo_id=inv.insumo_id where o.codigo_barras='2900000000049';
select 'dashboard ropa ventas', dashboard(hoy(), hoy())->>'ventas';
select set_config('request.headers', json_build_object('x-negocio', :'n_tienda')::text, false);
select 'dashboard tienda ventas', dashboard(hoy(), hoy())->>'ventas';
select 'reporte tienda por producto', reporte('ventas_producto', hoy(), hoy());
select set_config('request.headers', '', false);
select 'dashboard sin negocio (todo)', dashboard(hoy(), hoy())->>'ventas';
select 'general', jsonb_path_query_array(dashboard_general(hoy()-6, hoy()), '$.negocios[*] ? (@.ventas >= 0)') @? '$' ;
select n->>'nombre', n->>'ventas', n->>'pedidos', n->>'caja', n->>'inventario' from jsonb_array_elements(dashboard_general(hoy()-6, hoy())->'negocios') n;
-- cajero del restaurante
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
reset role; update perfiles set bloqueado_hasta=null, intentos_fallidos=0 where usuario='carlos'; set role authenticated;
select 'cajero negocios visibles', jsonb_array_length(mi_sesion()->'negocios'), mi_sesion()->'negocios'->0->>'codigo';
select set_config('request.headers', json_build_object('x-negocio', :'n_tienda')::text, false);
select 'cajero restaurante viendo tienda: productos', count(*) from productos;
select 'cajero restaurante: buscar codigo tienda (debe fallar)'; select buscar_codigo_barras('7702004003508', :'s_tienda');

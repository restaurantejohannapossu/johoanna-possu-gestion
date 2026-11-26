\pset pager off
\pset tuples_only on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000004', 'cocina@x.co') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
insert into productos (codigo, nombre, precio) values ('SAN', 'Sancocho', 18000);
select 'costos', count(*) from costos_productos();
select id as ses from caja_sesiones where usuario_id = auth.uid() and estado='abierta' \gset
select crear_pedido((select id from sedes where codigo='PRINCIPAL'), 'mostrador') as p \gset
select agregar_items(:'p', jsonb_build_array(jsonb_build_object('producto_id',(select id from productos where codigo='SAN'),'cantidad',1)));
select 'pago', registrar_pago(:'p', jsonb_build_array(jsonb_build_object('metodo_id',(select id from metodos_pago where nombre='Nequi'),'valor',18000)))->>'estado_pago';
select 'fe', solicitar_documento_electronico(:'p', '{"nombre":"Ana","documento":"123","tipo_documento":"CC"}') is not null;
select 'doc', estado, cufe is null from documentos_electronicos;
select crear_perfil_usuario('00000000-0000-0000-0000-000000000004','Cocina','cocina','cocina@x.co',null,(select id from roles where nombre='Cocinero'), array[(select id from sedes where codigo='PRINCIPAL')]);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
insert into producto_sedes (producto_id, sede_id, agotado) values ((select id from productos where codigo='SAN'), (select id from sedes where codigo='PRINCIPAL'), true);
update producto_sedes set agotado = false where producto_id=(select id from productos where codigo='SAN');
select 'agotado', agotado from producto_sedes where producto_id=(select id from productos where codigo='SAN');
\set ON_ERROR_STOP 0
update producto_sedes set precio = 1 where producto_id=(select id from productos where codigo='SAN');
update producto_sedes set disponible = false where producto_id=(select id from productos where codigo='SAN');
insert into producto_sedes (producto_id, sede_id, precio) values ((select id from productos where codigo='SAN'), (select id from sedes where codigo='SEDE2'), 5);
select cambiar_estado_pedido(:'p','listo');
select 'estado', estado from pedidos where id = :'p';

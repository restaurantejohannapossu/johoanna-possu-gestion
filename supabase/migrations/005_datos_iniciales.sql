-- =====================================================================
-- 005 · Datos iniciales reales de configuración (no son datos de demo)
-- =====================================================================

-- PERMISOS ------------------------------------------------------------
insert into permisos (codigo, modulo, descripcion, orden) values
('*', 'Sistema', 'Acceso total (administrador general)', 0),
('dashboard.ver', 'Dashboard', 'Ver el dashboard', 10),
('pos.vender', 'Punto de venta', 'Registrar ventas y cobrar', 20),
('pos.descuento', 'Punto de venta', 'Aplicar descuentos', 21),
('pos.producto_personalizado', 'Punto de venta', 'Agregar productos personalizados', 22),
('pos.cancelar_venta', 'Punto de venta', 'Cancelar pedidos o quitar productos enviados a cocina', 23),
('pos.anular_venta', 'Punto de venta', 'Anular ventas ya pagadas', 24),
('pos.devolucion', 'Punto de venta', 'Registrar devoluciones', 25),
('pedidos.ver', 'Pedidos', 'Ver pedidos e historial', 30),
('mesas.gestionar', 'Mesas', 'Reservar y liberar mesas', 40),
('mesas.configurar', 'Mesas', 'Crear y editar mesas', 41),
('cocina.ver', 'Cocina', 'Ver comandas de cocina', 50),
('cocina.actualizar', 'Cocina', 'Cambiar el estado de los pedidos', 51),
('productos.ver', 'Productos', 'Ver productos y menú', 60),
('productos.gestionar', 'Productos', 'Crear y editar productos', 61),
('productos.precios', 'Productos', 'Cambiar precios', 62),
('productos.costos', 'Productos', 'Ver costos y márgenes', 63),
('productos.agotar', 'Productos', 'Marcar productos agotados', 64),
('recetas.ver', 'Recetas', 'Ver recetas', 70),
('recetas.gestionar', 'Recetas', 'Crear y editar recetas', 71),
('produccion.registrar', 'Recetas', 'Registrar producción', 72),
('inventario.ver', 'Inventario', 'Ver inventario y movimientos', 80),
('insumos.gestionar', 'Inventario', 'Crear y editar insumos', 81),
('inventario.entradas', 'Inventario', 'Registrar entradas', 82),
('inventario.desperdicio', 'Inventario', 'Registrar desperdicios, consumo interno y vencimientos', 83),
('inventario.ajustes', 'Inventario', 'Ajustes de inventario y aplicar conteos', 84),
('inventario.conteos', 'Inventario', 'Realizar conteos físicos', 85),
('compras.ver', 'Compras', 'Ver compras', 90),
('compras.gestionar', 'Compras', 'Registrar y recibir compras', 91),
('compras.pagar', 'Compras', 'Pagar compras', 92),
('proveedores.ver', 'Proveedores', 'Ver proveedores', 100),
('proveedores.gestionar', 'Proveedores', 'Crear y editar proveedores', 101),
('clientes.ver', 'Clientes', 'Ver clientes', 110),
('clientes.gestionar', 'Clientes', 'Editar clientes', 111),
('domicilios.ver', 'Domicilios', 'Ver domicilios', 120),
('domicilios.gestionar', 'Domicilios', 'Gestionar domicilios', 121),
('caja.operar', 'Caja', 'Abrir y cerrar su caja', 130),
('caja.movimientos', 'Caja', 'Ingresos y retiros de caja', 131),
('caja.ver_todas', 'Caja', 'Ver todas las cajas de sus sedes', 132),
('caja.ajustes', 'Caja', 'Ajustes y corrección de cierres', 133),
('gastos.ver', 'Gastos', 'Ver salidas de dinero', 140),
('gastos.registrar', 'Gastos', 'Registrar salidas de dinero', 141),
('gastos.anular', 'Gastos', 'Anular salidas de dinero', 142),
('facturacion.ver', 'Facturación', 'Ver y reimprimir comprobantes', 150),
('facturacion.configurar', 'Facturación', 'Configurar facturación electrónica y resoluciones', 151),
('transferencias.ver', 'Transferencias', 'Ver transferencias', 160),
('transferencias.solicitar', 'Transferencias', 'Solicitar transferencias', 161),
('transferencias.aprobar', 'Transferencias', 'Aprobar o rechazar transferencias', 162),
('transferencias.despachar', 'Transferencias', 'Despachar transferencias', 163),
('transferencias.recibir', 'Transferencias', 'Recibir transferencias', 164),
('reportes.ventas', 'Reportes', 'Reportes de ventas y productos', 170),
('reportes.inventario', 'Reportes', 'Reportes de inventario', 171),
('reportes.gastos', 'Reportes', 'Reportes de gastos', 172),
('reportes.financieros', 'Reportes', 'Reportes financieros, costos y utilidades', 173),
('usuarios.ver', 'Usuarios', 'Ver usuarios', 180),
('usuarios.gestionar', 'Usuarios', 'Crear y editar usuarios', 181),
('roles.gestionar', 'Usuarios', 'Configurar roles y permisos', 182),
('sedes.gestionar', 'Sedes', 'Crear y editar sedes y cajas', 190),
('auditoria.ver', 'Auditoría', 'Ver auditoría', 200),
('configuracion.gestionar', 'Configuración', 'Configuración general', 210),
('datos_demo.eliminar', 'Configuración', 'Eliminar datos de demostración', 211);

-- ROLES ---------------------------------------------------------------
insert into roles (nombre, descripcion, todas_las_sedes, es_sistema) values
('Administrador general', 'Acceso total a todas las sedes y configuración', true, true),
('Administrador de sede', 'Gestiona su sede: ventas, inventario, caja, gastos y reportes', false, true),
('Cajero', 'Ventas, caja, pagos e impresión de comprobantes', false, true),
('Cocinero', 'Comandas de cocina, recetas y producción', false, true),
('Inventarista', 'Entradas, conteos, ajustes y transferencias', false, true);

insert into rol_permisos (rol_id, permiso) select id, '*' from roles where nombre = 'Administrador general';

insert into rol_permisos (rol_id, permiso)
select r.id, p from roles r, unnest(array[
  'dashboard.ver','pos.vender','pos.descuento','pos.producto_personalizado','pos.cancelar_venta','pos.anular_venta','pos.devolucion',
  'pedidos.ver','mesas.gestionar','mesas.configurar','cocina.ver','cocina.actualizar','productos.ver','productos.costos','productos.agotar',
  'recetas.ver','produccion.registrar','inventario.ver','inventario.entradas','inventario.desperdicio','inventario.ajustes','inventario.conteos',
  'compras.ver','compras.gestionar','compras.pagar','proveedores.ver','proveedores.gestionar','clientes.ver','clientes.gestionar',
  'domicilios.ver','domicilios.gestionar','caja.operar','caja.movimientos','caja.ver_todas','caja.ajustes',
  'gastos.ver','gastos.registrar','gastos.anular','facturacion.ver','transferencias.ver','transferencias.solicitar',
  'transferencias.despachar','transferencias.recibir','reportes.ventas','reportes.inventario','reportes.gastos','reportes.financieros',
  'usuarios.ver','usuarios.gestionar','auditoria.ver']) p
where r.nombre = 'Administrador de sede';

insert into rol_permisos (rol_id, permiso)
select r.id, p from roles r, unnest(array[
  'pos.vender','pedidos.ver','mesas.gestionar','productos.ver','clientes.ver','domicilios.ver','domicilios.gestionar',
  'caja.operar','facturacion.ver']) p
where r.nombre = 'Cajero';

insert into rol_permisos (rol_id, permiso)
select r.id, p from roles r, unnest(array[
  'cocina.ver','cocina.actualizar','pedidos.ver','productos.ver','productos.agotar','recetas.ver','produccion.registrar']) p
where r.nombre = 'Cocinero';

insert into rol_permisos (rol_id, permiso)
select r.id, p from roles r, unnest(array[
  'inventario.ver','insumos.gestionar','inventario.entradas','inventario.desperdicio','inventario.ajustes','inventario.conteos',
  'productos.ver','recetas.ver','compras.ver','proveedores.ver','transferencias.ver','transferencias.solicitar',
  'transferencias.despachar','transferencias.recibir']) p
where r.nombre = 'Inventarista';

-- UNIDADES (factor respecto a g, ml o und) ------------------------------
insert into unidades (nombre, abreviatura, magnitud, factor) values
('Gramo', 'g', 'masa', 1),
('Kilogramo', 'kg', 'masa', 1000),
('Libra', 'lb', 'masa', 500),          -- libra colombiana = 500 g
('Arroba', '@', 'masa', 12500),        -- arroba = 25 libras = 12,5 kg
('Mililitro', 'ml', 'volumen', 1),
('Litro', 'l', 'volumen', 1000),
('Galón', 'gal', 'volumen', 3785.41),
('Unidad', 'und', 'conteo', 1),
('Docena', 'doc', 'conteo', 12),
('Porción', 'porc', 'porcion', 1),
('Paquete', 'paq', 'paquete', 1),
('Caja', 'caja', 'caja', 1),
('Canasta', 'can', 'canasta', 1);

-- CATEGORÍAS --------------------------------------------------------------
insert into categorias (nombre, tipo, orden) values
('Almuerzos','producto',1),('Platos tradicionales','producto',2),('Desayunos','producto',3),('Sopas','producto',4),
('Carnes','producto',5),('Acompañamientos','producto',6),('Bebidas','producto',7),('Jugos naturales','producto',8),
('Postres','producto',9),('Adicionales','producto',10),
('Granos y cereales','insumo',1),('Carnes y proteínas','insumo',2),('Verduras y hortalizas','insumo',3),('Frutas','insumo',4),
('Lácteos y huevos','insumo',5),('Abarrotes','insumo',6),('Bebidas','insumo',7),('Condimentos','insumo',8),
('Preparaciones','insumo',9),('Empaques y desechables','insumo',10),('Aseo','insumo',11),
('Compra de alimentos','gasto',1),('Compra de bebidas','gasto',2),('Pago a proveedores','gasto',3),('Transporte','gasto',4),
('Servicios públicos','gasto',5),('Arriendo','gasto',6),('Nómina','gasto',7),('Mantenimiento','gasto',8),
('Elementos de aseo','gasto',9),('Gas','gasto',10),('Empaques','gasto',11),('Papelería','gasto',12),
('Impuestos','gasto',13),('Comisiones','gasto',14),('Otros','gasto',15);

-- IMPUESTOS (configurables; verificar con su contador) ----------------
insert into impuestos (nombre, tipo, porcentaje, incluido_en_precio, activo) values
('Sin impuesto', 'otro', 0, true, true),
('Impuesto al consumo 8%', 'INC', 8, true, false),
('IVA 19%', 'IVA', 19, true, false);

-- MÉTODOS DE PAGO -------------------------------------------------------
insert into metodos_pago (nombre, es_efectivo, orden) values
('Efectivo', true, 1), ('Nequi', false, 2), ('Daviplata', false, 3),
('Transferencia bancaria', false, 4), ('Tarjeta', false, 5);

-- SEDE PRINCIPAL, CAJA Y MESAS ---------------------------------------------
insert into sedes (codigo, nombre, direccion, whatsapp)
values ('PRINCIPAL', 'Sede principal Villa Rica', 'Villa Rica, Cauca — Referencia: Bomba Texaco', '3187685197');

insert into cajas (sede_id, nombre) select id, 'Caja principal' from sedes where codigo = 'PRINCIPAL';

insert into mesas (sede_id, nombre, capacidad, orden)
select s.id, 'Mesa ' || n, 4, n from sedes s, generate_series(1, 8) n where s.codigo = 'PRINCIPAL';

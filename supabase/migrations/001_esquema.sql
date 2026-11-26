-- =====================================================================
-- RESTAURANTE JOHOANNA POSSU · Sistema integral de gestión
-- 001 · Esquema de base de datos (multisede)
-- Ejecutar en el SQL Editor de Supabase en orden: 001, 002, 003, 004, 005.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- CONFIGURACIÓN GENERAL (una sola fila)
-- ---------------------------------------------------------------------
create table config_empresa (
  id int primary key default 1 check (id = 1),
  nombre text not null default 'Restaurante Johoanna Possu',
  eslogan text default 'Sabor casero y tradicional',
  logo_url text,
  razon_social text,
  nit text,
  regimen text,
  responsabilidades_tributarias text,
  direccion text default 'Villa Rica, Cauca — Referencia: Bomba Texaco',
  ciudad text default 'Villa Rica, Cauca',
  telefono text,
  whatsapp text default '3187685197',
  correo text,
  horarios text,
  mensaje_comprobante text default '¡Gracias por preferirnos! Sabor casero, hecho con amor.',
  pais text default 'Colombia',
  moneda text default 'COP',
  zona_horaria text default 'America/Bogota',
  idioma text default 'es',
  impresion jsonb not null default '{"formato":"80mm","mostrar_logo":true,"copias":1}',
  inventario jsonb not null default '{"permitir_negativo":true,"dias_alerta_vencimiento":5}',
  recetas jsonb not null default '{"aplicar_merma":true}',
  fe_habilitada boolean not null default false,
  fe_proveedor text,
  fe_ambiente text default 'pruebas' check (fe_ambiente in ('pruebas','produccion')),
  intentos_bloqueo int not null default 5,
  minutos_bloqueo int not null default 15,
  actualizado_en timestamptz default now()
);
insert into config_empresa (id) values (1);

-- ---------------------------------------------------------------------
-- SEDES
-- ---------------------------------------------------------------------
create table sedes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  direccion text,
  telefono text,
  whatsapp text,
  horarios text,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- USUARIOS, ROLES Y PERMISOS
-- ---------------------------------------------------------------------
create table permisos (
  codigo text primary key,
  modulo text not null,
  descripcion text not null,
  orden int default 0
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  todas_las_sedes boolean not null default false,
  es_sistema boolean not null default false,
  creado_en timestamptz default now()
);

create table rol_permisos (
  rol_id uuid not null references roles(id) on delete cascade,
  permiso text not null references permisos(codigo) on delete cascade,
  primary key (rol_id, permiso)
);

create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  usuario text unique,
  correo text,
  telefono text,
  rol_id uuid references roles(id),
  sede_principal_id uuid references sedes(id),
  activo boolean not null default true,
  ultimo_inicio timestamptz,
  intentos_fallidos int not null default 0,
  bloqueado_hasta timestamptz,
  creado_en timestamptz not null default now()
);

create table usuario_sedes (
  usuario_id uuid not null references perfiles(id) on delete cascade,
  sede_id uuid not null references sedes(id) on delete cascade,
  primary key (usuario_id, sede_id)
);

-- Permisos individuales que amplían (concedido=true) o restringen (false) el rol
create table usuario_permisos (
  usuario_id uuid not null references perfiles(id) on delete cascade,
  permiso text not null references permisos(codigo) on delete cascade,
  concedido boolean not null,
  primary key (usuario_id, permiso)
);

-- ---------------------------------------------------------------------
-- CATÁLOGOS
-- ---------------------------------------------------------------------
create table unidades (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  abreviatura text not null unique,
  magnitud text not null,          -- masa | volumen | conteo | paquete | caja | ...
  factor numeric not null default 1 check (factor > 0),  -- equivalencia a la unidad base de su magnitud (g, ml, und)
  activa boolean not null default true
);

create table categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null check (tipo in ('producto','insumo','gasto')),
  orden int not null default 0,
  activa boolean not null default true,
  unique (nombre, tipo)
);

create table impuestos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  tipo text not null default 'INC' check (tipo in ('INC','IVA','otro')),
  porcentaje numeric not null default 0 check (porcentaje >= 0),
  incluido_en_precio boolean not null default true,
  activo boolean not null default true
);

create table metodos_pago (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  es_efectivo boolean not null default false,
  activo boolean not null default true,
  orden int not null default 0
);

create table proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo_documento text default 'NIT',
  documento text,
  telefono text,
  whatsapp text,
  correo text,
  direccion text,
  ciudad text,
  productos_suministrados text,
  observaciones text,
  activo boolean not null default true,
  es_demo boolean not null default false,
  creado_en timestamptz not null default now()
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo_documento text default 'CC',
  documento text,
  telefono text,
  whatsapp text,
  correo text,
  direccion text,
  barrio text,
  preferencias text,
  observaciones text,
  activo boolean not null default true,
  es_demo boolean not null default false,
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- INVENTARIO
-- ---------------------------------------------------------------------
create table insumos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  categoria_id uuid references categorias(id),
  unidad_id uuid not null references unidades(id),
  costo_unitario numeric not null default 0 check (costo_unitario >= 0),  -- por unidad del insumo
  minimo numeric not null default 0,
  maximo numeric,
  proveedor_id uuid references proveedores(id),
  perecedero boolean not null default false,
  ubicacion text,
  es_preparacion boolean not null default false,   -- preparación intermedia producida en cocina
  activo boolean not null default true,
  es_demo boolean not null default false,
  creado_en timestamptz not null default now()
);

create table inventario (
  insumo_id uuid not null references insumos(id),
  sede_id uuid not null references sedes(id),
  cantidad numeric not null default 0,
  costo_promedio numeric not null default 0,
  minimo numeric,           -- si es nulo se usa el mínimo del insumo
  ubicacion text,
  ultima_compra date,
  actualizado_en timestamptz not null default now(),
  primary key (insumo_id, sede_id)
);

create table lotes (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references insumos(id),
  sede_id uuid not null references sedes(id),
  cantidad_inicial numeric not null,
  cantidad numeric not null,
  vence date,
  compra_id uuid,
  creado_en timestamptz not null default now()
);

create table movimientos_inventario (
  id bigserial primary key,
  fecha timestamptz not null default now(),
  sede_id uuid not null references sedes(id),
  insumo_id uuid not null references insumos(id),
  tipo text not null check (tipo in (
    'inicial','compra','venta','desperdicio','consumo_interno','ajuste','devolucion',
    'transferencia_salida','transferencia_entrada','produccion_consumo','produccion_entrada',
    'vencimiento','conteo_fisico','anulacion')),
  cantidad numeric not null,            -- positiva entra, negativa sale (en la unidad del insumo)
  costo_unitario numeric not null default 0,
  saldo numeric not null,
  usuario_id uuid references perfiles(id),
  motivo text,
  documento_tipo text,
  documento_id uuid,
  observaciones text
);
create index on movimientos_inventario (sede_id, fecha);
create index on movimientos_inventario (insumo_id, fecha);

-- ---------------------------------------------------------------------
-- PRODUCTOS Y MENÚ
-- ---------------------------------------------------------------------
create table productos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  categoria_id uuid references categorias(id),
  descripcion text,
  imagen_url text,
  precio numeric not null default 0 check (precio >= 0),
  costo_estimado numeric not null default 0,   -- costo manual (si no tiene receta)
  impuesto_id uuid references impuestos(id),
  unidad_venta text not null default 'und',
  tipo text not null default 'preparado' check (tipo in ('preparado','reventa','servicio')),
  control_inventario text not null default 'ninguno' check (control_inventario in ('receta','directo','ninguno')),
  insumo_id uuid references insumos(id),       -- para control directo (ej. gaseosa)
  cantidad_insumo numeric not null default 1,
  va_a_cocina boolean not null default true,
  activo boolean not null default true,
  orden int not null default 0,
  es_demo boolean not null default false,
  creado_en timestamptz not null default now()
);

create table producto_sedes (
  producto_id uuid not null references productos(id) on delete cascade,
  sede_id uuid not null references sedes(id) on delete cascade,
  disponible boolean not null default true,
  agotado boolean not null default false,
  precio numeric,                 -- precio especial de la sede (opcional)
  hora_desde time,
  hora_hasta time,
  dias int[],                     -- 0=domingo … 6=sábado; nulo = todos
  primary key (producto_id, sede_id)
);

-- ---------------------------------------------------------------------
-- RECETAS Y PRODUCCIÓN
-- ---------------------------------------------------------------------
create table recetas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  producto_id uuid references productos(id),
  insumo_resultado_id uuid references insumos(id),   -- preparación intermedia que produce
  rendimiento numeric not null default 1 check (rendimiento > 0),
  merma_pct numeric not null default 0 check (merma_pct >= 0),
  version int not null default 1,
  activa boolean not null default true,
  instrucciones text,
  es_demo boolean not null default false,
  creado_por uuid references perfiles(id),
  creado_en timestamptz not null default now(),
  check (producto_id is not null or insumo_resultado_id is not null)
);
create unique index recetas_producto_activa on recetas (producto_id) where activa and producto_id is not null;
create unique index recetas_insumo_activa on recetas (insumo_resultado_id) where activa and insumo_resultado_id is not null;

create table receta_items (
  id uuid primary key default gen_random_uuid(),
  receta_id uuid not null references recetas(id) on delete cascade,
  insumo_id uuid not null references insumos(id),
  cantidad numeric not null check (cantidad > 0),
  unidad_id uuid not null references unidades(id),
  desperdicio_pct numeric not null default 0 check (desperdicio_pct >= 0)
);

create table producciones (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null,
  sede_id uuid not null references sedes(id),
  receta_id uuid not null references recetas(id),
  lotes numeric not null,
  cantidad_producida numeric not null,
  costo_total numeric not null default 0,
  usuario_id uuid references perfiles(id),
  observaciones text,
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- CONSECUTIVOS
-- ---------------------------------------------------------------------
create table consecutivos (
  clave text primary key,     -- '<sede_id>:<tipo>' o 'global:<tipo>'
  ultimo bigint not null default 0
);

-- ---------------------------------------------------------------------
-- MESAS, PEDIDOS, PAGOS, DOMICILIOS
-- ---------------------------------------------------------------------
create table mesas (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes(id),
  nombre text not null,
  zona text,
  capacidad int default 4,
  estado text not null default 'libre' check (estado in ('libre','ocupada','reservada')),
  nota_reserva text,
  activa boolean not null default true,
  orden int not null default 0,
  unique (sede_id, nombre)
);

create table pedidos (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes(id),
  numero bigint not null,
  tipo_servicio text not null check (tipo_servicio in ('mesa','llevar','recoger','domicilio','mostrador')),
  mesa_id uuid references mesas(id),
  cliente_id uuid references clientes(id),
  usuario_id uuid references perfiles(id),
  estado text not null default 'pendiente' check (estado in ('pendiente','en_preparacion','listo','entregado','cancelado')),
  estado_pago text not null default 'abierto' check (estado_pago in ('abierto','parcial','pagado','anulado')),
  subtotal numeric not null default 0,
  impuestos numeric not null default 0,
  descuento numeric not null default 0,
  descuento_motivo text,
  valor_domicilio numeric not null default 0,
  total numeric not null default 0,
  pagado numeric not null default 0,
  devuelto numeric not null default 0,
  observaciones text,
  comprobante_numero bigint,
  cerrado_en timestamptz,
  motivo_cancelacion text,
  cancelado_por uuid references perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (sede_id, numero)
);
create index on pedidos (sede_id, cerrado_en);
create index on pedidos (sede_id, estado_pago);

create table pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id),
  producto_id uuid references productos(id),
  nombre text not null,
  cantidad numeric not null check (cantidad > 0),
  precio_unitario numeric not null,
  descuento numeric not null default 0,
  impuesto_pct numeric not null default 0,
  impuesto_incluido boolean not null default true,
  impuesto_valor numeric not null default 0,
  total numeric not null default 0,
  costo_unitario numeric not null default 0,
  observaciones text,
  personalizado boolean not null default false,
  va_a_cocina boolean not null default true,
  estado text not null default 'activo' check (estado in ('activo','cancelado')),
  motivo_cancelacion text,
  inventario_descontado boolean not null default false,
  creado_por uuid references perfiles(id),
  creado_en timestamptz not null default now()
);
create index on pedido_items (pedido_id);

create table pagos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id),
  sede_id uuid not null references sedes(id),
  metodo_id uuid not null references metodos_pago(id),
  valor numeric not null check (valor > 0),
  recibido numeric,
  cambio numeric not null default 0,
  referencia text,
  caja_sesion_id uuid,
  usuario_id uuid references perfiles(id),
  creado_en timestamptz not null default now()
);

create table domicilios (
  pedido_id uuid primary key references pedidos(id),
  cliente_nombre text,
  telefono text,
  direccion text not null,
  barrio text,
  referencias text,
  domiciliario text,
  estado text not null default 'recibido' check (estado in ('recibido','en_preparacion','listo','en_camino','entregado','cancelado')),
  hora_salida timestamptz,
  hora_entrega timestamptz,
  observaciones text
);

create table devoluciones (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null,
  sede_id uuid not null references sedes(id),
  pedido_id uuid not null references pedidos(id),
  motivo text not null,
  valor numeric not null check (valor >= 0),
  metodo_id uuid references metodos_pago(id),
  caja_sesion_id uuid,
  reintegrar_inventario boolean not null default false,
  items jsonb,
  es_anulacion boolean not null default false,
  usuario_id uuid references perfiles(id),
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- CAJA
-- ---------------------------------------------------------------------
create table cajas (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes(id),
  nombre text not null,
  activa boolean not null default true,
  unique (sede_id, nombre)
);

create table caja_sesiones (
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null references cajas(id),
  sede_id uuid not null references sedes(id),
  usuario_id uuid not null references perfiles(id),
  estado text not null default 'abierta' check (estado in ('abierta','cerrada')),
  abierta_en timestamptz not null default now(),
  saldo_inicial numeric not null default 0,
  denominaciones_apertura jsonb,
  observaciones_apertura text,
  cerrada_en timestamptz,
  cerrada_por uuid references perfiles(id),
  resumen jsonb,
  saldo_esperado numeric,
  saldo_contado numeric,
  diferencia numeric,
  denominaciones_cierre jsonb,
  observaciones_cierre text
);
create unique index caja_una_sesion_abierta on caja_sesiones (caja_id) where estado = 'abierta';
create unique index usuario_una_sesion_abierta on caja_sesiones (usuario_id) where estado = 'abierta';

create table caja_movimientos (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references caja_sesiones(id),
  sede_id uuid not null references sedes(id),
  tipo text not null check (tipo in ('venta','ingreso','gasto','retiro','pago_proveedor','devolucion','transferencia','ajuste')),
  metodo_id uuid references metodos_pago(id),
  valor numeric not null,          -- positivo entra, negativo sale
  descripcion text,
  referencia_tipo text,
  referencia_id uuid,
  usuario_id uuid references perfiles(id),
  creado_en timestamptz not null default now()
);
create index on caja_movimientos (sesion_id);

alter table pagos add constraint pagos_sesion_fk foreign key (caja_sesion_id) references caja_sesiones(id);
alter table devoluciones add constraint devoluciones_sesion_fk foreign key (caja_sesion_id) references caja_sesiones(id);

-- ---------------------------------------------------------------------
-- COMPRAS
-- ---------------------------------------------------------------------
create table compras (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null,
  sede_id uuid not null references sedes(id),
  proveedor_id uuid references proveedores(id),
  fecha date not null default (now() at time zone 'America/Bogota')::date,
  estado text not null default 'pendiente' check (estado in ('pendiente','recibida','cancelada')),
  estado_pago text not null default 'pendiente' check (estado_pago in ('pendiente','parcial','pagada')),
  forma_pago text not null default 'contado' check (forma_pago in ('contado','credito')),
  vence date,
  factura_proveedor text,
  subtotal numeric not null default 0,
  descuento numeric not null default 0,
  impuestos numeric not null default 0,
  total numeric not null default 0,
  pagado numeric not null default 0,
  adjunto_url text,
  observaciones text,
  usuario_id uuid references perfiles(id),
  recibida_en timestamptz,
  recibida_por uuid references perfiles(id),
  motivo_cancelacion text,
  creado_en timestamptz not null default now()
);

create table compra_items (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references compras(id) on delete cascade,
  insumo_id uuid not null references insumos(id),
  cantidad numeric not null check (cantidad > 0),
  unidad_id uuid not null references unidades(id),
  costo_unitario numeric not null check (costo_unitario >= 0),   -- por la unidad indicada
  descuento numeric not null default 0,
  impuesto_pct numeric not null default 0,
  total numeric not null default 0,
  vence date
);

-- ---------------------------------------------------------------------
-- SALIDAS DE DINERO / GASTOS
-- ---------------------------------------------------------------------
create table gastos_recurrentes (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes(id),
  categoria_id uuid references categorias(id),
  descripcion text not null,
  valor numeric not null,
  frecuencia text not null default 'mensual' check (frecuencia in ('semanal','quincenal','mensual')),
  proxima_fecha date not null,
  beneficiario text,
  activo boolean not null default true
);

create table gastos (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null,
  sede_id uuid not null references sedes(id),
  fecha date not null default (now() at time zone 'America/Bogota')::date,
  creado_en timestamptz not null default now(),
  usuario_id uuid references perfiles(id),
  categoria_id uuid references categorias(id),
  descripcion text not null,
  valor numeric not null check (valor > 0),
  metodo_id uuid references metodos_pago(id),
  origen text not null default 'caja' check (origen in ('caja','banco','otro')),
  caja_sesion_id uuid references caja_sesiones(id),
  beneficiario text,
  proveedor_id uuid references proveedores(id),
  compra_id uuid references compras(id),
  recurrente_id uuid references gastos_recurrentes(id),
  adjunto_url text,
  observaciones text,
  autorizado_por uuid references perfiles(id),
  anulado boolean not null default false,
  motivo_anulacion text,
  anulado_por uuid references perfiles(id)
);
create index on gastos (sede_id, fecha);

create table pagos_compra (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references compras(id),
  gasto_id uuid references gastos(id),
  valor numeric not null check (valor > 0),
  usuario_id uuid references perfiles(id),
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- TRANSFERENCIAS ENTRE SEDES
-- ---------------------------------------------------------------------
create table transferencias (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null,
  sede_origen_id uuid not null references sedes(id),
  sede_destino_id uuid not null references sedes(id),
  estado text not null default 'solicitud' check (estado in ('solicitud','aprobada','despachada','recibida','rechazada','cancelada')),
  solicitado_por uuid references perfiles(id),
  aprobado_por uuid references perfiles(id),
  despachado_por uuid references perfiles(id),
  recibido_por uuid references perfiles(id),
  aprobada_en timestamptz,
  despachada_en timestamptz,
  recibida_en timestamptz,
  observaciones text,
  creado_en timestamptz not null default now(),
  check (sede_origen_id <> sede_destino_id)
);

create table transferencia_items (
  id uuid primary key default gen_random_uuid(),
  transferencia_id uuid not null references transferencias(id) on delete cascade,
  insumo_id uuid not null references insumos(id),
  cantidad_solicitada numeric not null check (cantidad_solicitada > 0),
  cantidad_enviada numeric,
  cantidad_recibida numeric,
  costo_unitario numeric not null default 0,
  observacion_diferencia text
);

-- ---------------------------------------------------------------------
-- INVENTARIOS FÍSICOS (CONTEOS)
-- ---------------------------------------------------------------------
create table conteos (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null,
  sede_id uuid not null references sedes(id),
  estado text not null default 'borrador' check (estado in ('borrador','aplicado','anulado')),
  usuario_id uuid references perfiles(id),
  aplicado_por uuid references perfiles(id),
  observaciones text,
  creado_en timestamptz not null default now(),
  aplicado_en timestamptz
);

create table conteo_items (
  id uuid primary key default gen_random_uuid(),
  conteo_id uuid not null references conteos(id) on delete cascade,
  insumo_id uuid not null references insumos(id),
  cantidad_sistema numeric not null,
  cantidad_contada numeric,
  costo_unitario numeric not null default 0,
  unique (conteo_id, insumo_id)
);

-- ---------------------------------------------------------------------
-- FACTURACIÓN ELECTRÓNICA (preparación; requiere proveedor tecnológico)
-- ---------------------------------------------------------------------
create table resoluciones (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid references sedes(id),
  tipo text not null check (tipo in ('factura_electronica','documento_equivalente_pos','nota_credito','nota_debito')),
  prefijo text,
  numero_resolucion text,
  fecha_resolucion date,
  desde bigint,
  hasta bigint,
  actual bigint not null default 0,
  vigencia_hasta date,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

create table documentos_electronicos (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes(id),
  pedido_id uuid references pedidos(id),
  tipo text not null check (tipo in ('factura','documento_equivalente','nota_credito','nota_debito')),
  resolucion_id uuid references resoluciones(id),
  prefijo text,
  numero bigint,
  estado text not null default 'pendiente' check (estado in ('pendiente','enviado','validado','rechazado','error')),
  cliente jsonb,
  cufe text,
  qr text,
  xml_url text,
  pdf_url text,
  proveedor text,
  respuesta jsonb,
  usuario_id uuid references perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- AUDITORÍA Y ERRORES
-- ---------------------------------------------------------------------
create table auditoria (
  id bigserial primary key,
  fecha timestamptz not null default now(),
  usuario_id uuid,
  usuario_nombre text,
  sede_id uuid,
  accion text not null,
  tabla text,
  registro_id text,
  antes jsonb,
  despues jsonb,
  detalle text
);
create index on auditoria (fecha desc);
create index on auditoria (tabla, registro_id);

create table registro_errores (
  id bigserial primary key,
  fecha timestamptz not null default now(),
  usuario_id uuid,
  ruta text,
  mensaje text,
  detalle jsonb
);

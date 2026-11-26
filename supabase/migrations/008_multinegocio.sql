-- =====================================================================
-- 008 · MULTINEGOCIO
-- Restaurante Johoanna Possu · Variedades Johanna · Tienda
-- Un solo sistema, con catálogos, inventario, cajas y ventas separados
-- por negocio. Agrega: códigos de barras, tallas/colores (variantes),
-- presentaciones (unidad/paca/canasta) y cuentas abiertas.
-- Se puede ejecutar sobre una instalación existente: no borra datos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- NEGOCIOS
-- ---------------------------------------------------------------------
create table if not exists negocios (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  tipo text not null check (tipo in ('restaurante','ropa','tienda','otro')),
  eslogan text,
  logo_url text,
  razon_social text,
  nit text,
  regimen text,
  responsabilidades_tributarias text,
  direccion text,
  ciudad text default 'Villa Rica, Cauca',
  telefono text,
  whatsapp text,
  correo text,
  horarios text,
  mensaje_comprobante text default '¡Gracias por su compra!',
  impresion jsonb not null default '{"formato":"80mm","mostrar_logo":true}',
  tema text not null default 'restaurante' check (tema in ('restaurante','boutique','tienda')),
  modulos jsonb not null default '{}',
  fe_proveedor text,
  fe_ambiente text default 'pruebas' check (fe_ambiente in ('pruebas','produccion')),
  activo boolean not null default true,
  orden int not null default 0,
  creado_en timestamptz not null default now()
);

-- El restaurante hereda los datos que ya estaban configurados
insert into negocios (codigo, nombre, tipo, eslogan, logo_url, razon_social, nit, regimen, responsabilidades_tributarias,
                      direccion, ciudad, telefono, whatsapp, correo, horarios, mensaje_comprobante, impresion, tema, modulos,
                      fe_proveedor, fe_ambiente, orden)
select 'RESTAURANTE', 'Restaurante Johoanna Possu', 'restaurante', 'Comida casera y tradicional',
       coalesce(c.logo_url, '/logos/restaurante.jpg'), c.razon_social, c.nit, c.regimen, c.responsabilidades_tributarias,
       c.direccion, c.ciudad, c.telefono, c.whatsapp, c.correo, c.horarios, c.mensaje_comprobante, c.impresion, 'restaurante',
       '{"mesas":true,"cocina":true,"recetas":true,"domicilios":true,"variantes":false,"presentaciones":false,"cuentas":false}',
       c.fe_proveedor, c.fe_ambiente, 1
from config_empresa c where c.id = 1
on conflict (codigo) do nothing;

insert into negocios (codigo, nombre, tipo, eslogan, logo_url, direccion, whatsapp, mensaje_comprobante, tema, modulos, orden) values
('ROPA', 'Variedades Johanna', 'ropa', 'Moda y estilo para ti', '/logos/variedades-johanna.svg', null, '3187685197',
 '¡Gracias por tu compra! Cambios dentro de los 8 días siguientes con este comprobante y la prenda en buen estado.', 'boutique',
 '{"mesas":false,"cocina":false,"recetas":false,"domicilios":true,"variantes":true,"presentaciones":false,"cuentas":true}', 2),
('TIENDA', 'Tienda Johoanna', 'tienda', 'Bien fría, siempre', '/logos/tienda.svg', 'Villa Rica, Cauca — Referencia: Bomba Texaco', '3187685197',
 '¡Gracias por tu compra! Vuelve pronto.', 'tienda',
 '{"mesas":false,"cocina":false,"recetas":false,"domicilios":true,"variantes":false,"presentaciones":true,"cuentas":true}', 3)
on conflict (codigo) do nothing;

-- Configuración general = la del grupo de negocios
update config_empresa set nombre = 'Negocios Johoanna Possu', eslogan = 'Restaurante · Variedades · Tienda', logo_url = null
where id = 1 and nombre = 'Restaurante Johoanna Possu';

-- ---------------------------------------------------------------------
-- NEGOCIO ACTIVO (lo envía la aplicación en el encabezado x-negocio)
-- Solo AÍSLA lo que se ve; los permisos siguen validándose aparte.
-- ---------------------------------------------------------------------
create or replace function negocio_actual() returns uuid
language plpgsql stable as $$
declare v text;
begin
  v := nullif(current_setting('request.headers', true), '')::json->>'x-negocio';
  return nullif(v, '')::uuid;
exception when others then
  return null;
end $$;


-- ---------------------------------------------------------------------
-- SEDES POR NEGOCIO
-- ---------------------------------------------------------------------
alter table sedes add column if not exists negocio_id uuid references negocios(id);
update sedes set negocio_id = (select id from negocios where codigo = 'RESTAURANTE') where negocio_id is null;

create or replace function sede_negocio(s uuid) returns uuid
language sql stable security definer set search_path = public as
$$ select negocio_id from sedes where id = s $$;

insert into sedes (codigo, nombre, direccion, whatsapp, negocio_id)
select 'TIENDA', 'Tienda (junto al restaurante)', 'Villa Rica, Cauca — Referencia: Bomba Texaco', '3187685197', id
from negocios where codigo = 'TIENDA' on conflict (codigo) do nothing;
insert into sedes (codigo, nombre, direccion, whatsapp, negocio_id)
select 'ROPA', 'Variedades Johanna', 'Por definir', '3187685197', id
from negocios where codigo = 'ROPA' on conflict (codigo) do nothing;
insert into cajas (sede_id, nombre) select id, 'Caja principal' from sedes where codigo in ('TIENDA','ROPA') on conflict do nothing;

create or replace function puede_negocio(n uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_superadmin() or exists (select 1 from sedes s where s.negocio_id = n and puede_sede(s.id));
$$;

create or replace function en_negocio_activo(n uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select n is null or (puede_negocio(n) and (negocio_actual() is null or n = negocio_actual()));
$$;

-- ---------------------------------------------------------------------
-- CATÁLOGOS POR NEGOCIO
-- ---------------------------------------------------------------------
alter table categorias add column if not exists negocio_id uuid references negocios(id);
alter table productos add column if not exists negocio_id uuid references negocios(id);
alter table productos add column if not exists codigo_barras text;
alter table insumos add column if not exists negocio_id uuid references negocios(id);
alter table proveedores add column if not exists negocio_id uuid references negocios(id);
alter table clientes add column if not exists negocio_id uuid references negocios(id);
alter table recetas add column if not exists negocio_id uuid references negocios(id);
alter table resoluciones add column if not exists negocio_id uuid references negocios(id);

do $$
declare r uuid := (select id from negocios where codigo = 'RESTAURANTE');
begin
  update categorias set negocio_id = r where negocio_id is null and tipo <> 'gasto';
  update productos set negocio_id = r where negocio_id is null;
  update insumos set negocio_id = r where negocio_id is null;
  update proveedores set negocio_id = r where negocio_id is null;
  update clientes set negocio_id = r where negocio_id is null;
  update recetas set negocio_id = r where negocio_id is null;
end $$;

-- Códigos únicos por negocio (no globales)
alter table productos drop constraint if exists productos_codigo_key;
alter table insumos drop constraint if exists insumos_codigo_key;
alter table categorias drop constraint if exists categorias_nombre_tipo_key;
create unique index if not exists productos_negocio_codigo on productos (negocio_id, codigo);
create unique index if not exists insumos_negocio_codigo on insumos (negocio_id, codigo);
create unique index if not exists categorias_negocio_nombre on categorias (coalesce(negocio_id, '00000000-0000-0000-0000-000000000000'::uuid), nombre, tipo);

-- Asigna el negocio activo al crear registros
create or replace function fn_negocio_defecto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.negocio_id is null then
    if TG_TABLE_NAME = 'categorias' then
      if NEW.tipo = 'gasto' then return NEW; end if;
    end if;
    if TG_TABLE_NAME = 'recetas' then
      NEW.negocio_id := coalesce((select negocio_id from productos where id = NEW.producto_id),
                                 (select negocio_id from insumos where id = NEW.insumo_resultado_id));
    end if;
    NEW.negocio_id := coalesce(NEW.negocio_id, negocio_actual());
    if NEW.negocio_id is null and TG_TABLE_NAME <> 'resoluciones' then
      raise exception 'Entra primero a un negocio para crear este registro.';
    end if;
  end if;
  if NEW.negocio_id is not null and auth.uid() is not null and not puede_negocio(NEW.negocio_id) then
    raise exception 'No tienes acceso a este negocio.' using errcode = '42501';
  end if;
  return NEW;
end $$;

do $$
declare t text;
begin
  foreach t in array array['categorias','productos','insumos','proveedores','clientes','recetas','resoluciones','sedes'] loop
    execute format('drop trigger if exists negocio_defecto_%1$s on %1$I', t);
    execute format('create trigger negocio_defecto_%1$s before insert on %1$I for each row execute function fn_negocio_defecto()', t);
  end loop;
end $$;

-- Categorías iniciales de los nuevos negocios
insert into categorias (nombre, tipo, orden, negocio_id)
select c.nombre, c.tipo, c.orden, n.id from negocios n,
  (values ('Blusas','producto',1),('Camisas','producto',2),('Camisetas','producto',3),('Pantalones','producto',4),('Jeans','producto',5),
          ('Vestidos','producto',6),('Faldas y shorts','producto',7),('Ropa interior','producto',8),('Infantil','producto',9),
          ('Calzado','producto',10),('Accesorios','producto',11),('Mercancía','insumo',1)) c(nombre, tipo, orden)
where n.codigo = 'ROPA' on conflict do nothing;
insert into categorias (nombre, tipo, orden, negocio_id)
select c.nombre, c.tipo, c.orden, n.id from negocios n,
  (values ('Cervezas','producto',1),('Gaseosas','producto',2),('Aguas y jugos','producto',3),('Bebidas energizantes','producto',4),
          ('Licores','producto',5),('Snacks','producto',6),('Cigarrillos','producto',7),('Hielo','producto',8),('Otros','producto',9),
          ('Bebidas','insumo',1),('Abarrotes','insumo',2),('Otros','insumo',3)) c(nombre, tipo, orden)
where n.codigo = 'TIENDA' on conflict do nothing;

-- ---------------------------------------------------------------------
-- OPCIONES DE PRODUCTO: variantes (talla/color) y presentaciones
-- (unidad, paca, canasta…). Cada una puede tener su código de barras.
-- ---------------------------------------------------------------------
create table if not exists producto_opciones (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id) on delete cascade,
  tipo text not null check (tipo in ('variante','presentacion')),
  nombre text not null,
  talla text,
  color text,
  factor numeric not null default 1 check (factor > 0),   -- unidades que descuenta (paca x24 = 24)
  precio numeric check (precio >= 0),                      -- nulo = precio del producto × factor
  codigo_barras text,
  insumo_id uuid references insumos(id),                    -- inventario propio (cada talla/color)
  activo boolean not null default true,
  orden int not null default 0,
  creado_en timestamptz not null default now()
);
create index if not exists producto_opciones_producto on producto_opciones (producto_id);

alter table pedido_items add column if not exists opcion_id uuid references producto_opciones(id);
alter table pedidos add column if not exists nombre_cuenta text;
alter table pedidos drop constraint if exists pedidos_tipo_servicio_check;
alter table pedidos add constraint pedidos_tipo_servicio_check check (tipo_servicio in ('mesa','llevar','recoger','domicilio','mostrador','cuenta'));

-- Un código de barras no se puede repetir dentro del mismo negocio
create or replace function fn_validar_codigo_barras() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_neg uuid; v_cod text;
begin
  v_cod := nullif(trim(NEW.codigo_barras), '');
  NEW.codigo_barras := v_cod;
  if v_cod is null then return NEW; end if;
  if TG_TABLE_NAME = 'productos' then
    v_neg := NEW.negocio_id;
  else
    v_neg := (select negocio_id from productos where id = NEW.producto_id);
  end if;
  if exists (select 1 from productos p where p.negocio_id = v_neg and p.codigo_barras = v_cod and p.id <> NEW.id)
     or exists (select 1 from producto_opciones o join productos p on p.id = o.producto_id
                where p.negocio_id = v_neg and o.codigo_barras = v_cod and o.id <> NEW.id) then
    raise exception 'El código de barras % ya está asignado a otro producto de este negocio.', v_cod;
  end if;
  return NEW;
end $$;
drop trigger if exists validar_codigo_barras on productos;
create trigger validar_codigo_barras before insert or update of codigo_barras on productos for each row execute function fn_validar_codigo_barras();
drop trigger if exists validar_codigo_barras on producto_opciones;
create trigger validar_codigo_barras before insert or update of codigo_barras on producto_opciones for each row execute function fn_validar_codigo_barras();
drop trigger if exists auditar_producto_opciones on producto_opciones;
create trigger auditar_producto_opciones after insert or update or delete on producto_opciones for each row execute function fn_auditar();
drop trigger if exists auditar_negocios on negocios;
create trigger auditar_negocios after insert or update or delete on negocios for each row execute function fn_auditar();

-- Genera un código EAN-13 interno (prefijo 2, uso interno de la tienda)
create or replace function generar_codigo_barras() returns text
language plpgsql security definer set search_path = public as $$
declare v_base text; v_suma int := 0; i int; v_dig int;
begin
  loop
    v_base := '29' || lpad(siguiente_consecutivo(null, 'ean')::text, 10, '0');
    v_suma := 0;
    for i in 1..12 loop
      v_dig := substr(v_base, i, 1)::int;
      v_suma := v_suma + case when i % 2 = 0 then v_dig * 3 else v_dig end;
    end loop;
    v_base := v_base || ((10 - v_suma % 10) % 10)::text;
    exit when not exists (select 1 from productos where codigo_barras = v_base)
          and not exists (select 1 from producto_opciones where codigo_barras = v_base);
  end loop;
  return v_base;
end $$;

-- Crea las combinaciones talla × color con su inventario y su código de barras
create or replace function generar_variantes(p_producto uuid, p_tallas text[], p_colores text[], p_precio numeric default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_p productos; t text; c text; v_ins uuid; v_n int := 0; v_nombre text; v_cat uuid; v_und uuid;
begin
  perform requerir('productos.gestionar');
  select * into v_p from productos where id = p_producto;
  if v_p.id is null or not puede_negocio(v_p.negocio_id) then raise exception 'Producto no encontrado.'; end if;
  if coalesce(array_length(p_tallas, 1), 0) = 0 then p_tallas := array['Única']; end if;
  if coalesce(array_length(p_colores, 1), 0) = 0 then p_colores := array['Único']; end if;
  v_cat := (select id from categorias where negocio_id = v_p.negocio_id and tipo = 'insumo' order by orden limit 1);
  v_und := (select id from unidades where abreviatura = 'und');
  foreach t in array p_tallas loop
    foreach c in array p_colores loop
      t := trim(t); c := trim(c);
      continue when t = '' or c = '';
      v_nombre := concat_ws(' / ', nullif(t, 'Única'), nullif(c, 'Único'));
      if v_nombre = '' then v_nombre := 'Única'; end if;
      continue when exists (select 1 from producto_opciones where producto_id = p_producto and tipo = 'variante'
                            and coalesce(talla, '') = t and coalesce(color, '') = c);
      insert into insumos (codigo, nombre, categoria_id, unidad_id, costo_unitario, minimo, negocio_id)
      values (left(upper(v_p.codigo || '-' || regexp_replace(t || '-' || c, '\s+', '', 'g')), 60),
              v_p.nombre || ' · ' || v_nombre, v_cat, v_und, coalesce(v_p.costo_estimado, 0), 1, v_p.negocio_id)
      returning id into v_ins;
      insert into producto_opciones (producto_id, tipo, nombre, talla, color, factor, precio, codigo_barras, insumo_id, orden)
      values (p_producto, 'variante', v_nombre, t, c, 1, p_precio, generar_codigo_barras(), v_ins, v_n);
      v_n := v_n + 1;
    end loop;
  end loop;
  update productos set control_inventario = 'directo', va_a_cocina = false where id = p_producto;
  return v_n;
end $$;

-- Busca un código leído con la pistola (código de barras o código interno)
create or replace function buscar_codigo_barras(p_codigo text, p_sede uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_neg uuid := sede_negocio(p_sede); v_cod text := trim(p_codigo); r jsonb;
begin
  perform requerir_sede(p_sede);
  select jsonb_build_object('producto_id', p.id, 'opcion_id', o.id, 'nombre', p.nombre || ' · ' || o.nombre,
           'precio', coalesce(o.precio, coalesce(ps.precio, p.precio) * o.factor), 'factor', o.factor,
           'insumo_id', coalesce(o.insumo_id, p.insumo_id), 'cantidad_insumo', case when o.insumo_id is not null then o.factor else o.factor * p.cantidad_insumo end,
           'disponible', _producto_disponible(p.id, p_sede))
    into r
  from producto_opciones o join productos p on p.id = o.producto_id
  left join producto_sedes ps on ps.producto_id = p.id and ps.sede_id = p_sede
  where p.negocio_id = v_neg and o.activo and o.codigo_barras = v_cod limit 1;
  if r is not null then return r; end if;
  select jsonb_build_object('producto_id', p.id, 'opcion_id', null, 'nombre', p.nombre, 'precio', coalesce(ps.precio, p.precio), 'factor', 1,
           'insumo_id', p.insumo_id, 'cantidad_insumo', p.cantidad_insumo, 'disponible', _producto_disponible(p.id, p_sede),
           'requiere_opcion', exists (select 1 from producto_opciones x where x.producto_id = p.id and x.activo and x.tipo = 'variante'))
    into r
  from productos p left join producto_sedes ps on ps.producto_id = p.id and ps.sede_id = p_sede
  where p.negocio_id = v_neg and (p.codigo_barras = v_cod or upper(p.codigo) = upper(v_cod)) limit 1;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- VENTAS: opciones, cuentas abiertas y validación de negocio
-- ---------------------------------------------------------------------
drop function if exists crear_pedido(uuid, text, uuid, uuid, text, jsonb);
create or replace function crear_pedido(p_sede uuid, p_tipo text, p_mesa uuid default null, p_cliente uuid default null,
  p_observaciones text default null, p_domicilio jsonb default null, p_nombre_cuenta text default null) returns uuid
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
  elsif p_tipo = 'cuenta' then
    if coalesce(trim(p_nombre_cuenta), '') = '' and p_cliente is null then raise exception 'Escribe a nombre de quién es la cuenta.'; end if;
  end if;
  if p_cliente is not null and (select negocio_id from clientes where id = p_cliente) is distinct from sede_negocio(p_sede) then
    raise exception 'El cliente no pertenece a este negocio.';
  end if;
  v_num := siguiente_consecutivo(p_sede, 'pedido');
  insert into pedidos (sede_id, numero, tipo_servicio, mesa_id, cliente_id, usuario_id, observaciones, valor_domicilio, nombre_cuenta)
  values (p_sede, v_num, p_tipo, case when p_tipo = 'mesa' then p_mesa end, p_cliente, auth.uid(), p_observaciones,
          coalesce((p_domicilio->>'valor_domicilio')::numeric, 0),
          coalesce(nullif(trim(p_nombre_cuenta), ''), (select nombre from clientes where id = p_cliente)))
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
declare v_ped pedidos; it jsonb; v_p productos; v_o producto_opciones; v_cant numeric; v_precio numeric; v_desc numeric;
        v_pct numeric; v_incl boolean; v_nombre text; v_cocina boolean; v_personal boolean; v_hay_cocina boolean := false;
        v_neg uuid;
begin
  perform requerir('pos.vender');
  v_ped := _pedido_abierto(p_pedido);
  v_neg := sede_negocio(v_ped.sede_id);
  for it in select * from jsonb_array_elements(p_items) loop
    v_cant := coalesce((it->>'cantidad')::numeric, 1);
    if v_cant <= 0 then raise exception 'La cantidad debe ser mayor a cero.'; end if;
    v_pct := 0; v_incl := true; v_personal := false; v_o := null;
    if nullif(it->>'producto_id', '') is not null then
      select * into v_p from productos where id = (it->>'producto_id')::uuid;
      if v_p.negocio_id is distinct from v_neg then raise exception 'El producto no pertenece a este negocio.'; end if;
      if not _producto_disponible(v_p.id, v_ped.sede_id) then
        raise exception 'El producto "%" no está disponible en este momento.', coalesce(v_p.nombre, '?');
      end if;
      v_nombre := v_p.nombre;
      v_precio := coalesce((select precio from producto_sedes where producto_id = v_p.id and sede_id = v_ped.sede_id), v_p.precio);
      if nullif(it->>'opcion_id', '') is not null then
        select * into v_o from producto_opciones where id = (it->>'opcion_id')::uuid and producto_id = v_p.id and activo;
        if v_o.id is null then raise exception 'La opción elegida no es válida para "%".', v_p.nombre; end if;
        v_nombre := v_p.nombre || ' · ' || v_o.nombre;
        v_precio := coalesce(v_o.precio, v_precio * v_o.factor);
      elsif exists (select 1 from producto_opciones where producto_id = v_p.id and activo and tipo = 'variante') then
        raise exception 'Elige la talla y el color de "%".', v_p.nombre;
      end if;
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
    insert into pedido_items (pedido_id, producto_id, opcion_id, nombre, cantidad, precio_unitario, descuento, impuesto_pct,
                              impuesto_incluido, observaciones, personalizado, va_a_cocina, creado_por)
    values (p_pedido, case when v_personal then null else v_p.id end, v_o.id, v_nombre, v_cant, v_precio, v_desc, v_pct, v_incl,
            nullif(trim(it->>'observaciones'), ''), v_personal, v_cocina, auth.uid());
    v_hay_cocina := v_hay_cocina or v_cocina;
  end loop;
  if v_hay_cocina and v_ped.estado in ('listo','entregado') then
    update pedidos set estado = 'pendiente' where id = p_pedido;
  end if;
  perform _recalcular_pedido(p_pedido);
end $$;

-- Al cerrar, una cuenta/apartado sin cocina queda entregada
create or replace function _cerrar_pedido(p_pedido uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_cocina boolean;
begin
  select * into v_ped from pedidos where id = p_pedido;
  select exists (select 1 from pedido_items where pedido_id = p_pedido and estado = 'activo' and va_a_cocina) into v_cocina;
  update pedidos set estado_pago = 'pagado', cerrado_en = now(),
         comprobante_numero = siguiente_consecutivo(v_ped.sede_id, 'comprobante'),
         estado = case when not v_cocina and estado = 'pendiente' and tipo_servicio <> 'domicilio' then 'entregado' else estado end
  where id = p_pedido;
  perform _descontar_inventario_pedido(p_pedido);
  if v_ped.mesa_id is not null then perform _liberar_mesa(v_ped.mesa_id); end if;
  perform _auditar('venta', 'pedidos', p_pedido::text, v_ped.sede_id, null,
    jsonb_build_object('numero', v_ped.numero, 'total', v_ped.total));
end $$;

-- Consumo de inventario de una línea (con variantes y presentaciones)
create or replace function _consumo_item(p_item uuid, p_cantidad numeric)
returns table (r_insumo uuid, r_cantidad numeric, r_costo numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_pr productos; v_rec uuid; v_it pedido_items; v_o producto_opciones; v_factor numeric := 1;
begin
  select * into v_it from pedido_items where id = p_item;
  if v_it.producto_id is null then return; end if;
  select * into v_pr from productos where id = v_it.producto_id;
  if v_it.opcion_id is not null then
    select * into v_o from producto_opciones where id = v_it.opcion_id;
    v_factor := coalesce(v_o.factor, 1);
    if v_o.insumo_id is not null then
      return query select v_o.insumo_id, v_factor * p_cantidad, i.costo_unitario from insumos i where i.id = v_o.insumo_id;
      return;
    end if;
  end if;
  if v_pr.control_inventario = 'receta' then
    select id into v_rec from recetas where producto_id = v_pr.id and activa;
    if v_rec is not null then
      return query select * from consumo_receta(v_rec, p_cantidad * v_factor);
    end if;
  elsif v_pr.control_inventario = 'directo' and v_pr.insumo_id is not null then
    return query select v_pr.insumo_id, v_pr.cantidad_insumo * v_factor * p_cantidad, i.costo_unitario from insumos i where i.id = v_pr.insumo_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- AJUSTES DE FUNCIONES EXISTENTES PARA RESPETAR EL NEGOCIO
-- ---------------------------------------------------------------------
create or replace function _sede_ok(p_fila uuid, p_filtro uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_filtro is not null then p_fila = p_filtro
              else puede_sede(p_fila) and (negocio_actual() is null or sede_negocio(p_fila) = negocio_actual()) end
$$;

create or replace function costos_productos() returns table (producto_id uuid, costo numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform requerir('productos.costos');
  return query select p.id, costo_producto(p.id) from productos p
               where puede_negocio(p.negocio_id) and (negocio_actual() is null or p.negocio_id = negocio_actual());
end $$;

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
  where i.activo and i.negocio_id = sede_negocio(p_sede) and (p_categoria is null or i.categoria_id = p_categoria);
  return v_id;
end $$;

-- Caja: una caja abierta por persona EN CADA SEDE (el restaurante y la tienda
-- pueden atenderse al tiempo, cada uno con su propio dinero)
drop index if exists usuario_una_sesion_abierta;
create unique index if not exists usuario_una_sesion_abierta_sede on caja_sesiones (usuario_id, sede_id) where estado = 'abierta';

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
  if exists (select 1 from caja_sesiones where usuario_id = auth.uid() and sede_id = v_c.sede_id and estado = 'abierta') then
    raise exception 'Ya tienes una caja abierta en esta sede. Ciérrala antes de abrir otra.';
  end if;
  insert into caja_sesiones (caja_id, sede_id, usuario_id, saldo_inicial, denominaciones_apertura, observaciones_apertura)
  values (p_caja, v_c.sede_id, auth.uid(), coalesce(p_saldo, 0), p_denominaciones, p_obs) returning id into v_id;
  perform _auditar('apertura_caja', 'caja_sesiones', v_id::text, v_c.sede_id, null,
    jsonb_build_object('caja', v_c.nombre, 'saldo_inicial', p_saldo));
  return v_id;
end $$;

-- Transferencias solo entre sedes del mismo negocio
create or replace function fn_transferencia_mismo_negocio() returns trigger language plpgsql as $$
begin
  if sede_negocio(NEW.sede_origen_id) is distinct from sede_negocio(NEW.sede_destino_id) then
    raise exception 'Las transferencias solo se permiten entre sedes del mismo negocio.';
  end if;
  return NEW;
end $$;
drop trigger if exists transferencia_mismo_negocio on transferencias;
create trigger transferencia_mismo_negocio before insert on transferencias for each row execute function fn_transferencia_mismo_negocio();

-- Sesión: incluye los negocios a los que tiene acceso
create or replace function mi_sesion() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', pf.id, 'nombre', pf.nombre, 'usuario', pf.usuario, 'correo', pf.correo, 'activo', pf.activo,
    'rol', r.nombre, 'todas_las_sedes', coalesce(r.todas_las_sedes, false), 'sede_principal_id', pf.sede_principal_id,
    'superadmin', es_superadmin(),
    'permisos', coalesce((select jsonb_agg(p.codigo) from permisos p where tiene_permiso(p.codigo)), '[]'::jsonb),
    'sedes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'codigo', s.codigo, 'negocio_id', s.negocio_id) order by s.nombre)
                       from sedes s where s.activa and puede_sede(s.id)), '[]'::jsonb),
    'negocios', coalesce((select jsonb_agg(to_jsonb(n) order by n.orden, n.nombre)
                          from negocios n where n.activo and puede_negocio(n.id)), '[]'::jsonb)
  )
  from perfiles pf left join roles r on r.id = pf.rol_id
  where pf.id = auth.uid();
$$;

-- Al crear el primer usuario, su sede principal es la del restaurante
-- (sin cambios de lógica; se conserva la función original)

-- ---------------------------------------------------------------------
-- PANEL GENERAL: resumen de todos los negocios, sin mezclarlos
-- ---------------------------------------------------------------------
create or replace function dashboard_general(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_hoy date := hoy(); v_fin boolean := tiene_permiso('reportes.financieros'); v jsonb;
begin
  perform requerir('dashboard.ver');
  with neg as (select * from negocios n where n.activo and puede_negocio(n.id)),
  ven as (
    select s.negocio_id, p.total - p.devuelto as total, (p.cerrado_en at time zone 'America/Bogota')::date as dia,
           coalesce((select sum(pi.costo_unitario * pi.cantidad) from pedido_items pi where pi.pedido_id = p.id and pi.estado = 'activo'), 0) as costo
    from pedidos p join sedes s on s.id = p.sede_id
    where p.estado_pago = 'pagado' and puede_sede(p.sede_id)
      and p.cerrado_en >= _rango_ini(least(p_desde, date_trunc('month', v_hoy)::date)) and p.cerrado_en < _rango_fin(greatest(p_hasta, v_hoy))
  ),
  gas as (
    select s.negocio_id, g.valor, g.fecha, g.compra_id from gastos g join sedes s on s.id = g.sede_id
    where not g.anulado and puede_sede(g.sede_id) and g.fecha between least(p_desde, v_hoy) and greatest(p_hasta, v_hoy)
  )
  select jsonb_build_object(
    'negocios', coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id, 'codigo', n.codigo, 'nombre', n.nombre, 'tipo', n.tipo, 'tema', n.tema, 'logo_url', n.logo_url, 'eslogan', n.eslogan,
      'ventas', (select coalesce(sum(total), 0) from ven where negocio_id = n.id and dia between p_desde and p_hasta),
      'pedidos', (select count(*) from ven where negocio_id = n.id and dia between p_desde and p_hasta),
      'ventas_hoy', (select coalesce(sum(total), 0) from ven where negocio_id = n.id and dia = v_hoy),
      'ventas_mes', (select coalesce(sum(total), 0) from ven where negocio_id = n.id and dia >= date_trunc('month', v_hoy)::date),
      'gastos', (select coalesce(sum(valor), 0) from gas where negocio_id = n.id and fecha between p_desde and p_hasta),
      'ganancia', case when v_fin then
          (select coalesce(sum(total - costo), 0) from ven where negocio_id = n.id and dia between p_desde and p_hasta)
          - (select coalesce(sum(valor), 0) from gas where negocio_id = n.id and compra_id is null and fecha between p_desde and p_hasta) end,
      'caja', (select coalesce(sum(cs.saldo_inicial + coalesce((select sum(m.valor) from caja_movimientos m left join metodos_pago mp on mp.id = m.metodo_id
                 where m.sesion_id = cs.id and coalesce(mp.es_efectivo, true)), 0)), 0)
               from caja_sesiones cs join sedes s on s.id = cs.sede_id where cs.estado = 'abierta' and s.negocio_id = n.id and puede_sede(cs.sede_id)),
      'cajas_abiertas', (select count(*) from caja_sesiones cs join sedes s on s.id = cs.sede_id where cs.estado = 'abierta' and s.negocio_id = n.id),
      'cuentas_abiertas', (select jsonb_build_object('cantidad', count(*), 'valor', coalesce(sum(p.total - p.pagado), 0))
               from pedidos p join sedes s on s.id = p.sede_id where s.negocio_id = n.id and puede_sede(p.sede_id)
               and p.estado <> 'cancelado' and p.estado_pago in ('abierto','parcial')),
      'inventario', (select coalesce(round(sum(inv.cantidad * inv.costo_promedio)), 0) from inventario inv join sedes s on s.id = inv.sede_id
               where inv.cantidad > 0 and s.negocio_id = n.id and puede_sede(inv.sede_id)),
      'agotados', (select count(*) from inventario inv join insumos i on i.id = inv.insumo_id join sedes s on s.id = inv.sede_id
               where i.activo and inv.cantidad <= 0 and s.negocio_id = n.id),
      'bajos', (select count(*) from inventario inv join insumos i on i.id = inv.insumo_id join sedes s on s.id = inv.sede_id
               where i.activo and inv.cantidad > 0 and inv.cantidad <= coalesce(inv.minimo, i.minimo) and s.negocio_id = n.id),
      'serie', (select coalesce(jsonb_agg(jsonb_build_object('dia', d::date, 'ventas',
                  (select coalesce(sum(total), 0) from ven where negocio_id = n.id and dia = d::date)) order by d), '[]'::jsonb)
                from generate_series(p_desde, p_hasta, interval '1 day') d)
    ) order by n.orden, n.nombre), '[]'::jsonb)
  ) into v
  from neg n;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- SEGURIDAD: cada negocio solo ve lo suyo (políticas RESTRICTIVAS que
-- se suman a las existentes) + permisos de las tablas nuevas
-- ---------------------------------------------------------------------
alter table negocios enable row level security;
alter table producto_opciones enable row level security;

drop policy if exists lee on negocios;
create policy lee on negocios for select using (true);
drop policy if exists crea on negocios;
create policy crea on negocios for insert to authenticated with check (es_superadmin());
drop policy if exists edita on negocios;
create policy edita on negocios for update to authenticated
  using (es_superadmin() or (puede_negocio(id) and tiene_permiso('configuracion.gestionar')));

drop policy if exists lee on producto_opciones;
create policy lee on producto_opciones for select to authenticated using (true);
drop policy if exists gestiona on producto_opciones;
create policy gestiona on producto_opciones for all to authenticated
  using (tiene_permiso('productos.gestionar')) with check (tiene_permiso('productos.gestionar'));

do $$
declare t text;
begin
  -- Catálogos con columna negocio_id
  foreach t in array array['categorias','productos','insumos','proveedores','clientes','recetas','resoluciones','sedes'] loop
    execute format('drop policy if exists negocio_activo on %I', t);
    execute format('create policy negocio_activo on %1$I as restrictive for all to authenticated using (en_negocio_activo(negocio_id)) with check (en_negocio_activo(negocio_id))', t);
  end loop;
  -- Tablas que pertenecen a una sede
  foreach t in array array['inventario','lotes','movimientos_inventario','mesas','cajas','caja_sesiones','caja_movimientos','pedidos','pagos',
                           'devoluciones','gastos','gastos_recurrentes','compras','conteos','producciones','documentos_electronicos'] loop
    execute format('drop policy if exists negocio_activo on %I', t);
    execute format('create policy negocio_activo on %1$I as restrictive for all to authenticated using (en_negocio_activo(sede_negocio(sede_id))) with check (en_negocio_activo(sede_negocio(sede_id)))', t);
  end loop;
end $$;

drop policy if exists negocio_activo on producto_opciones;
create policy negocio_activo on producto_opciones as restrictive for all to authenticated
  using (en_negocio_activo((select negocio_id from productos where id = producto_id)))
  with check (en_negocio_activo((select negocio_id from productos where id = producto_id)));
drop policy if exists negocio_activo on transferencias;
create policy negocio_activo on transferencias as restrictive for all to authenticated using (en_negocio_activo(sede_negocio(sede_origen_id)));
drop policy if exists negocio_activo on auditoria;
create policy negocio_activo on auditoria as restrictive for select to authenticated using (sede_id is null or en_negocio_activo(sede_negocio(sede_id)));

grant select, insert, update, delete on negocios, producto_opciones to authenticated;
grant select on negocios to anon;

-- ---------------------------------------------------------------------
-- Dashboard y reportes ajustados al negocio activo
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
      where (p_sede is null and ((sede_id is null and negocio_actual() is null) or (sede_id is not null and _sede_ok(sede_id, null)))) or sede_id = p_sede
      order by fecha desc limit 10) t), '[]'::jsonb));
  end if;
  return v;
end $$;

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
      from sedes s where _sede_ok(s.id, p_sede) order by 5 desc) t;
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

-- ---------------------------------------------------------------------
-- PRIVILEGIOS DE FUNCIONES
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function email_para_login(text) to anon;
grant execute on function registrar_intento_fallido(text) to anon;
grant execute on function negocio_actual() to anon;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like '\_%' loop
    execute format('revoke execute on function %s from authenticated', f.firma);
  end loop;
end $$;

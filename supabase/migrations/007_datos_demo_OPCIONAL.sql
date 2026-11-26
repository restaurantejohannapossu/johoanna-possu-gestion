-- =====================================================================
-- 007 · DATOS DE DEMOSTRACIÓN (OPCIONAL)
-- Sirven para probar el sistema. Todo queda marcado como DEMO y se puede
-- eliminar desde Configuración → "Eliminar datos de demostración".
-- Los precios y costos son ejemplos: reemplácelos por los reales.
-- =====================================================================
do $$
declare
  g uuid := (select id from unidades where abreviatura = 'g');
  kg uuid := (select id from unidades where abreviatura = 'kg');
  ml uuid := (select id from unidades where abreviatura = 'ml');
  l uuid := (select id from unidades where abreviatura = 'l');
  und uuid := (select id from unidades where abreviatura = 'und');
  c_gran uuid := (select id from categorias where tipo = 'insumo' and nombre = 'Granos y cereales');
  c_carn uuid := (select id from categorias where tipo = 'insumo' and nombre = 'Carnes y proteínas');
  c_verd uuid := (select id from categorias where tipo = 'insumo' and nombre = 'Verduras y hortalizas');
  c_frut uuid := (select id from categorias where tipo = 'insumo' and nombre = 'Frutas');
  c_lact uuid := (select id from categorias where tipo = 'insumo' and nombre = 'Lácteos y huevos');
  c_abar uuid := (select id from categorias where tipo = 'insumo' and nombre = 'Abarrotes');
  c_bebi uuid := (select id from categorias where tipo = 'insumo' and nombre = 'Bebidas');
  c_prep uuid := (select id from categorias where tipo = 'insumo' and nombre = 'Preparaciones');
  sede uuid := (select id from sedes where codigo = 'PRINCIPAL');
  v_prov uuid; r uuid; p uuid;
begin
  insert into proveedores (nombre, telefono, ciudad, productos_suministrados, es_demo)
  values ('DEMO · Distribuidora del Cauca', '3000000000', 'Santander de Quilichao', 'Granos, abarrotes', true) returning id into v_prov;

  insert into insumos (codigo, nombre, categoria_id, unidad_id, costo_unitario, minimo, perecedero, es_demo, es_preparacion) values
  ('DEMO-ARR', 'Arroz', c_gran, kg, 4200, 10, false, true, false),
  ('DEMO-FRI', 'Fríjol', c_gran, kg, 9000, 5, false, true, false),
  ('DEMO-PAP', 'Papa', c_verd, kg, 2500, 10, true, true, false),
  ('DEMO-POL', 'Pollo', c_carn, kg, 14000, 5, true, true, false),
  ('DEMO-RES', 'Carne de res', c_carn, kg, 26000, 5, true, true, false),
  ('DEMO-PLA', 'Plátano maduro', c_verd, und, 900, 20, true, true, false),
  ('DEMO-HUE', 'Huevo', c_lact, und, 550, 30, true, true, false),
  ('DEMO-ENS', 'Ensalada (verduras surtidas)', c_verd, kg, 5000, 3, true, true, false),
  ('DEMO-ACE', 'Aceite', c_abar, l, 9500, 3, false, true, false),
  ('DEMO-AZU', 'Azúcar', c_abar, kg, 4000, 3, false, true, false),
  ('DEMO-PUL', 'Pulpa de fruta', c_frut, kg, 8000, 3, true, true, false),
  ('DEMO-GAS', 'Gaseosa 400 ml', c_bebi, und, 1800, 24, false, true, false),
  ('DEMO-SOP', 'Sopa del día (preparada)', c_prep, ml, 0, 2000, true, true, true);

  -- Inventario inicial de demostración
  insert into inventario (insumo_id, sede_id, cantidad, costo_promedio)
  select id, sede, case codigo when 'DEMO-SOP' then 0 when 'DEMO-GAS' then 48 when 'DEMO-HUE' then 90 when 'DEMO-PLA' then 40 else 25 end,
         costo_unitario from insumos where es_demo;

  -- Preparación intermedia: Sopa del día (rinde 10.000 ml)
  insert into recetas (nombre, insumo_resultado_id, rendimiento, merma_pct, es_demo)
  values ('Sopa del día', (select id from insumos where codigo = 'DEMO-SOP'), 10000, 5, true) returning id into r;
  insert into receta_items (receta_id, insumo_id, cantidad, unidad_id) values
  (r, (select id from insumos where codigo = 'DEMO-PAP'), 2, kg),
  (r, (select id from insumos where codigo = 'DEMO-POL'), 1, kg),
  (r, (select id from insumos where codigo = 'DEMO-ENS'), 500, g);

  -- Productos de venta
  insert into productos (codigo, nombre, categoria_id, descripcion, precio, tipo, control_inventario, impuesto_id, es_demo, orden)
  values ('DEMO-ALM', 'Almuerzo corriente', (select id from categorias where tipo = 'producto' and nombre = 'Almuerzos'),
          'Sopa, arroz, proteína, papa, ensalada y jugo', 15000, 'preparado', 'receta',
          (select id from impuestos where nombre = 'Sin impuesto'), true, 1) returning id into p;
  insert into recetas (nombre, producto_id, rendimiento, es_demo) values ('Almuerzo corriente', p, 1, true) returning id into r;
  insert into receta_items (receta_id, insumo_id, cantidad, unidad_id, desperdicio_pct) values
  (r, (select id from insumos where codigo = 'DEMO-ARR'), 150, g, 0),
  (r, (select id from insumos where codigo = 'DEMO-POL'), 100, g, 5),
  (r, (select id from insumos where codigo = 'DEMO-ENS'), 80, g, 10),
  (r, (select id from insumos where codigo = 'DEMO-PAP'), 150, g, 5),
  (r, (select id from insumos where codigo = 'DEMO-SOP'), 100, ml, 0);

  insert into productos (codigo, nombre, categoria_id, descripcion, precio, tipo, control_inventario, es_demo, orden)
  values ('DEMO-BAN', 'Bandeja de fríjoles', (select id from categorias where tipo = 'producto' and nombre = 'Platos tradicionales'),
          'Fríjoles, arroz, carne, huevo y maduro', 22000, 'preparado', 'receta', true, 2) returning id into p;
  insert into recetas (nombre, producto_id, rendimiento, es_demo) values ('Bandeja de fríjoles', p, 1, true) returning id into r;
  insert into receta_items (receta_id, insumo_id, cantidad, unidad_id) values
  (r, (select id from insumos where codigo = 'DEMO-FRI'), 120, g),
  (r, (select id from insumos where codigo = 'DEMO-ARR'), 150, g),
  (r, (select id from insumos where codigo = 'DEMO-RES'), 150, g),
  (r, (select id from insumos where codigo = 'DEMO-HUE'), 1, und),
  (r, (select id from insumos where codigo = 'DEMO-PLA'), 0.5, und);

  insert into productos (codigo, nombre, categoria_id, precio, tipo, control_inventario, es_demo, orden)
  values ('DEMO-DES', 'Desayuno con calentado', (select id from categorias where tipo = 'producto' and nombre = 'Desayunos'),
          12000, 'preparado', 'ninguno', true, 3);
  update productos set costo_estimado = 5000 where codigo = 'DEMO-DES';

  insert into productos (codigo, nombre, categoria_id, precio, tipo, control_inventario, va_a_cocina, es_demo, orden)
  values ('DEMO-JUG', 'Jugo natural', (select id from categorias where tipo = 'producto' and nombre = 'Jugos naturales'),
          5000, 'preparado', 'receta', true, true, 4) returning id into p;
  insert into recetas (nombre, producto_id, rendimiento, es_demo) values ('Jugo natural', p, 1, true) returning id into r;
  insert into receta_items (receta_id, insumo_id, cantidad, unidad_id) values
  (r, (select id from insumos where codigo = 'DEMO-PUL'), 120, g),
  (r, (select id from insumos where codigo = 'DEMO-AZU'), 25, g);

  insert into productos (codigo, nombre, categoria_id, precio, tipo, control_inventario, insumo_id, cantidad_insumo, va_a_cocina, es_demo, orden)
  values ('DEMO-GAS', 'Gaseosa 400 ml', (select id from categorias where tipo = 'producto' and nombre = 'Bebidas'),
          3000, 'reventa', 'directo', (select id from insumos where codigo = 'DEMO-GAS'), 1, false, true, 5);

  insert into productos (codigo, nombre, categoria_id, precio, tipo, control_inventario, insumo_id, cantidad_insumo, es_demo, orden)
  values ('DEMO-HUA', 'Huevo adicional', (select id from categorias where tipo = 'producto' and nombre = 'Adicionales'),
          1500, 'preparado', 'directo', (select id from insumos where codigo = 'DEMO-HUE'), 1, true, 6);

  insert into clientes (nombre, telefono, direccion, barrio, es_demo)
  values ('DEMO · Cliente de prueba', '3000000001', 'Calle 1 # 2-3', 'Centro', true);
end $$;

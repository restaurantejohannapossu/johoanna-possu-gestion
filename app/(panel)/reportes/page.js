'use client';
import { useState } from 'react';
import { Play } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, TablaDatos, Alerta, Cargando } from '@/components/ui';
import { GraficoBarras, GraficoSerie, PALETA } from '@/components/graficos';
import { rpc } from '@/lib/supabase';
import { mensajeError } from '@/lib/errores';
import { hoyISO, inicioMesISO, numero, etiqueta } from '@/lib/formato';

export default function Pagina() { return <Requiere permisos={['reportes.ventas', 'reportes.inventario', 'reportes.gastos', 'reportes.financieros']}><Reportes /></Requiere>; }

const B = (x, y = 'ventas') => ({ tipo: 'barras', x, y });
const GRUPOS = [
  { nombre: 'Ventas', permiso: 'reportes.ventas', items: [
    { id: 'ventas_periodo', t: 'Ventas por periodo', agrupa: true, g: { tipo: 'serie', x: 'periodo', y: 'ventas' } },
    { id: 'ventas_sede', t: 'Ventas por sede', g: B('sede') }, { id: 'ventas_usuario', t: 'Ventas por usuario', g: B('usuario') },
    { id: 'ventas_producto', t: 'Ventas por producto', g: B('producto') }, { id: 'ventas_categoria', t: 'Ventas por categoría', g: B('categoria') },
    { id: 'ventas_metodo', t: 'Ventas por método de pago', g: B('metodo', 'total') }, { id: 'ventas_servicio', t: 'Ventas por tipo de servicio', g: B('servicio') },
    { id: 'ventas_hora', t: 'Ventas por horario', g: { tipo: 'columnas', x: 'hora', y: 'ventas' } }, { id: 'ventas_dia_semana', t: 'Ventas por día de la semana', g: { tipo: 'columnas', x: 'dia_semana', y: 'ventas' } },
    { id: 'ventas_detalle', t: 'Detalle de ventas' },
  ] },
  { nombre: 'Productos', permiso: 'reportes.ventas', items: [
    { id: 'productos_mas_vendidos', t: 'Más vendidos', g: B('producto', 'cantidad') }, { id: 'productos_menos_vendidos', t: 'Menos vendidos' },
    { id: 'productos_baja_rotacion', t: 'Baja rotación' },
  ] },
  { nombre: 'Rentabilidad de productos', permiso: 'reportes.financieros', items: [
    { id: 'productos_rentables', t: 'Más rentables', g: B('producto', 'margen') }, { id: 'productos_consumo', t: 'Mayor consumo de ingredientes', g: B('producto', 'costo_ingredientes') },
    { id: 'productos_margen_menu', t: 'Margen del menú actual', sinFecha: true },
  ] },
  { nombre: 'Inventario', permiso: 'reportes.inventario', items: [
    { id: 'inventario_actual', t: 'Inventario actual', sinFecha: true }, { id: 'inventario_valorizado', t: 'Inventario valorizado', sinFecha: true, g: B('categoria', 'valor_total') },
    { id: 'inventario_agotados', t: 'Productos agotados', sinFecha: true }, { id: 'inventario_minimo', t: 'Bajo el mínimo', sinFecha: true },
    { id: 'inventario_por_vencer', t: 'Próximos a vencer (15 días)', sinFecha: true }, { id: 'inventario_vencidos', t: 'Vencidos', sinFecha: true },
    { id: 'inventario_movimientos', t: 'Movimientos' }, { id: 'inventario_ajustes', t: 'Ajustes' }, { id: 'inventario_diferencias', t: 'Diferencias de inventario físico' },
    { id: 'inventario_desperdicios', t: 'Desperdicios y vencimientos' }, { id: 'inventario_consumo', t: 'Consumo de ingredientes', g: B('insumo', 'valor') },
    { id: 'inventario_transferencias', t: 'Transferencias' },
  ] },
  { nombre: 'Gastos', permiso: 'reportes.gastos', items: [
    { id: 'gastos_periodo', t: 'Gastos por periodo', agrupa: true, g: { tipo: 'serie', x: 'periodo', y: 'total' } },
    { id: 'gastos_sede', t: 'Gastos por sede', g: B('sede', 'total') }, { id: 'gastos_categoria', t: 'Gastos por categoría', g: B('categoria', 'total') },
    { id: 'gastos_usuario', t: 'Gastos por usuario', g: B('usuario', 'total') }, { id: 'gastos_metodo', t: 'Gastos por método de pago', g: B('metodo', 'total') },
    { id: 'gastos_detalle', t: 'Detalle de gastos' },
  ] },
  { nombre: 'Financieros', permiso: 'reportes.financieros', items: [
    { id: 'financiero_resumen', t: 'Estado de resultados estimado' }, { id: 'financiero_flujo_caja', t: 'Flujo de caja', g: { tipo: 'serie', x: 'dia', y: 'neto' } },
    { id: 'financiero_rentabilidad_sede', t: 'Rentabilidad por sede', g: B('sede', 'utilidad') }, { id: 'financiero_cuentas_por_pagar', t: 'Cuentas por pagar', sinFecha: true },
    { id: 'financiero_cierres_caja', t: 'Cierres de caja' },
  ] },
];

const MONEDA = new Set(['ventas', 'total', 'costo', 'margen', 'ticket_promedio', 'valor', 'valor_total', 'costo_promedio', 'costo_ingredientes', 'costo_unitario', 'precio',
  'ingresos', 'egresos', 'neto', 'acumulado', 'gastos', 'utilidad', 'pagado', 'saldo', 'saldo_inicial', 'saldo_esperado', 'saldo_contado', 'diferencia']);
const CANTIDADES = { inventario_movimientos: ['saldo'], inventario_ajustes: ['saldo'], inventario_desperdicios: ['saldo'], inventario_transferencias: ['saldo'], inventario_diferencias: ['diferencia'] };
const TITULOS = { ticket_promedio: 'Ticket promedio', margen_pct: 'Margen %', valor_total: 'Valor total', costo_promedio: 'Costo prom.', dia_semana: 'Día', costo_ingredientes: 'Costo ingredientes', ultima_compra: 'Última compra', saldo_inicial: 'Inicial', saldo_esperado: 'Esperado', saldo_contado: 'Contado' };

function columnas(id, filas) {
  if (!filas.length) return [];
  return Object.keys(filas[0]).map((k) => {
    const v = filas.find((f) => f[k] !== null && f[k] !== undefined)?.[k];
    let tipo = 'texto';
    if (k === 'margen_pct') tipo = 'porcentaje';
    else if (MONEDA.has(k) && !(CANTIDADES[id] || []).includes(k)) tipo = 'moneda';
    else if (['vence', 'ultima_compra', 'dia'].includes(k) || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))) tipo = 'fecha';
    else if (typeof v === 'number') tipo = 'numero';
    if (['servicio', 'tipo', 'origen'].includes(k)) tipo = 'etiqueta';
    if (['numero', 'conteo', 'comprobante'].includes(k)) tipo = 'texto';
    return { clave: k, titulo: TITULOS[k] || (k.charAt(0).toUpperCase() + k.slice(1)).replaceAll('_', ' '), tipo };
  });
}

function Reportes() {
  const { puede, sedes } = useSesion();
  const grupos = GRUPOS.filter((g) => puede(g.permiso));
  const [rep, setRep] = useState(grupos[0]?.items[0]);
  const [desde, setDesde] = useState(inicioMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [sede, setSede] = useState('');
  const [agrupar, setAgrupar] = useState('dia');
  const [res, setRes] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  async function generar(r = rep) {
    setCargando(true); setError('');
    try { setRes({ rep: r, filas: await rpc('reporte', { p_tipo: r.id, p_desde: desde, p_hasta: hasta, p_sede: sede || null, p_agrupar: agrupar }) }); }
    catch (e) { setError(mensajeError(e)); setRes(null); } finally { setCargando(false); }
  }
  const nombreSede = sede ? sedes.find((s) => s.id === sede)?.nombre : 'Todas mis sedes';
  const subtitulo = `${res?.rep.sinFecha ? 'Corte actual' : `${desde} a ${hasta}`} · ${nombreSede}`;
  const g = res?.rep.g;
  const filasGrafico = res && g ? res.filas.filter((f) => f[g.y] !== null).map((f) => ({ ...f, [g.y]: Number(f[g.y]), [g.x]: g.tipo === 'barras' || g.tipo === 'columnas' ? etiqueta(f[g.x]) : f[g.x] })) : [];

  return (
    <div>
      <Encabezado titulo="Reportes y analítica" subtitulo="Elige un reporte, ajusta los filtros y expórtalo a Excel, CSV, PDF o imprímelo" />
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <nav className="tarjeta h-fit space-y-4 p-3 lg:sticky lg:top-20">
          {grupos.map((gr) => (
            <div key={gr.nombre}>
              <p className="etiqueta px-2">{gr.nombre}</p>
              {gr.items.map((r) => (
                <button key={r.id} onClick={() => { setRep(r); generar(r); }} className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm ${rep?.id === r.id ? 'bg-vino-700 text-white' : 'text-cafe-600 hover:bg-crema-100'}`}>{r.t}</button>
              ))}
            </div>
          ))}
        </nav>
        <div>
          <div className="tarjeta mb-4 flex flex-wrap items-end gap-3 p-3">
            <div className="mr-auto"><p className="text-xs text-cafe-400">Reporte</p><p className="font-titulo text-lg font-bold">{rep?.t}</p></div>
            {!rep?.sinFecha && <>
              <label><span className="etiqueta">Desde</span><input type="date" className="input py-1.5" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
              <label><span className="etiqueta">Hasta</span><input type="date" className="input py-1.5" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
            </>}
            {rep?.agrupa && <label><span className="etiqueta">Agrupar por</span><select className="input py-1.5" value={agrupar} onChange={(e) => setAgrupar(e.target.value)}>
              <option value="dia">Día</option><option value="semana">Semana</option><option value="mes">Mes</option><option value="anio">Año</option></select></label>}
            <label><span className="etiqueta">Sede</span><select className="input py-1.5" value={sede} onChange={(e) => setSede(e.target.value)}>
              <option value="">Todas mis sedes</option>{sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
            <button className="btn-primario" onClick={() => generar()} disabled={!rep}><Play size={15} /> Generar</button>
          </div>
          {error && <Alerta tono="rojo">{error}</Alerta>}
          {cargando ? <Cargando texto="Calculando…" /> : res && (
            <>
              {g && filasGrafico.length > 1 && (
                <div className="tarjeta mb-4 p-4">
                  {g.tipo === 'serie'
                    ? <GraficoSerie datos={filasGrafico} x={g.x} series={[{ clave: g.y, nombre: g.y.charAt(0).toUpperCase() + g.y.slice(1), color: PALETA[0] }]} />
                    : <GraficoBarras datos={filasGrafico.slice(0, 15)} categoria={g.x} valor={g.y} horizontal={g.tipo === 'barras'}
                        nombre={g.y.charAt(0).toUpperCase() + g.y.replaceAll('_', ' ').slice(1)} formato={MONEDA.has(g.y) ? undefined : (v) => numero(v)} />}
                </div>
              )}
              <TablaDatos filas={res.filas.map((f, i) => ({ ...f, _i: i }))} claveFila="_i" columnas={columnas(res.rep.id, res.filas)} exportar={res.rep.t} subtitulo={subtitulo} vacio="Sin datos para estos filtros." />
            </>
          )}
          {!res && !cargando && !error && <p className="tarjeta p-8 text-center text-sm text-cafe-400">Selecciona un reporte de la lista para generarlo.</p>}
        </div>
      </div>
    </div>
  );
}

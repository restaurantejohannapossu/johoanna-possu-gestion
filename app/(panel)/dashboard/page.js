'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DollarSign, ShoppingBag, Receipt, Wallet, Boxes, AlertTriangle, TrendingUp, Clock, PackageX, CalendarClock, ClipboardList, Truck } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Kpi, Cargando, Alerta, Vacio, useCarga } from '@/components/ui';
import { GraficoSerie, GraficoBarras, BarraParticion, PALETA } from '@/components/graficos';
import { rpc, q } from '@/lib/supabase';
import { moneda, numero, hoyISO, inicioMesISO, fechaHora, fecha } from '@/lib/formato';

const PERIODOS = [
  { id: 'hoy', texto: 'Hoy', rango: () => [hoyISO(), hoyISO()] },
  { id: 'semana', texto: '7 días', rango: () => [hoyISO(-6), hoyISO()] },
  { id: 'mes', texto: 'Este mes', rango: () => [inicioMesISO(), hoyISO()] },
  { id: '30', texto: '30 días', rango: () => [hoyISO(-29), hoyISO()] },
  { id: 'anio', texto: 'Este año', rango: () => [hoyISO().slice(0, 4) + '-01-01', hoyISO()] },
];
const diaCorto = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '');

export default function Dashboard() {
  return <Requiere permisos={['dashboard.ver']}><Contenido /></Requiere>;
}

function Contenido() {
  const { sedes, perfil } = useSesion();
  const [periodo, setPeriodo] = useState('semana');
  const [rango, setRango] = useState(PERIODOS[1].rango());
  const [sede, setSede] = useState('');
  const [usuario, setUsuario] = useState('');
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => { q((sb) => sb.from('perfiles').select('id,nombre').eq('activo', true).order('nombre')).then(setUsuarios).catch(() => {}); }, []);

  const { datos: d, cargando, error } = useCarga(
    () => rpc('dashboard', { p_desde: rango[0], p_hasta: rango[1], p_sede: sede || null, p_usuario: usuario || null }),
    [rango[0], rango[1], sede, usuario]
  );

  const elegir = (p) => { setPeriodo(p.id); setRango(p.rango()); };
  const variacion = d && d.ventas_periodo_anterior > 0 ? ((d.ventas - d.ventas_periodo_anterior) / d.ventas_periodo_anterior) * 100 : null;

  return (
    <div>
      <Encabezado titulo={`Hola, ${perfil?.nombre?.split(' ')[0] || ''}`} subtitulo="Resumen del negocio en tiempo real" />

      <div className="tarjeta no-imprimir mb-5 flex flex-wrap items-end gap-3 p-3">
        <div className="flex flex-wrap gap-1">
          {PERIODOS.map((p) => (
            <button key={p.id} onClick={() => elegir(p)} className={`btn-sm btn ${periodo === p.id ? 'bg-vino-700 text-white' : 'bg-crema-100 text-cafe-600 hover:bg-crema-200'}`}>{p.texto}</button>
          ))}
        </div>
        <label className="text-xs"><span className="etiqueta">Desde</span>
          <input type="date" className="input py-1.5" value={rango[0]} onChange={(e) => { setPeriodo('x'); setRango([e.target.value, rango[1]]); }} /></label>
        <label className="text-xs"><span className="etiqueta">Hasta</span>
          <input type="date" className="input py-1.5" value={rango[1]} onChange={(e) => { setPeriodo('x'); setRango([rango[0], e.target.value]); }} /></label>
        <label className="text-xs"><span className="etiqueta">Sede</span>
          <select className="input py-1.5" value={sede} onChange={(e) => setSede(e.target.value)}>
            <option value="">Todas mis sedes</option>
            {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select></label>
        <label className="text-xs"><span className="etiqueta">Usuario</span>
          <select className="input py-1.5" value={usuario} onChange={(e) => setUsuario(e.target.value)}>
            <option value="">Todos</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select></label>
      </div>

      {error && <Alerta tono="rojo">{error}</Alerta>}
      {cargando && !d ? <Cargando /> : d && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi titulo="Ventas del día" valor={moneda(d.ventas_hoy)} detalle={`${d.pedidos_hoy} pedidos hoy`} icono={DollarSign} />
            <Kpi titulo="Ventas del mes" valor={moneda(d.ventas_mes)} icono={TrendingUp} tono="dorado" />
            <Kpi titulo="Ventas del periodo" valor={moneda(d.ventas)}
              detalle={variacion === null ? `${d.pedidos} pedidos` : `${d.pedidos} pedidos · ${variacion >= 0 ? '▲' : '▼'} ${numero(Math.abs(variacion), 1)}% vs. periodo anterior`} icono={ShoppingBag} />
            <Kpi titulo="Ticket promedio" valor={moneda(d.ticket_promedio)} icono={Receipt} tono="cafe" />
            <Kpi titulo="Gastos del día" valor={moneda(d.gastos_hoy)} detalle={`Periodo: ${moneda(d.gastos)}`} icono={Receipt} tono="rojo" />
            <Kpi titulo="Dinero en caja" valor={moneda(d.caja_actual)} detalle={`${d.cajas_abiertas} caja(s) abierta(s)`} icono={Wallet} tono="verde" />
            {d.ganancia_estimada !== undefined && (
              <Kpi titulo="Ganancia estimada" valor={moneda(d.ganancia_estimada)} detalle="Ventas − costo de ingredientes − gastos operativos" icono={TrendingUp} tono={d.ganancia_estimada >= 0 ? 'verde' : 'rojo'} />
            )}
            {d.inventario_valorizado !== undefined && <Kpi titulo="Inventario valorizado" valor={moneda(d.inventario_valorizado)} icono={Boxes} tono="dorado" />}
            <Kpi titulo="Cuentas abiertas" valor={d.cuentas_abiertas?.cantidad ?? 0} detalle={`Por cobrar: ${moneda(d.cuentas_abiertas?.valor)}`} icono={ClipboardList} tono="cafe" />
            {d.cuentas_por_pagar && <Kpi titulo="Cuentas por pagar" valor={moneda(d.cuentas_por_pagar.valor)} detalle={`${d.cuentas_por_pagar.cantidad} compra(s)`} icono={Truck} tono="rojo" />}
            {d.inventario_bajo_total !== undefined && <Kpi titulo="Inventario bajo" valor={d.inventario_bajo_total} detalle={`${d.agotados_total} agotados`} icono={AlertTriangle} tono="rojo" />}
            <Kpi titulo="Menú agotado" valor={d.productos_agotados_menu} detalle="Productos marcados agotados" icono={PackageX} tono="cafe" />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-3">
            <div className="tarjeta p-4 xl:col-span-2">
              <h3 className="mb-1 font-bold">Ventas por día</h3>
              <p className="mb-3 text-xs text-cafe-400">Comparado con el periodo anterior de la misma duración</p>
              <GraficoSerie datos={d.serie} etiquetaX={diaCorto}
                series={[{ clave: 'ventas', nombre: 'Periodo actual', color: PALETA[0] }, { clave: 'anterior', nombre: 'Periodo anterior', tipo: 'linea' }]} />
            </div>
            <div className="tarjeta p-4">
              <h3 className="mb-3 font-bold">Ingresos por método de pago</h3>
              {d.por_metodo.length ? <BarraParticion datos={d.por_metodo} etiqueta="metodo" valor="total" /> : <Vacio texto="Sin pagos en el periodo." />}
              {d.por_sede.length > 1 && (
                <>
                  <h3 className="mb-2 mt-6 font-bold">Ventas por sede</h3>
                  <GraficoBarras datos={d.por_sede} categoria="sede" valor="ventas" nombre="Ventas" />
                </>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            <div className="tarjeta p-4">
              <h3 className="mb-3 font-bold">Productos más vendidos</h3>
              {d.top_productos.length ? <GraficoBarras datos={d.top_productos} categoria="producto" valor="cantidad" nombre="Unidades" formato={(v) => numero(v)} /> : <Vacio texto="Sin ventas en el periodo." />}
            </div>
            {d.inventario_bajo && (
              <div className="tarjeta p-4">
                <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Alertas de inventario</h3><Link href="/inventario" className="text-xs text-vino-600 hover:underline">Ver inventario</Link></div>
                {d.inventario_bajo.length === 0 && d.agotados.length === 0 ? <Vacio texto="Todo el inventario está sobre el mínimo." /> : (
                  <ul className="space-y-2 text-sm">
                    {d.agotados.map((x, i) => (
                      <li key={'a' + i} className="flex items-center gap-2"><PackageX size={15} className="text-red-600" /><span className="flex-1">{x.insumo} <span className="text-xs text-cafe-400">· {x.sede}</span></span><span className="chip bg-red-100 text-red-800">Agotado</span></li>
                    ))}
                    {d.inventario_bajo.map((x, i) => (
                      <li key={'b' + i} className="flex items-center gap-2"><AlertTriangle size={15} className="text-dorado-600" /><span className="flex-1">{x.insumo} <span className="text-xs text-cafe-400">· {x.sede}</span></span>
                        <span className="text-xs tabular-nums">{numero(x.cantidad)} / {numero(x.minimo)} {x.unidad}</span></li>
                    ))}
                  </ul>
                )}
                {d.vencimientos?.length > 0 && (
                  <>
                    <h4 className="mb-2 mt-5 text-sm font-bold">Próximos a vencer</h4>
                    <ul className="space-y-1.5 text-sm">
                      {d.vencimientos.map((x, i) => (
                        <li key={i} className="flex items-center gap-2"><CalendarClock size={15} className={x.dias < 0 ? 'text-red-600' : 'text-dorado-600'} />
                          <span className="flex-1">{x.insumo} ({numero(x.cantidad)})</span>
                          <span className="text-xs">{x.dias < 0 ? 'Vencido' : x.dias === 0 ? 'Vence hoy' : `${x.dias} días`} · {fecha(x.vence)}</span></li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            {d.actividad && (
              <div className="tarjeta p-4">
                <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Actividad reciente</h3><Link href="/auditoria" className="text-xs text-vino-600 hover:underline">Ver todo</Link></div>
                <ul className="space-y-2.5 text-sm">
                  {d.actividad.map((a, i) => (
                    <li key={i} className="flex gap-2"><Clock size={14} className="mt-0.5 shrink-0 text-cafe-300" />
                      <div><p><b>{a.usuario_nombre || 'Sistema'}</b> · {a.accion.replaceAll('_', ' ')} {a.tabla ? <span className="text-cafe-400">({a.tabla})</span> : null}</p>
                        <p className="text-xs text-cafe-400">{fechaHora(a.fecha)}</p></div></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

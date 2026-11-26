'use client';
import { useState } from 'react';
import { ArrowRight, Wallet, TrendingUp, Receipt, ShoppingBag, AlertTriangle, ClipboardList, Boxes, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Kpi, Cargando, Alerta, useCarga } from '@/components/ui';
import { GraficoSerie, GraficoBarras, PALETA } from '@/components/graficos';
import { rpc } from '@/lib/supabase';
import { moneda, numero, hoyISO, inicioMesISO } from '@/lib/formato';

const PERIODOS = [
  { id: 'hoy', texto: 'Hoy', rango: () => [hoyISO(), hoyISO()] },
  { id: 'semana', texto: '7 días', rango: () => [hoyISO(-6), hoyISO()] },
  { id: 'mes', texto: 'Este mes', rango: () => [inicioMesISO(), hoyISO()] },
  { id: '30', texto: '30 días', rango: () => [hoyISO(-29), hoyISO()] },
];
const diaCorto = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '');

export default function PanelGeneral() {
  return <Requiere permisos={['dashboard.ver']}><Contenido /></Requiere>;
}

function Contenido() {
  const { perfil, entrarNegocio, puede } = useSesion();
  const [periodo, setPeriodo] = useState('semana');
  const [rango, setRango] = useState(PERIODOS[1].rango());
  const { datos, cargando, error } = useCarga(() => rpc('dashboard_general', { p_desde: rango[0], p_hasta: rango[1] }), [rango[0], rango[1]]);
  const negs = datos?.negocios || [];
  const suma = (k) => negs.reduce((s, n) => s + Number(n[k] || 0), 0);
  const conGanancia = negs.some((n) => n.ganancia !== null && n.ganancia !== undefined);
  // Serie combinada: una línea por negocio
  const serie = (negs[0]?.serie || []).map((p, i) => ({ dia: p.dia, ...Object.fromEntries(negs.map((n) => [n.codigo, Number(n.serie[i]?.ventas || 0)])) }));

  return (
    <div>
      <Encabezado titulo={`Hola, ${perfil?.nombre?.split(' ')[0] || ''}`} subtitulo="Vista general de todos los negocios. Cada uno lleva su dinero, inventario y ventas por separado.">
        {puede('configuracion.gestionar') && <Link href="/general" className="btn-secundario"><SlidersHorizontal size={15} /> Configuración general</Link>}
      </Encabezado>
      <div className="mb-5 flex flex-wrap gap-1">
        {PERIODOS.map((p) => (
          <button key={p.id} onClick={() => { setPeriodo(p.id); setRango(p.rango()); }}
            className={`btn btn-sm ${periodo === p.id ? 'bg-vino-700 text-white' : 'bg-white text-cafe-600 border border-crema-200'}`}>{p.texto}</button>
        ))}
      </div>
      {error && <Alerta tono="rojo">{error}</Alerta>}
      {cargando && !datos ? <Cargando /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi titulo="Ventas de los negocios" valor={moneda(suma('ventas'))} detalle={`${numero(suma('pedidos'))} ventas en el periodo`} icono={ShoppingBag} />
            <Kpi titulo="Ventas de hoy" valor={moneda(suma('ventas_hoy'))} detalle={`Mes: ${moneda(suma('ventas_mes'))}`} icono={TrendingUp} tono="dorado" />
            <Kpi titulo="Gastos del periodo" valor={moneda(suma('gastos'))} icono={Receipt} tono="rojo" />
            {conGanancia
              ? <Kpi titulo="Ganancia estimada" valor={moneda(suma('ganancia'))} detalle="Suma de los negocios" icono={TrendingUp} tono="verde" />
              : <Kpi titulo="Dinero en cajas" valor={moneda(suma('caja'))} icono={Wallet} tono="verde" />}
          </div>

          <h2 className="mb-3 mt-7 text-xl font-bold">Negocios</h2>
          <div className="grid gap-4 lg:grid-cols-3">
            {negs.map((n) => (
              <div key={n.id} data-tema={n.tema} className="overflow-hidden rounded-2xl border border-crema-200 bg-white shadow-suave">
                <div className="flex items-center gap-3 bg-gradient-to-r from-vino-700 to-vino-900 p-4 text-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={n.logo_url || '/logos/restaurante.jpg'} alt="" className="h-14 w-14 rounded-full bg-white object-contain p-0.5 shadow" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-titulo text-lg font-bold">{n.nombre}</p>
                    <p className="truncate text-xs text-dorado-200">{n.eslogan}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-px bg-crema-200 text-sm">
                  {[
                    ['Ventas periodo', moneda(n.ventas)], ['Hoy', moneda(n.ventas_hoy)],
                    ['Gastos', moneda(n.gastos)], n.ganancia !== null && n.ganancia !== undefined ? ['Ganancia est.', moneda(n.ganancia)] : ['Ventas', numero(n.pedidos)],
                    ['En caja', `${moneda(n.caja)}`], ['Cuentas abiertas', `${n.cuentas_abiertas?.cantidad || 0} · ${moneda(n.cuentas_abiertas?.valor)}`],
                  ].map(([t, v]) => (
                    <div key={t} className="bg-white px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-cafe-400">{t}</p><p className="font-titulo text-lg font-bold text-cafe-800">{v}</p></div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs text-cafe-500">
                  <span className="flex items-center gap-1"><Boxes size={13} /> Inventario {moneda(n.inventario)}</span>
                  {(n.agotados > 0 || n.bajos > 0) && <span className="flex items-center gap-1 text-red-700"><AlertTriangle size={13} /> {n.agotados} agotados · {n.bajos} bajos</span>}
                  <span className="flex items-center gap-1"><ClipboardList size={13} /> {n.cajas_abiertas} caja(s) abierta(s)</span>
                </div>
                <div className="px-4 pb-4">
                  <button className="btn-primario w-full py-2.5" onClick={() => entrarNegocio(n.id)}>Entrar a {n.nombre} <ArrowRight size={16} /></button>
                </div>
              </div>
            ))}
          </div>

          {negs.length > 1 && (
            <div className="mt-6 grid gap-5 xl:grid-cols-3">
              <div className="tarjeta p-4 xl:col-span-2">
                <h3 className="mb-1 font-bold">Ventas por día y por negocio</h3>
                <p className="mb-3 text-xs text-cafe-400">Cada línea es un negocio; los montos no se mezclan.</p>
                <GraficoSerie datos={serie} etiquetaX={diaCorto}
                  series={negs.map((n, i) => ({ clave: n.codigo, nombre: n.nombre, color: PALETA[i % PALETA.length], tipo: 'linea', solida: true }))} />
              </div>
              <div className="tarjeta p-4">
                <h3 className="mb-3 font-bold">Comparativo del periodo</h3>
                <GraficoBarras datos={negs.map((n) => ({ negocio: n.nombre, ventas: Number(n.ventas) }))} categoria="negocio" valor="ventas" nombre="Ventas" colorearPorCategoria />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

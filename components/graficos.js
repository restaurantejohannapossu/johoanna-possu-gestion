'use client';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, Line, ComposedChart,
} from 'recharts';
import { moneda, numero } from '@/lib/formato';

// Paleta categórica validada (orden fijo; nunca cíclica): vinotinto, dorado, verde azulado, azul, ciruela
export const PALETA = ['#9a3347', '#b77a0c', '#0b8f7e', '#4a68d8', '#a8569e'];
export const NEUTRO = '#a08876';
const eje = { fontSize: 11, fill: '#7d6352' };
const corto = (v) => (Math.abs(v) >= 1e6 ? `${numero(v / 1e6, 1)} M` : Math.abs(v) >= 1e3 ? `${numero(v / 1e3, 0)} mil` : numero(v, 0));

function Globo({ active, payload, label, formato = moneda, etiquetaX }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-crema-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-cafe-700">{etiquetaX ? etiquetaX(label) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-cafe-600">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name}: <b className="text-cafe-800">{formato(p.value)}</b>
        </p>
      ))}
    </div>
  );
}

export function GraficoSerie({ datos, x = "dia", series, alto = 260, etiquetaX }) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <ComposedChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradVino" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PALETA[0]} stopOpacity={0.25} /><stop offset="100%" stopColor={PALETA[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#f4e9d3" vertical={false} />
        <XAxis dataKey={x} tick={eje} tickLine={false} axisLine={{ stroke: '#e9d8b6' }} tickFormatter={etiquetaX} minTickGap={16} />
        <YAxis tick={eje} tickLine={false} axisLine={false} tickFormatter={corto} width={56} />
        <Tooltip content={<Globo etiquetaX={etiquetaX} />} cursor={{ stroke: '#c98f17', strokeWidth: 1 }} />
        <Legend wrapperStyle={{ fontSize: 12, color: '#5f4838' }} iconType="plainline" />
        {series.map((s, i) => s.tipo === 'linea'
          ? <Line key={s.clave} dataKey={s.clave} name={s.nombre} stroke={s.color || NEUTRO} strokeWidth={2} strokeDasharray={s.solida ? undefined : "5 4"} dot={false} activeDot={{ r: 4 }} />
          : <Area key={s.clave} dataKey={s.clave} name={s.nombre} stroke={s.color || PALETA[i]} strokeWidth={2} fill="url(#gradVino)" activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />)}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Barras de una sola serie (horizontal por defecto, para nombres largos) */
export function GraficoBarras({ datos, categoria, valor, nombre = 'Total', alto, formato = moneda, horizontal = true, color = PALETA[0], colorearPorCategoria = false }) {
  const h = alto || (horizontal ? Math.max(160, datos.length * 34 + 30) : 260);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={datos} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap={6}>
        <CartesianGrid stroke="#f4e9d3" horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={eje} tickLine={false} axisLine={false} allowDecimals={formato === moneda} tickFormatter={formato === moneda ? corto : (v) => numero(v, 0)} />
            <YAxis type="category" dataKey={categoria} tick={eje} tickLine={false} axisLine={false} width={130} />
          </>
        ) : (
          <>
            <XAxis dataKey={categoria} tick={eje} tickLine={false} axisLine={{ stroke: '#e9d8b6' }} />
            <YAxis tick={eje} tickLine={false} axisLine={false} allowDecimals={formato === moneda} tickFormatter={formato === moneda ? corto : (v) => numero(v, 0)} width={56} />
          </>
        )}
        <Tooltip content={<Globo formato={formato} />} cursor={{ fill: '#fbf5e9' }} />
        <Bar dataKey={valor} name={nombre} fill={color} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={26} stroke="#fff" strokeWidth={2}>
          {colorearPorCategoria && datos.map((_, i) => <Cell key={i} fill={PALETA[i % PALETA.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Distribución en una barra apilada horizontal con leyenda y valores (en lugar de torta) */
export function BarraParticion({ datos, etiqueta, valor, formato = moneda }) {
  const total = datos.reduce((s, d) => s + Number(d[valor] || 0), 0) || 1;
  const principales = datos.slice(0, 4);
  const resto = datos.slice(4).reduce((s, d) => s + Number(d[valor] || 0), 0);
  const filas = resto > 0 ? [...principales, { [etiqueta]: 'Otros', [valor]: resto }] : principales;
  return (
    <div>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded">
        {filas.map((d, i) => (
          <div key={i} title={`${d[etiqueta]}: ${formato(d[valor])}`} style={{ width: `${(Number(d[valor]) / total) * 100}%`, background: d[etiqueta] === 'Otros' ? NEUTRO : PALETA[i] }} />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {filas.map((d, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d[etiqueta] === 'Otros' ? NEUTRO : PALETA[i] }} />
            <span className="flex-1 text-cafe-600">{d[etiqueta]}</span>
            <span className="tabular-nums font-semibold">{formato(d[valor])}</span>
            <span className="w-12 text-right text-xs tabular-nums text-cafe-400">{numero((Number(d[valor]) / total) * 100, 1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

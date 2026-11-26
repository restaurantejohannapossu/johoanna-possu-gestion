'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Printer } from 'lucide-react';
import { q, negocioGuardado } from '@/lib/supabase';
import { moneda } from '@/lib/formato';
import { mensajeError } from '@/lib/errores';

export default function Pagina() { return <Suspense><Etiquetas /></Suspense>; }

const FORMATOS = {
  '50x25': { nombre: 'Rollo 50 × 25 mm', ancho: 50, alto: 25, pagina: '50mm 25mm' },
  '40x30': { nombre: 'Rollo 40 × 30 mm', ancho: 40, alto: 30, pagina: '40mm 30mm' },
  carta: { nombre: 'Hoja carta (3 × 10)', ancho: 66, alto: 25.4, pagina: 'letter' },
};

function esEAN13(c) {
  if (!/^\d{13}$/.test(c)) return false;
  const s = c.slice(0, 12).split('').reduce((a, d, i) => a + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (s % 10)) % 10 === Number(c[12]);
}

function CodigoBarras({ codigo, alto }) {
  const ref = useRef(null);
  useEffect(() => {
    import('jsbarcode').then(({ default: JsBarcode }) => {
      try {
        JsBarcode(ref.current, codigo, { format: esEAN13(codigo) ? 'EAN13' : 'CODE128', height: alto, width: 1.6, fontSize: 11, margin: 0, displayValue: true, flat: true });
      } catch { /* código inválido */ }
    });
  }, [codigo, alto]);
  return <svg ref={ref} className="mx-auto block max-w-full" />;
}

function Etiquetas() {
  const params = useSearchParams();
  const [items, setItems] = useState(null);
  const [formato, setFormato] = useState('50x25');
  const [mostrarPrecio, setMostrarPrecio] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const id = params.get('producto');
        const p = await q((sb) => sb.from('productos').select('id,nombre,precio,codigo_barras,producto_opciones(id,nombre,precio,factor,codigo_barras,activo,orden)').eq('id', id).single());
        const neg = negocioGuardado() ? await q((sb) => sb.from('negocios').select('nombre,tema').eq('id', negocioGuardado()).single()) : null;
        if (neg) document.documentElement.dataset.tema = neg.tema;
        const lista = [];
        if (p.codigo_barras) lista.push({ clave: p.id, nombre: p.nombre, precio: p.precio, codigo: p.codigo_barras, cantidad: 1 });
        (p.producto_opciones || []).filter((o) => o.activo && o.codigo_barras).sort((a, b) => a.orden - b.orden)
          .forEach((o) => lista.push({ clave: o.id, nombre: `${p.nombre} · ${o.nombre}`, precio: o.precio ?? p.precio * o.factor, codigo: o.codigo_barras, cantidad: 1 }));
        setItems({ lista, negocio: neg?.nombre || '' });
      } catch (e) { setError(mensajeError(e)); }
    })();
  }, [params]);
  if (error) return <p className="p-6 text-red-700">{error}</p>;
  if (!items) return <p className="p-6">Cargando…</p>;
  const f = FORMATOS[formato];
  const copias = items.lista.flatMap((it) => Array.from({ length: Math.max(0, Number(it.cantidad) || 0) }, (_, k) => ({ ...it, k })));
  const carta = formato === 'carta';
  return (
    <div className="min-h-screen bg-crema-200 p-6 print:bg-white print:p-0">
      <style>{`@page { size: ${f.pagina}; margin: ${carta ? '12mm 6mm' : '0'}; }`}</style>
      <div className="no-imprimir mx-auto mb-5 max-w-3xl rounded-xl bg-white p-4 shadow">
        <h1 className="mb-3 text-xl font-bold">Etiquetas de código de barras</h1>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {Object.entries(FORMATOS).map(([k, v]) => (
            <button key={k} onClick={() => setFormato(k)} className={`btn btn-sm ${formato === k ? 'bg-vino-700 text-white' : 'bg-crema-100 text-cafe-600'}`}>{v.nombre}</button>
          ))}
          <label className="ml-2 flex items-center gap-1 text-sm"><input type="checkbox" checked={mostrarPrecio} onChange={(e) => setMostrarPrecio(e.target.checked)} /> Mostrar precio</label>
          <button className="btn-primario btn-sm ml-auto" onClick={() => window.print()}><Printer size={14} /> Imprimir {copias.length}</button>
        </div>
        <table className="tabla">
          <thead><tr><th>Producto</th><th>Código</th><th>Cantidad de etiquetas</th></tr></thead>
          <tbody>{items.lista.map((it, i) => (
            <tr key={it.clave}><td>{it.nombre}</td><td className="font-mono text-xs">{it.codigo}</td>
              <td><input type="number" min="0" className="input w-24" value={it.cantidad} onChange={(e) => setItems({ ...items, lista: items.lista.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)) })} /></td></tr>
          ))}</tbody>
        </table>
        {items.lista.length === 0 && <p className="py-4 text-sm text-cafe-400">Este producto no tiene códigos de barras todavía.</p>}
      </div>
      <div className={carta ? 'mx-auto grid w-[204mm] grid-cols-3 gap-x-[3mm] bg-white print:w-auto' : 'flex flex-col items-center gap-2 print:gap-0'}>
        {copias.map((it, i) => (
          <div key={i} style={{ width: `${f.ancho}mm`, height: `${f.alto}mm`, breakAfter: carta ? 'auto' : 'page' }}
            className="flex flex-col justify-center overflow-hidden bg-white px-[2mm] text-center text-black shadow print:shadow-none">
            <p className="truncate text-[8px] font-bold leading-tight">{items.negocio}</p>
            <p className="truncate text-[9px] leading-tight">{it.nombre}</p>
            <CodigoBarras codigo={it.codigo} alto={carta || formato === '50x25' ? 32 : 44} />
            {mostrarPrecio && <p className="text-[11px] font-bold leading-tight">{moneda(it.precio)}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

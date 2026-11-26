'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Printer } from 'lucide-react';
import { q } from '@/lib/supabase';
import { moneda, fechaHora } from '@/lib/formato';
import { mensajeError } from '@/lib/errores';

export default function CierreCaja() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([
      q((sb) => sb.from('caja_sesiones').select('*, cajas(nombre), sedes(nombre, negocios(nombre, direccion)), perfiles!caja_sesiones_usuario_id_fkey(nombre)').eq('id', id).single()),
    ]).then(([s]) => { setD({ s, emp: s.sedes?.negocios || {} }); setTimeout(() => window.print(), 400); }).catch((e) => setError(mensajeError(e)));
  }, [id]);
  if (error) return <p className="p-6 text-red-700">{error}</p>;
  if (!d) return <p className="p-6">Cargando…</p>;
  const { s, emp } = d;
  const r = s.resumen || {};
  const F = ({ t, v, b }) => <div className={`flex justify-between ${b ? 'font-bold' : ''}`}><span>{t}</span><span>{v}</span></div>;
  return (
    <div className="min-h-screen bg-crema-200 py-6 print:bg-white print:py-0">
      <style>{'@page { size: 80mm auto; margin: 2mm; }'}</style>
      <div className="no-imprimir mb-4 text-center"><button className="btn-primario btn-sm" onClick={() => window.print()}><Printer size={14} /> Imprimir</button></div>
      <div className="mx-auto w-[72mm] bg-white p-2 font-mono text-[11px] leading-snug text-black shadow print:shadow-none">
        <p className="text-center text-[13px] font-bold">{emp.nombre}</p>
        <p className="text-center">CIERRE DE CAJA</p>
        <div className="my-2 border-y border-dashed border-black py-1">
          <p>Sede: {s.sedes?.nombre}</p><p>Caja: {s.cajas?.nombre}</p><p>Cajero: {s.perfiles?.nombre}</p>
          <p>Apertura: {fechaHora(s.abierta_en)}</p><p>Cierre: {fechaHora(s.cerrada_en)}</p>
        </div>
        <F t="Saldo inicial" v={moneda(s.saldo_inicial)} />
        <F t="Total ventas" v={moneda(r.total_ventas)} />
        <F t="  Ventas efectivo" v={moneda(r.ventas_efectivo)} />
        <F t="  Otros medios" v={moneda(r.ventas_otros_medios)} />
        {(r.por_metodo || []).map((m) => <F key={m.metodo} t={`    ${m.metodo}`} v={moneda(m.total)} />)}
        <F t="Ingresos adicionales" v={moneda(r.ingresos)} />
        <F t="Gastos y pagos" v={`-${moneda(r.gastos)}`} />
        <F t="Retiros" v={`-${moneda(r.retiros)}`} />
        <F t="Devoluciones" v={`-${moneda(r.devoluciones)}`} />
        <F t="Ajustes" v={moneda(r.ajustes)} />
        <div className="my-1 border-t border-dashed border-black" />
        <F t="EFECTIVO ESPERADO" v={moneda(s.saldo_esperado)} b />
        <F t="EFECTIVO CONTADO" v={moneda(s.saldo_contado)} b />
        <F t="DIFERENCIA" v={moneda(s.diferencia)} b />
        {s.denominaciones_cierre && (
          <div className="mt-2 border-t border-dashed border-black pt-1">
            <p className="font-bold">Conteo</p>
            {Object.entries(s.denominaciones_cierre).filter(([, v]) => Number(v) > 0).sort((a, b) => b[0] - a[0]).map(([k, v]) => <F key={k} t={`${moneda(k)} × ${v}`} v={moneda(k * v)} />)}
          </div>
        )}
        {s.observaciones_cierre && <p className="mt-2 whitespace-pre-wrap">Obs.: {s.observaciones_cierre}</p>}
        <div className="mt-8 grid grid-cols-2 gap-4 text-center"><p className="border-t border-black pt-1">Cajero</p><p className="border-t border-black pt-1">Supervisor</p></div>
      </div>
    </div>
  );
}

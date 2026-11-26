'use client';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Printer } from 'lucide-react';
import { q } from '@/lib/supabase';
import { moneda, numero, fechaHora, etiqueta } from '@/lib/formato';
import { mensajeError } from '@/lib/errores';

export default function Pagina() { return <Suspense><Comprobante /></Suspense>; }

function Comprobante() {
  const { id } = useParams();
  const params = useSearchParams();
  const [formato, setFormato] = useState(params.get('formato') || '');
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [p, items, pagos, emp, devs] = await Promise.all([
          q((sb) => sb.from('pedidos').select('*, sedes(nombre,direccion,telefono,whatsapp), clientes(nombre,documento,telefono,direccion), mesas(nombre), domicilios(*), perfiles!pedidos_usuario_id_fkey(nombre)').eq('id', id).single()),
          q((sb) => sb.from('pedido_items').select('*').eq('pedido_id', id).eq('estado', 'activo').order('creado_en')),
          q((sb) => sb.from('pagos').select('valor, recibido, cambio, referencia, metodos_pago(nombre)').eq('pedido_id', id).order('creado_en')),
          q((sb) => sb.from('config_empresa').select('*').eq('id', 1).single()),
          q((sb) => sb.from('devoluciones').select('valor, motivo, es_anulacion').eq('pedido_id', id)),
        ]);
        setD({ p, items, pagos, emp, devs });
        setFormato((f) => f || emp.impresion?.formato || '80mm');
      } catch (e) { setError(mensajeError(e)); }
    })();
  }, [id]);

  useEffect(() => {
    if (d && params.get('auto') === '1') setTimeout(() => window.print(), 400);
  }, [d, params]);

  if (error) return <p className="p-6 text-red-700">{error}</p>;
  if (!d) return <p className="p-6 text-cafe-400">Cargando comprobante…</p>;
  const { p, items, pagos, emp, devs } = d;
  const ancho = formato === '58mm' ? '48mm' : formato === '80mm' ? '72mm' : '180mm';
  const termico = formato !== 'carta';
  const cambio = pagos.reduce((s, x) => s + Number(x.cambio || 0), 0);
  const mostrarLogo = emp.impresion?.mostrar_logo !== false;

  return (
    <div className="min-h-screen bg-crema-200 py-6 print:bg-white print:py-0">
      <style>{`@page { size: ${termico ? `${formato === '58mm' ? '58mm' : '80mm'} auto` : 'letter'}; margin: ${termico ? '2mm' : '14mm'}; }`}</style>
      <div className="no-imprimir mx-auto mb-4 flex max-w-xl flex-wrap items-center justify-center gap-2">
        {['58mm', '80mm', 'carta'].map((f) => (
          <button key={f} onClick={() => setFormato(f)} className={`btn-sm btn ${formato === f ? 'bg-vino-700 text-white' : 'bg-white text-cafe-600'}`}>{f === 'carta' ? 'Carta / PDF' : f}</button>
        ))}
        <button className="btn-primario btn-sm" onClick={() => window.print()}><Printer size={14} /> Imprimir / Guardar PDF</button>
      </div>

      <div style={{ width: ancho }} className={`mx-auto bg-white text-black shadow-lg print:shadow-none ${termico ? 'p-2 font-mono text-[11px] leading-snug' : 'p-10 text-sm'}`}>
        <div className={`text-center ${termico ? '' : 'border-b-4 border-vino-700 pb-4'}`}>
          {mostrarLogo && emp.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={emp.logo_url} alt="" className={`mx-auto mb-1 object-contain ${termico ? 'h-12 grayscale' : 'h-20'}`} />
          )}
          <p className={`font-bold ${termico ? 'text-[13px]' : 'font-titulo text-2xl text-vino-700'}`}>{emp.nombre}</p>
          {emp.razon_social && <p>{emp.razon_social}</p>}
          {emp.nit && <p>NIT {emp.nit}{emp.regimen ? ` · ${emp.regimen}` : ''}</p>}
          <p>{p.sedes?.direccion || emp.direccion}</p>
          <p>{[emp.telefono || p.sedes?.telefono, `WhatsApp ${p.sedes?.whatsapp || emp.whatsapp}`].filter(Boolean).join(' · ')}</p>
          {emp.correo && <p>{emp.correo}</p>}
        </div>

        <div className={`my-2 ${termico ? 'border-y border-dashed border-black py-1' : 'mt-5 grid grid-cols-2 gap-1'}`}>
          <p className="font-bold">COMPROBANTE INTERNO DE VENTA N.º {p.comprobante_numero ?? '— (pendiente de pago)'}</p>
          <p>Pedido #{p.numero} · {etiqueta(p.tipo_servicio)}{p.mesas?.nombre ? ` · ${p.mesas.nombre}` : ''}</p>
          <p>Fecha: {fechaHora(p.cerrado_en || p.creado_en)}</p>
          <p>Sede: {p.sedes?.nombre}</p>
          <p>Atendió: {p.perfiles?.nombre || '—'}</p>
          <p>Cliente: {p.clientes?.nombre || p.domicilios?.cliente_nombre || 'Cliente general'}{p.clientes?.documento ? ` · ${p.clientes.documento}` : ''}</p>
          {p.domicilios && <p>Entrega: {p.domicilios.direccion}{p.domicilios.barrio ? `, ${p.domicilios.barrio}` : ''}</p>}
        </div>

        <table className={`w-full ${termico ? '' : 'mt-4'}`}>
          <thead><tr className={termico ? 'border-b border-dashed border-black' : 'bg-crema-100'}>
            <th className="text-left">Cant</th><th className="text-left">Producto</th>{!termico && <th className="text-right">V. unit.</th>}<th className="text-right">Total</th>
          </tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={termico ? '' : 'border-b border-crema-200'}>
                <td className="pr-1 align-top">{numero(i.cantidad)}</td>
                <td className="align-top">{i.nombre}{termico && Number(i.cantidad) !== 1 ? <span className="block">  @ {moneda(i.precio_unitario)}</span> : null}{Number(i.descuento) > 0 && <span className="block">  Desc. -{moneda(i.descuento)}</span>}</td>
                {!termico && <td className="text-right align-top">{moneda(i.precio_unitario)}</td>}
                <td className="text-right align-top">{moneda(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={`mt-2 space-y-0.5 ${termico ? 'border-t border-dashed border-black pt-1' : 'ml-auto mt-4 w-64'}`}>
          <Fila t="Subtotal" v={moneda(p.subtotal)} />
          {Number(p.impuestos) > 0 && <Fila t="Impuestos" v={moneda(p.impuestos)} />}
          {Number(p.descuento) > 0 && <Fila t="Descuento" v={`-${moneda(p.descuento)}`} />}
          {Number(p.valor_domicilio) > 0 && <Fila t="Domicilio" v={moneda(p.valor_domicilio)} />}
          <Fila t="TOTAL" v={moneda(p.total)} fuerte />
          {pagos.map((x, k) => <Fila key={k} t={`${x.metodos_pago?.nombre}${x.referencia ? ` (${x.referencia})` : ''}`} v={moneda(x.valor)} />)}
          {cambio > 0 && <Fila t="Cambio" v={moneda(cambio)} />}
          {devs.map((x, k) => <Fila key={'d' + k} t={x.es_anulacion ? 'VENTA ANULADA' : 'Devolución'} v={`-${moneda(x.valor)}`} />)}
        </div>

        <div className={`mt-3 text-center ${termico ? 'border-t border-dashed border-black pt-2' : 'mt-8 border-t border-crema-200 pt-4'}`}>
          <p className="font-bold">{emp.mensaje_comprobante}</p>
          <p className="mt-1">Pedidos y domicilios por WhatsApp: {emp.whatsapp}</p>
          <p className="mt-2 text-[10px]">Documento interno de venta. No es una factura electrónica de venta.</p>
        </div>
      </div>
    </div>
  );
}

function Fila({ t, v, fuerte }) {
  return <div className={`flex justify-between gap-2 ${fuerte ? 'text-[1.15em] font-bold' : ''}`}><span>{t}</span><span className="tabular-nums">{v}</span></div>;
}

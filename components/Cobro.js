'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2, Printer, MessageCircle, CheckCircle2 } from 'lucide-react';
import { Modal, Campo, useAviso } from './ui';
import { q, rpc } from '@/lib/supabase';
import { moneda } from '@/lib/formato';

/** Modal de cobro con pagos mixtos (efectivo, Nequi, Daviplata, transferencia, tarjeta…) */
export function ModalCobro({ abierto, pedido, onCerrar, onPagado }) {
  const aviso = useAviso();
  const [metodos, setMetodos] = useState([]);
  const [lineas, setLineas] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const saldo = Math.max(0, Number(pedido?.total || 0) - Number(pedido?.pagado || 0));

  useEffect(() => {
    if (!abierto) return;
    q((sb) => sb.from('metodos_pago').select('*').eq('activo', true).order('orden')).then((m) => {
      setMetodos(m);
      const ef = m.find((x) => x.es_efectivo) || m[0];
      setLineas([{ metodo_id: ef?.id, valor: saldo, recibido: '', referencia: '' }]);
    }).catch(aviso.error);
  }, [abierto, saldo, aviso.error]);

  const total = lineas.reduce((s, l) => s + Number(l.valor || 0), 0);
  const esEf = (id) => metodos.find((m) => m.id === id)?.es_efectivo;
  const cambio = lineas.reduce((s, l) => s + (esEf(l.metodo_id) && Number(l.recibido) > Number(l.valor) ? Number(l.recibido) - Number(l.valor) : 0), 0);
  const cambiar = (i, k, v) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  async function pagar() {
    if (total <= 0) return aviso.error('Indica el valor a pagar.');
    if (total > saldo + 0.5) return aviso.error('El pago supera el saldo pendiente.');
    setEnviando(true);
    try {
      const r = await rpc('registrar_pago', {
        p_pedido: pedido.id,
        p_pagos: lineas.filter((l) => Number(l.valor) > 0).map((l) => ({ metodo_id: l.metodo_id, valor: Number(l.valor), recibido: l.recibido ? Number(l.recibido) : null, referencia: l.referencia || null })),
      });
      onPagado?.({ ...r, cambio });
    } catch (e) { aviso.error(e); } finally { setEnviando(false); }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={`Cobrar pedido #${pedido?.numero ?? ''}`} ancho="max-w-xl"
      pie={<><button className="btn-secundario" onClick={onCerrar}>Cancelar</button>
        <button className="btn-primario px-6" disabled={enviando || total <= 0} onClick={pagar}>{enviando ? 'Registrando…' : `Registrar pago ${moneda(total)}`}</button></>}>
      <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-crema-100 p-3 text-center">
        <div><p className="text-xs text-cafe-400">Total</p><p className="font-titulo text-lg font-bold">{moneda(pedido?.total)}</p></div>
        <div><p className="text-xs text-cafe-400">Pagado</p><p className="font-titulo text-lg font-bold">{moneda(pedido?.pagado)}</p></div>
        <div><p className="text-xs text-cafe-400">Saldo</p><p className="font-titulo text-lg font-bold text-vino-700">{moneda(saldo)}</p></div>
      </div>
      <div className="space-y-3">
        {lineas.map((l, i) => (
          <div key={i} className="rounded-xl border border-crema-200 p-3">
            <div className="flex flex-wrap gap-1">
              {metodos.map((m) => (
                <button key={m.id} onClick={() => cambiar(i, 'metodo_id', m.id)}
                  className={`btn-sm btn ${l.metodo_id === m.id ? 'bg-vino-700 text-white' : 'bg-crema-100 text-cafe-600'}`}>{m.nombre}</button>
              ))}
              {lineas.length > 1 && <button className="btn-fantasma btn-sm ml-auto text-red-600" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Campo etiqueta="Valor a pagar"><input type="number" inputMode="numeric" className="input text-lg font-bold" value={l.valor} onChange={(e) => cambiar(i, 'valor', e.target.value)} /></Campo>
              {esEf(l.metodo_id) ? (
                <Campo etiqueta="Recibido (para el cambio)"><input type="number" inputMode="numeric" className="input text-lg" value={l.recibido} onChange={(e) => cambiar(i, 'recibido', e.target.value)} /></Campo>
              ) : (
                <Campo etiqueta="Referencia / comprobante"><input className="input" value={l.referencia} onChange={(e) => cambiar(i, 'referencia', e.target.value)} /></Campo>
              )}
            </div>
            {esEf(l.metodo_id) && (
              <div className="mt-2 flex flex-wrap gap-1">
                {[Number(l.valor), 10000, 20000, 50000, 100000].filter((v, k, a) => v > 0 && a.indexOf(v) === k).map((v) => (
                  <button key={v} className="btn-secundario btn-sm" onClick={() => cambiar(i, 'recibido', v)}>{moneda(v)}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        <button className="btn-fantasma btn-sm" onClick={() => setLineas((ls) => [...ls, { metodo_id: metodos.find((m) => !m.es_efectivo)?.id || metodos[0]?.id, valor: Math.max(0, saldo - total), recibido: '', referencia: '' }])}>
          <Plus size={14} /> Dividir en otro medio de pago
        </button>
      </div>
      {cambio > 0 && <div className="mt-4 rounded-xl bg-dorado-50 p-3 text-center"><p className="text-xs text-dorado-700">Cambio a devolver</p><p className="font-titulo text-3xl font-bold text-dorado-700">{moneda(cambio)}</p></div>}
      {total < saldo - 0.5 && total > 0 && <p className="mt-3 text-xs text-cafe-500">Se registrará un pago parcial. Quedará un saldo de {moneda(saldo - total)}.</p>}
    </Modal>
  );
}

/** Tras cobrar: imprimir comprobante o enviarlo por WhatsApp */
export async function textoComprobante(pedidoId) {
  const [p, items] = await Promise.all([
    q((sb) => sb.from('pedidos').select('numero, comprobante_numero, total, descuento, valor_domicilio, cerrado_en, sedes(negocios(nombre, direccion, whatsapp, mensaje_comprobante))').eq('id', pedidoId).single()),
    q((sb) => sb.from('pedido_items').select('nombre, cantidad, total').eq('pedido_id', pedidoId).eq('estado', 'activo')),
  ]);
  const emp = p.sedes?.negocios || {};
  return [
    `*${emp.nombre}*`, emp.direccion, `Comprobante de venta #${p.comprobante_numero} (pedido #${p.numero})`, '',
    ...items.map((i) => `${Number(i.cantidad)} x ${i.nombre} — ${moneda(i.total)}`),
    Number(p.descuento) > 0 ? `Descuento: -${moneda(p.descuento)}` : null,
    Number(p.valor_domicilio) > 0 ? `Domicilio: ${moneda(p.valor_domicilio)}` : null,
    `*TOTAL: ${moneda(p.total)}*`, '', emp.mensaje_comprobante, emp.whatsapp ? `WhatsApp: ${emp.whatsapp}` : null,
    '_Comprobante interno de venta — no es factura electrónica._',
  ].filter((x) => x !== null).join('\n');
}

export function abrirWhatsApp(telefono, texto) {
  const numero = String(telefono || '').replace(/\D/g, '');
  window.open(`https://wa.me/${numero.length === 10 ? '57' + numero : numero}?text=${encodeURIComponent(texto)}`, '_blank');
}

export function ModalVentaLista({ abierto, resultado, pedidoId, telefono, onNueva }) {
  const aviso = useAviso();
  const [tel, setTel] = useState(telefono || '');
  useEffect(() => setTel(telefono || ''), [telefono]);
  const enviarWhatsApp = async () => {
    try { abrirWhatsApp(tel, await textoComprobante(pedidoId)); } catch (e) { aviso.error(e); }
  };
  const pagado = resultado?.estado_pago === 'pagado';
  return (
    <Modal abierto={abierto} onCerrar={onNueva} titulo={pagado ? 'Venta registrada' : 'Pago parcial registrado'}
      pie={<button className="btn-primario" onClick={onNueva}>{pagado ? 'Nueva venta' : 'Continuar'}</button>}>
      <div className="text-center">
        <CheckCircle2 size={48} className="mx-auto text-emerald-600" />
        {pagado ? <p className="mt-2 font-titulo text-xl font-bold">Comprobante #{resultado?.comprobante_numero}</p>
          : <p className="mt-2">Saldo pendiente: <b>{moneda(resultado?.saldo)}</b></p>}
        {resultado?.cambio > 0 && <p className="mt-2 text-lg">Cambio: <b className="text-dorado-700">{moneda(resultado.cambio)}</b></p>}
      </div>
      {pagado && (
        <>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {['58mm', '80mm', 'carta'].map((f) => (
              <Link key={f} href={`/imprimir/${pedidoId}?formato=${f}&auto=1`} target="_blank" className="btn-secundario"><Printer size={15} /> {f === 'carta' ? 'Carta / PDF' : f}</Link>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <input className="input" placeholder="WhatsApp del cliente" value={tel} onChange={(e) => setTel(e.target.value)} />
            <button className="btn-dorado" disabled={tel.replace(/\D/g, '').length < 10} onClick={enviarWhatsApp}><MessageCircle size={16} /> Enviar</button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** Buscador de clientes con creación rápida */
export function SelectorCliente({ valor, onCambio }) {
  const aviso = useAviso();
  const [texto, setTexto] = useState('');
  const [lista, setLista] = useState([]);
  const [nuevo, setNuevo] = useState(null);
  useEffect(() => {
    const t = texto.trim();
    if (t.length < 2) { setLista([]); return; }
    const h = setTimeout(() => {
      q((sb) => sb.from('clientes').select('id,nombre,telefono,documento,direccion,barrio').eq('activo', true)
        .or(`nombre.ilike.%${t}%,telefono.ilike.%${t}%,documento.ilike.%${t}%`).limit(8)).then(setLista).catch(() => {});
    }, 250);
    return () => clearTimeout(h);
  }, [texto]);
  const crear = async () => {
    try {
      const c = await q((sb) => sb.from('clientes').insert(nuevo).select().single());
      onCambio(c); setNuevo(null); setTexto('');
    } catch (e) { aviso.error(e); }
  };
  if (valor) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-crema-300 bg-crema-50 px-3 py-2 text-sm">
        <span><b>{valor.nombre}</b> {valor.telefono && <span className="text-cafe-400">· {valor.telefono}</span>}</span>
        <button className="text-xs text-vino-600 hover:underline" onClick={() => onCambio(null)}>Cambiar</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input className="input" placeholder="Cliente general — buscar por nombre, teléfono o documento" value={texto} onChange={(e) => setTexto(e.target.value)} />
      {texto.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-crema-200 bg-white shadow-lg">
          {lista.map((c) => (
            <button key={c.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-crema-50" onClick={() => { onCambio(c); setTexto(''); }}>
              {c.nombre} <span className="text-cafe-400">{c.telefono}</span>
            </button>
          ))}
          <button className="block w-full border-t border-crema-100 px-3 py-2 text-left text-sm font-semibold text-vino-600 hover:bg-crema-50"
            onClick={() => setNuevo({ nombre: texto.trim(), telefono: /^\d+$/.test(texto.trim()) ? texto.trim() : '' })}>
            <Plus size={14} className="inline" /> Registrar cliente nuevo “{texto.trim()}”
          </button>
        </div>
      )}
      <Modal abierto={!!nuevo} onCerrar={() => setNuevo(null)} titulo="Nuevo cliente"
        pie={<><button className="btn-secundario" onClick={() => setNuevo(null)}>Cancelar</button><button className="btn-primario" onClick={crear} disabled={!nuevo?.nombre?.trim()}>Guardar</button></>}>
        {nuevo && (
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Nombre" className="col-span-2"><input className="input" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Teléfono / WhatsApp"><input className="input" value={nuevo.telefono || ''} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value, whatsapp: e.target.value })} /></Campo>
            <Campo etiqueta="Documento"><input className="input" value={nuevo.documento || ''} onChange={(e) => setNuevo({ ...nuevo, documento: e.target.value })} /></Campo>
            <Campo etiqueta="Dirección"><input className="input" value={nuevo.direccion || ''} onChange={(e) => setNuevo({ ...nuevo, direccion: e.target.value })} /></Campo>
            <Campo etiqueta="Barrio"><input className="input" value={nuevo.barrio || ''} onChange={(e) => setNuevo({ ...nuevo, barrio: e.target.value })} /></Campo>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function useCajaAbierta(sedeId) {
  const [sesion, setSesion] = useState(undefined);
  const recargar = useMemo(() => async () => {
    if (!sedeId) return;
    try {
      const { data: { user } } = await (await import('@/lib/supabase')).supabase().auth.getUser();
      const s = await q((sb) => sb.from('caja_sesiones').select('id, abierta_en, cajas(nombre)').eq('usuario_id', user.id).eq('sede_id', sedeId).eq('estado', 'abierta').maybeSingle());
      setSesion(s);
    } catch { setSesion(null); }
  }, [sedeId]);
  useEffect(() => { recargar(); }, [recargar]);
  return { sesion, recargar };
}

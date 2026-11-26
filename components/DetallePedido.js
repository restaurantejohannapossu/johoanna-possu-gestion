'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Printer, Wallet, Ban, Undo2, Pencil, Split, Merge, MoveRight, MessageCircle } from 'lucide-react';
import { Modal, Campo, Estado, Cargando, Chip, useAviso, useConfirmar } from './ui';
import { ModalCobro, textoComprobante, abrirWhatsApp } from './Cobro';
import { useSesion } from './sesion';
import { q, rpc } from '@/lib/supabase';
import { moneda, numero, fechaHora, etiqueta } from '@/lib/formato';

export default function DetallePedido({ pedidoId, onCerrar, onCambio }) {
  const { puede } = useSesion();
  const aviso = useAviso();
  const confirmar = useConfirmar();
  const [d, setD] = useState(null);
  const [cobro, setCobro] = useState(false);
  const [modo, setModo] = useState(null); // separar | unir | trasladar | devolucion
  const [sel, setSel] = useState({});
  const [destino, setDestino] = useState('');
  const [opciones, setOpciones] = useState([]);
  const [dev, setDev] = useState({ valor: '', motivo: '', reintegrar: false });

  async function cargar() {
    const [p, items, pagos, devs] = await Promise.all([
      q((sb) => sb.from('pedidos').select('*, mesas(nombre), clientes(nombre,telefono), domicilios(*), perfiles!pedidos_usuario_id_fkey(nombre)').eq('id', pedidoId).single()),
      q((sb) => sb.from('pedido_items').select('*').eq('pedido_id', pedidoId).order('creado_en')),
      q((sb) => sb.from('pagos').select('*, metodos_pago(nombre)').eq('pedido_id', pedidoId).order('creado_en')),
      q((sb) => sb.from('devoluciones').select('*').eq('pedido_id', pedidoId).order('creado_en')),
    ]);
    setD({ p, items, pagos, devs });
  }
  useEffect(() => { if (pedidoId) cargar().catch(aviso.error); else setD(null); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoId]);
  const listo = async (msg) => { if (msg) aviso.ok(msg); setModo(null); await cargar(); onCambio?.(); };

  async function abrirModo(m) {
    setSel({}); setDestino(''); setModo(m);
    if (m === 'trasladar') setOpciones(await q((sb) => sb.from('mesas').select('id,nombre,estado').eq('sede_id', d.p.sede_id).eq('activa', true).eq('estado', 'libre').order('orden')));
    if (m === 'unir') setOpciones(await q((sb) => sb.from('pedidos').select('id,numero,total,mesas(nombre),tipo_servicio').eq('sede_id', d.p.sede_id).neq('id', pedidoId).neq('estado', 'cancelado').in('estado_pago', ['abierto', 'parcial']).order('numero')));
    if (m === 'devolucion') setDev({ valor: Number(d.p.pagado) - Number(d.p.devuelto), motivo: '', reintegrar: false });
  }
  async function accion(fn, msg) { try { await fn(); await listo(msg); } catch (e) { aviso.error(e); } }

  const cancelar = async () => {
    const r = await confirmar({ titulo: `Cancelar pedido #${d.p.numero}`, mensaje: 'El pedido quedará cancelado con su motivo (no se borra).', pedirMotivo: true, peligro: true, textoBoton: 'Cancelar pedido' });
    if (r.ok) accion(() => rpc('cancelar_pedido', { p_pedido: pedidoId, p_motivo: r.motivo }), 'Pedido cancelado.');
  };
  const anular = async () => {
    const r = await confirmar({ titulo: `Anular venta #${d.p.comprobante_numero}`, mensaje: `Se devolverá ${moneda(Number(d.p.pagado) - Number(d.p.devuelto))} desde tu caja y se reintegrará el inventario descontado.`, pedirMotivo: true, peligro: true, textoBoton: 'Anular venta' });
    if (r.ok) accion(() => rpc('anular_venta', { p_pedido: pedidoId, p_motivo: r.motivo }), 'Venta anulada.');
  };

  if (!pedidoId) return null;
  const p = d?.p;
  const abierto = p && p.estado !== 'cancelado' && ['abierto', 'parcial'].includes(p.estado_pago);
  const activos = d?.items.filter((i) => i.estado === 'activo') || [];

  return (
    <>
      <Modal abierto={!!pedidoId && !cobro} onCerrar={onCerrar} ancho="max-w-2xl" titulo={p ? `Pedido #${p.numero}${p.comprobante_numero ? ` · Comprobante ${p.comprobante_numero}` : ''}` : 'Pedido'}
        pie={p && <>
          {p.comprobante_numero && <Link href={`/imprimir/${p.id}`} target="_blank" className="btn-secundario"><Printer size={15} /> Imprimir</Link>}
          {p.comprobante_numero && (p.clientes?.telefono || p.domicilios?.telefono) && (
            <button className="btn-secundario" onClick={async () => abrirWhatsApp(p.clientes?.telefono || p.domicilios?.telefono, await textoComprobante(p.id))}><MessageCircle size={15} /> WhatsApp</button>
          )}
          {abierto && puede('pos.vender') && <Link href={`/pos?pedido=${p.id}`} className="btn-secundario"><Pencil size={15} /> Agregar productos</Link>}
          {abierto && puede('pos.vender') && <button className="btn-primario" onClick={() => setCobro(true)}><Wallet size={15} /> Cobrar</button>}
        </>}>
        {!d ? <Cargando /> : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Estado valor={p.estado} /> <Estado valor={p.estado_pago} />
              <Chip>{etiqueta(p.tipo_servicio)}{p.mesas?.nombre ? ` · ${p.mesas.nombre}` : ''}{p.nombre_cuenta ? ` · ${p.nombre_cuenta}` : ''}</Chip>
              <span className="text-cafe-400">{fechaHora(p.creado_en)} · {p.perfiles?.nombre}</span>
            </div>
            {p.clientes && <p className="text-sm">Cliente: <b>{p.clientes.nombre}</b> {p.clientes.telefono}</p>}
            {p.domicilios && <p className="text-sm">Domicilio: {p.domicilios.direccion} {p.domicilios.barrio} · {p.domicilios.telefono} · <Estado valor={p.domicilios.estado} /></p>}
            {p.observaciones && <p className="rounded bg-crema-100 px-3 py-2 text-sm">{p.observaciones}</p>}
            {p.motivo_cancelacion && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">Motivo: {p.motivo_cancelacion}</p>}
            <table className="tabla">
              <thead><tr><th>Cant.</th><th>Producto</th><th className="text-right">Total</th></tr></thead>
              <tbody>{d.items.map((i) => (
                <tr key={i.id} className={i.estado === 'cancelado' ? 'text-cafe-300 line-through' : ''}>
                  <td>{numero(i.cantidad)}</td>
                  <td>{i.nombre}{i.observaciones && <span className="block text-xs text-cafe-400">{i.observaciones}</span>}{i.motivo_cancelacion && <span className="block text-xs no-underline">Quitado: {i.motivo_cancelacion}</span>}</td>
                  <td className="text-right">{moneda(i.total)}</td>
                </tr>))}</tbody>
            </table>
            <div className="ml-auto w-64 space-y-0.5 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{moneda(p.subtotal)}</span></div>
              {Number(p.impuestos) > 0 && <div className="flex justify-between"><span>Impuestos</span><span>{moneda(p.impuestos)}</span></div>}
              {Number(p.descuento) > 0 && <div className="flex justify-between"><span>Descuento</span><span>-{moneda(p.descuento)}</span></div>}
              {Number(p.valor_domicilio) > 0 && <div className="flex justify-between"><span>Domicilio</span><span>{moneda(p.valor_domicilio)}</span></div>}
              <div className="flex justify-between font-bold"><span>Total</span><span>{moneda(p.total)}</span></div>
              <div className="flex justify-between text-emerald-700"><span>Pagado</span><span>{moneda(p.pagado)}</span></div>
              {Number(p.devuelto) > 0 && <div className="flex justify-between text-red-700"><span>Devuelto</span><span>-{moneda(p.devuelto)}</span></div>}
            </div>
            {d.pagos.length > 0 && (
              <div className="text-sm"><p className="etiqueta">Pagos</p>
                {d.pagos.map((x) => <p key={x.id}>{fechaHora(x.creado_en)} · {x.metodos_pago?.nombre} · <b>{moneda(x.valor)}</b>{x.referencia ? ` · Ref. ${x.referencia}` : ''}</p>)}</div>
            )}
            {d.devs.length > 0 && (
              <div className="text-sm"><p className="etiqueta">Devoluciones</p>
                {d.devs.map((x) => <p key={x.id}>{fechaHora(x.creado_en)} · {x.es_anulacion ? 'Anulación' : 'Devolución'} · <b>{moneda(x.valor)}</b> · {x.motivo}</p>)}</div>
            )}
            <div className="flex flex-wrap gap-2 border-t border-crema-200 pt-3">
              {abierto && p.tipo_servicio === 'mesa' && <button className="btn-secundario btn-sm" onClick={() => abrirModo('trasladar')}><MoveRight size={14} /> Trasladar de mesa</button>}
              {abierto && <button className="btn-secundario btn-sm" onClick={() => abrirModo('separar')}><Split size={14} /> Separar cuenta</button>}
              {abierto && <button className="btn-secundario btn-sm" onClick={() => abrirModo('unir')}><Merge size={14} /> Unir con otra cuenta</button>}
              {abierto && puede('pos.cancelar_venta') && Number(p.pagado) === 0 && <button className="btn-secundario btn-sm text-red-700" onClick={cancelar}><Ban size={14} /> Cancelar pedido</button>}
              {['pagado', 'parcial'].includes(p.estado_pago) && Number(p.pagado) > Number(p.devuelto) && puede('pos.devolucion') && <button className="btn-secundario btn-sm" onClick={() => abrirModo('devolucion')}><Undo2 size={14} /> Devolución</button>}
              {p.estado_pago === 'pagado' && puede('pos.anular_venta') && <button className="btn-secundario btn-sm text-red-700" onClick={anular}><Ban size={14} /> Anular venta</button>}
            </div>
          </div>
        )}
      </Modal>

      <Modal abierto={!!modo} onCerrar={() => setModo(null)} titulo={{ separar: 'Separar cuenta', unir: 'Unir cuentas', trasladar: 'Trasladar a otra mesa', devolucion: 'Registrar devolución' }[modo] || ''}
        pie={<>
          <button className="btn-secundario" onClick={() => setModo(null)}>Volver</button>
          {modo === 'separar' && <button className="btn-primario" disabled={!Object.values(sel).some((v) => Number(v) > 0)}
            onClick={() => accion(() => rpc('separar_cuenta', { p_pedido: pedidoId, p_items: Object.entries(sel).filter(([, v]) => Number(v) > 0).map(([item_id, cantidad]) => ({ item_id, cantidad: Number(cantidad) })) }), 'Se creó una nueva cuenta con los productos seleccionados.')}>Separar</button>}
          {modo === 'unir' && <button className="btn-primario" disabled={!destino}
            onClick={() => accion(() => rpc('unir_pedidos', { p_origen: pedidoId, p_destino: destino }), 'Cuentas unidas.').then(onCerrar)}>Unir a esa cuenta</button>}
          {modo === 'trasladar' && <button className="btn-primario" disabled={!destino}
            onClick={() => accion(() => rpc('trasladar_pedido', { p_pedido: pedidoId, p_mesa: destino }), 'Pedido trasladado.')}>Trasladar</button>}
          {modo === 'devolucion' && <button className="btn-primario" disabled={!dev.motivo.trim() || !(Number(dev.valor) >= 0)}
            onClick={() => accion(() => rpc('registrar_devolucion', { p_pedido: pedidoId, p_valor: Number(dev.valor), p_motivo: dev.motivo, p_reintegrar: dev.reintegrar && Object.keys(sel).length > 0, p_items: dev.reintegrar ? Object.entries(sel).filter(([, v]) => Number(v) > 0).map(([item_id, cantidad]) => ({ item_id, cantidad: Number(cantidad) })) : null }), 'Devolución registrada.')}>Registrar devolución</button>}
        </>}>
        {(modo === 'separar' || (modo === 'devolucion' && dev.reintegrar)) && (
          <div className="mb-3 space-y-2">
            <p className="text-sm text-cafe-500">{modo === 'separar' ? 'Indica cuántas unidades de cada producto pasan a la nueva cuenta.' : 'Productos que vuelven al inventario (no se consumieron):'}</p>
            {activos.map((i) => (
              <div key={i.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1">{i.nombre} <span className="text-cafe-400">(de {numero(i.cantidad)})</span></span>
                <input type="number" min="0" max={i.cantidad} className="input w-24" value={sel[i.id] ?? ''} onChange={(e) => setSel({ ...sel, [i.id]: Math.min(Number(i.cantidad), Math.max(0, Number(e.target.value))) })} />
              </div>
            ))}
          </div>
        )}
        {modo === 'unir' && (
          <select className="input" value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">Selecciona la cuenta destino…</option>
            {opciones.map((o) => <option key={o.id} value={o.id}>#{o.numero} · {o.mesas?.nombre || etiqueta(o.tipo_servicio)} · {moneda(o.total)}</option>)}
          </select>
        )}
        {modo === 'trasladar' && (
          <select className="input" value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">Selecciona la mesa libre…</option>
            {opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
        )}
        {modo === 'devolucion' && (
          <div className="space-y-3">
            <Campo etiqueta="Valor a devolver al cliente" ayuda={`Máximo ${moneda(Number(p?.pagado) - Number(p?.devuelto))}. Sale de tu caja abierta.`}>
              <input type="number" className="input" value={dev.valor} onChange={(e) => setDev({ ...dev, valor: e.target.value })} /></Campo>
            <Campo etiqueta="Motivo (obligatorio)"><textarea className="input" value={dev.motivo} onChange={(e) => setDev({ ...dev, motivo: e.target.value })} /></Campo>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dev.reintegrar} onChange={(e) => setDev({ ...dev, reintegrar: e.target.checked })} /> Reintegrar productos al inventario</label>
          </div>
        )}
      </Modal>

      <ModalCobro abierto={cobro} pedido={p} onCerrar={() => setCobro(false)} onPagado={(r) => { setCobro(false); listo(r.estado_pago === 'pagado' ? `Venta registrada. Comprobante #${r.comprobante_numero}` : 'Pago parcial registrado.'); }} />
    </>
  );
}

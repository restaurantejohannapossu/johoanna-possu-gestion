'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bike, MapPin, Phone, MessageCircle, Plus, RefreshCw } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Cargando, Estado, Modal, Campo, Vacio, useAviso, useCarga } from '@/components/ui';
import DetallePedido from '@/components/DetallePedido';
import { abrirWhatsApp } from '@/components/Cobro';
import { q, rpc } from '@/lib/supabase';
import { moneda, hoyISO, hora, minutosDesde, etiqueta } from '@/lib/formato';

export default function Pagina() { return <Requiere permisos={['domicilios.ver']}><Domicilios /></Requiere>; }

const ESTADOS = ['recibido', 'en_preparacion', 'listo', 'en_camino', 'entregado', 'cancelado'];

function Domicilios() {
  const { sedeId, puede } = useSesion();
  const aviso = useAviso();
  const [fecha, setFecha] = useState(hoyISO());
  const [estado, setEstado] = useState('activos');
  const [detalle, setDetalle] = useState(null);
  const [asignar, setAsignar] = useState(null);
  const { datos, cargando, recargar } = useCarga(async () => {
    const r = await q((sb) => sb.from('pedidos').select('id,numero,total,pagado,estado,estado_pago,creado_en,domicilios(*)')
      .eq('sede_id', sedeId).eq('tipo_servicio', 'domicilio').gte('creado_en', `${fecha}T00:00:00-05:00`).lte('creado_en', `${fecha}T23:59:59-05:00`).order('creado_en', { ascending: false }));
    return r.filter((p) => p.domicilios);
  }, [sedeId, fecha]);
  useEffect(() => { const t = setInterval(recargar, 20000); return () => clearInterval(t); }, [recargar]);

  const lista = (datos || []).filter((p) => estado === 'todos' || (estado === 'activos' ? !['entregado', 'cancelado'].includes(p.domicilios.estado) : p.domicilios.estado === estado));
  async function cambiar(p, nuevo, domiciliario) {
    try { await rpc('cambiar_estado_domicilio', { p_pedido: p.id, p_estado: nuevo, p_domiciliario: domiciliario || null }); setAsignar(null); recargar(); } catch (e) { aviso.error(e); }
  }
  return (
    <div>
      <Encabezado titulo="Domicilios" subtitulo="Pedidos a domicilio de la sede">
        {puede('pos.vender') && <Link href="/pos" className="btn-primario"><Plus size={15} /> Nuevo domicilio</Link>}
        <button className="btn-secundario" onClick={recargar}><RefreshCw size={15} /></button>
      </Encabezado>
      <div className="mb-4 flex flex-wrap gap-2">
        <input type="date" className="input w-auto" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <select className="input w-auto" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="activos">En curso</option><option value="todos">Todos</option>
          {ESTADOS.map((x) => <option key={x} value={x}>{etiqueta(x)}</option>)}
        </select>
        <span className="self-center text-sm text-cafe-400">{lista.length} domicilio(s) · {moneda(lista.reduce((s, p) => s + Number(p.total), 0))}</span>
      </div>
      {cargando && !datos ? <Cargando /> : lista.length === 0 ? <Vacio texto="No hay domicilios con este filtro." /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((p) => {
            const d = p.domicilios;
            return (
              <div key={p.id} className="tarjeta p-4">
                <div className="flex items-start justify-between">
                  <button className="text-left" onClick={() => setDetalle(p.id)}>
                    <p className="font-titulo text-lg font-bold">#{p.numero} · {d.cliente_nombre || 'Cliente'}</p>
                    <p className="text-xs text-cafe-400">{hora(p.creado_en)} · hace {minutosDesde(p.creado_en)} min</p>
                  </button>
                  <Estado valor={d.estado} />
                </div>
                <p className="mt-2 flex items-start gap-1.5 text-sm"><MapPin size={15} className="mt-0.5 shrink-0 text-vino-600" />{d.direccion}{d.barrio ? `, ${d.barrio}` : ''}{d.referencias ? ` — ${d.referencias}` : ''}</p>
                {d.telefono && <p className="mt-1 flex items-center gap-1.5 text-sm"><Phone size={14} className="text-vino-600" /> {d.telefono}</p>}
                <p className="mt-1 flex items-center gap-1.5 text-sm"><Bike size={14} className="text-vino-600" /> {d.domiciliario || 'Sin domiciliario'}</p>
                <div className="mt-2 flex items-center justify-between text-sm"><b>{moneda(p.total)}</b><Estado valor={p.estado_pago} /></div>
                {puede('domicilios.gestionar') && !['entregado', 'cancelado'].includes(d.estado) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {d.estado !== 'en_camino' && <button className="btn-primario btn-sm" onClick={() => setAsignar({ p, domiciliario: d.domiciliario || '' })}><Bike size={13} /> Despachar</button>}
                    {d.estado === 'en_camino' && <button className="btn-primario btn-sm" onClick={() => cambiar(p, 'entregado')}>Entregado</button>}
                    {d.estado === 'recibido' && <button className="btn-secundario btn-sm" onClick={() => cambiar(p, 'en_preparacion')}>En preparación</button>}
                    {d.estado === 'en_preparacion' && <button className="btn-secundario btn-sm" onClick={() => cambiar(p, 'listo')}>Listo</button>}
                    {d.telefono && <button className="btn-secundario btn-sm" onClick={() => abrirWhatsApp(d.telefono, `Hola ${d.cliente_nombre || ''}, tu pedido #${p.numero} de Restaurante Johoanna Possu ${d.estado === 'en_camino' ? 'va en camino' : 'está en preparación'}. Total: ${moneda(p.total)}.`)}><MessageCircle size={13} /></button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Modal abierto={!!asignar} onCerrar={() => setAsignar(null)} titulo="Despachar domicilio"
        pie={<button className="btn-primario" onClick={() => cambiar(asignar.p, 'en_camino', asignar.domiciliario)}>Marcar en camino</button>}>
        <Campo etiqueta="Domiciliario"><input className="input" autoFocus value={asignar?.domiciliario || ''} onChange={(e) => setAsignar({ ...asignar, domiciliario: e.target.value })} /></Campo>
      </Modal>
      <DetallePedido pedidoId={detalle} onCerrar={() => setDetalle(null)} onCambio={recargar} />
    </div>
  );
}

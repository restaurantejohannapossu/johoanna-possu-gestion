'use client';
import { useEffect, useState } from 'react';
import { ChefHat, Clock, Flame, CheckCircle2, PackageCheck, RefreshCw, PackageX } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Cargando, Modal, useAviso, useCarga } from '@/components/ui';
import { q, rpc } from '@/lib/supabase';
import { numero, hora, minutosDesde, etiqueta } from '@/lib/formato';

export default function Pagina() { return <Requiere permisos={['cocina.ver']}><Cocina /></Requiere>; }

const SIGUIENTE = { pendiente: 'en_preparacion', en_preparacion: 'listo', listo: 'entregado' };
const BOTON = { pendiente: ['Empezar', Flame], en_preparacion: ['Marcar listo', CheckCircle2], listo: ['Entregado', PackageCheck] };

function Cocina() {
  const { sedeId, puede } = useSesion();
  const aviso = useAviso();
  const [, setTic] = useState(0);
  const [agotar, setAgotar] = useState(false);
  const { datos, cargando, recargar } = useCarga(async () => {
    const pedidos = await q((sb) => sb.from('pedidos').select('id,numero,tipo_servicio,estado,observaciones,creado_en,mesas(nombre),domicilios(cliente_nombre,barrio)')
      .eq('sede_id', sedeId).in('estado', ['pendiente', 'en_preparacion', 'listo']).order('creado_en'));
    if (!pedidos.length) return [];
    const items = await q((sb) => sb.from('pedido_items').select('id,pedido_id,nombre,cantidad,observaciones,creado_en').in('pedido_id', pedidos.map((p) => p.id)).eq('estado', 'activo').eq('va_a_cocina', true).order('creado_en'));
    return pedidos.map((p) => ({ ...p, items: items.filter((i) => i.pedido_id === p.id) })).filter((p) => p.items.length);
  }, [sedeId]);
  useEffect(() => { const t = setInterval(() => { recargar(); setTic((x) => x + 1); }, 10000); return () => clearInterval(t); }, [recargar]);

  async function avanzar(p) {
    try { await rpc('cambiar_estado_pedido', { p_pedido: p.id, p_estado: SIGUIENTE[p.estado] }); recargar(); } catch (e) { aviso.error(e); }
  }
  if (cargando && !datos) return <Cargando />;
  const columnas = [['pendiente', 'Por preparar'], ['en_preparacion', 'En preparación'], ['listo', 'Listos para entregar']];
  return (
    <div>
      <Encabezado titulo="Cocina" subtitulo="Comandas en tiempo real · se actualiza cada 10 segundos">
        {puede('productos.agotar', 'productos.gestionar') && <button className="btn-secundario" onClick={() => setAgotar(true)}><PackageX size={15} /> Marcar agotados</button>}
        <button className="btn-secundario" onClick={recargar}><RefreshCw size={15} /> Actualizar</button>
      </Encabezado>
      <div className="grid gap-4 lg:grid-cols-3">
        {columnas.map(([estado, titulo]) => {
          const lista = (datos || []).filter((p) => p.estado === estado);
          return (
            <div key={estado} className="rounded-2xl bg-crema-200/60 p-3">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><ChefHat size={18} /> {titulo} <span className="chip bg-white">{lista.length}</span></h2>
              <div className="space-y-3">
                {lista.map((p) => {
                  const min = minutosDesde(p.creado_en);
                  const alerta = estado !== 'listo' && (min >= 25 ? 'border-red-400 bg-red-50' : min >= 15 ? 'border-dorado-400 bg-dorado-50' : 'border-crema-200 bg-white');
                  return (
                    <div key={p.id} className={`rounded-xl border-2 p-3 shadow-sm ${alerta || 'border-emerald-300 bg-white'}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-titulo text-xl font-bold">#{p.numero}</p>
                          <p className="text-sm font-semibold text-vino-700">{p.mesas?.nombre || etiqueta(p.tipo_servicio)}{p.domicilios ? ` · ${p.domicilios.cliente_nombre || ''} ${p.domicilios.barrio || ''}` : ''}</p>
                        </div>
                        <div className="text-right text-xs text-cafe-500"><p>{hora(p.creado_en)}</p><p className={`flex items-center gap-1 font-bold ${min >= 25 ? 'text-red-700' : ''}`}><Clock size={12} /> {min} min</p></div>
                      </div>
                      <ul className="mt-2 space-y-1.5 border-t border-crema-200 pt-2">
                        {p.items.map((i) => (
                          <li key={i.id} className="text-[15px]">
                            <b className="mr-1 text-vino-700">{numero(i.cantidad)}×</b> {i.nombre}
                            {i.observaciones && <span className="block rounded bg-dorado-100 px-2 py-0.5 text-sm font-semibold text-dorado-700">⚠ {i.observaciones}</span>}
                          </li>
                        ))}
                      </ul>
                      {p.observaciones && <p className="mt-2 rounded bg-crema-100 px-2 py-1 text-sm">{p.observaciones}</p>}
                      {puede('cocina.actualizar') && (() => { const [t, I] = BOTON[estado]; return (
                        <button className={`mt-3 w-full ${estado === 'listo' ? 'btn-secundario' : 'btn-primario'} py-2.5`} onClick={() => avanzar(p)}><I size={16} /> {t}</button>
                      ); })()}
                    </div>
                  );
                })}
                {lista.length === 0 && <p className="py-6 text-center text-sm text-cafe-400">Sin pedidos</p>}
              </div>
            </div>
          );
        })}
      </div>
      {agotar && <ModalAgotados sedeId={sedeId} onCerrar={() => setAgotar(false)} />}
    </div>
  );
}

function ModalAgotados({ sedeId, onCerrar }) {
  const aviso = useAviso();
  const { datos, recargar } = useCarga(async () => {
    const p = await q((sb) => sb.from('productos').select('id,nombre,producto_sedes(sede_id,agotado)').eq('activo', true).order('nombre'));
    return p.map((x) => ({ ...x, agotado: !!x.producto_sedes.find((s) => s.sede_id === sedeId)?.agotado, tieneFila: !!x.producto_sedes.find((s) => s.sede_id === sedeId) }));
  }, [sedeId]);
  async function alternar(p) {
    try {
      if (p.tieneFila) await q((sb) => sb.from('producto_sedes').update({ agotado: !p.agotado }).eq('producto_id', p.id).eq('sede_id', sedeId));
      else await q((sb) => sb.from('producto_sedes').insert({ producto_id: p.id, sede_id: sedeId, agotado: true }));
      recargar();
    } catch (e) { aviso.error(e); }
  }
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Productos agotados hoy">
      {!datos ? <Cargando /> : (
        <div className="space-y-1">
          {datos.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 hover:bg-crema-50">
              <span className={p.agotado ? 'text-red-700 line-through' : ''}>{p.nombre}</span>
              <input type="checkbox" checked={p.agotado} onChange={() => alternar(p)} />
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

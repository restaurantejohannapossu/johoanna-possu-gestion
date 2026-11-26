'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Armchair, Users, Clock, CalendarCheck, RefreshCw, History } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Cargando, Modal, Campo, TablaDatos, Chip, useAviso, useCarga } from '@/components/ui';
import DetallePedido from '@/components/DetallePedido';
import { q, rpc } from '@/lib/supabase';
import { moneda, minutosDesde, etiqueta } from '@/lib/formato';

export default function Pagina() { return <Requiere permisos={['mesas.gestionar', 'pos.vender', 'mesas.configurar']}><Mesas /></Requiere>; }

function Mesas() {
  const { sedeId, puede } = useSesion();
  const aviso = useAviso();
  const router = useRouter();
  const [detalle, setDetalle] = useState(null);
  const [mesaSel, setMesaSel] = useState(null);
  const [reserva, setReserva] = useState(null);
  const [historial, setHistorial] = useState(null);
  const { datos, cargando, recargar } = useCarga(async () => {
    const [mesas, pedidos] = await Promise.all([
      q((sb) => sb.from('mesas').select('*').eq('sede_id', sedeId).eq('activa', true).order('orden').order('nombre')),
      q((sb) => sb.from('pedidos').select('id,numero,mesa_id,total,pagado,estado,creado_en').eq('sede_id', sedeId).not('mesa_id', 'is', null).neq('estado', 'cancelado').in('estado_pago', ['abierto', 'parcial'])),
    ]);
    return mesas.map((m) => ({ ...m, pedidos: pedidos.filter((p) => p.mesa_id === m.id) }));
  }, [sedeId]);
  useEffect(() => { const t = setInterval(recargar, 20000); return () => clearInterval(t); }, [recargar]);

  async function verHistorial(m) {
    try {
      setHistorial({ mesa: m, filas: await q((sb) => sb.from('pedidos').select('id,numero,creado_en,total,estado,estado_pago,comprobante_numero').eq('mesa_id', m.id).order('creado_en', { ascending: false }).limit(100)) });
    } catch (e) { aviso.error(e); }
  }
  async function cambiarEstado(m, estado, nota) {
    try { await rpc('cambiar_estado_mesa', { p_mesa: m.id, p_estado: estado, p_nota: nota || null }); setMesaSel(null); setReserva(null); recargar(); } catch (e) { aviso.error(e); }
  }
  const tocar = (m) => {
    if (m.pedidos.length === 1) return setDetalle(m.pedidos[0].id);
    setMesaSel(m);
  };
  if (cargando && !datos) return <Cargando />;
  const zonas = [...new Set((datos || []).map((m) => m.zona || ''))];
  const color = { libre: 'border-emerald-200 bg-emerald-50', ocupada: 'border-vino-300 bg-vino-50', reservada: 'border-dorado-300 bg-dorado-50' };
  return (
    <div>
      <Encabezado titulo="Mesas" subtitulo="Toca una mesa libre para abrir cuenta, u ocupada para ver su cuenta">
        <button className="btn-secundario" onClick={recargar}><RefreshCw size={15} /> Actualizar</button>
      </Encabezado>
      <div className="mb-4 flex gap-3 text-xs">
        <Chip color="verde">Libre {datos?.filter((m) => m.estado === 'libre').length}</Chip>
        <Chip color="vino">Ocupada {datos?.filter((m) => m.estado === 'ocupada').length}</Chip>
        <Chip color="amarillo">Reservada {datos?.filter((m) => m.estado === 'reservada').length}</Chip>
      </div>
      {datos?.length === 0 && <p className="tarjeta p-6 text-center text-sm text-cafe-400">Esta sede no tiene mesas. Créalas en Sedes → Mesas.</p>}
      {zonas.map((z) => (
        <div key={z} className="mb-6">
          {z && <h3 className="mb-2 font-bold">{z}</h3>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {datos.filter((m) => (m.zona || '') === z).map((m) => {
              const total = m.pedidos.reduce((s, p) => s + Number(p.total) - Number(p.pagado), 0);
              const min = m.pedidos.length ? Math.max(...m.pedidos.map((p) => minutosDesde(p.creado_en))) : 0;
              return (
                <button key={m.id} onClick={() => tocar(m)} className={`rounded-2xl border-2 p-4 text-left transition hover:shadow-md ${color[m.estado]}`}>
                  <div className="flex items-center justify-between"><Armchair size={20} className={m.estado === 'ocupada' ? 'text-vino-700' : m.estado === 'reservada' ? 'text-dorado-600' : 'text-emerald-700'} />
                    <span className="flex items-center gap-1 text-xs text-cafe-400"><Users size={12} /> {m.capacidad}</span></div>
                  <p className="mt-2 font-titulo text-lg font-bold">{m.nombre}</p>
                  <p className="text-xs font-semibold">{etiqueta(m.estado)}</p>
                  {m.estado === 'ocupada' && <p className="mt-1 font-bold text-vino-700">{moneda(total)}</p>}
                  {m.estado === 'ocupada' && <p className="flex items-center gap-1 text-xs text-cafe-500"><Clock size={11} /> {min} min{m.pedidos.length > 1 ? ` · ${m.pedidos.length} cuentas` : ''}</p>}
                  {m.estado === 'reservada' && m.nota_reserva && <p className="mt-1 truncate text-xs">{m.nota_reserva}</p>}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <Modal abierto={!!mesaSel} onCerrar={() => setMesaSel(null)} titulo={mesaSel?.nombre}>
        {mesaSel && (
          <div className="space-y-2">
            {mesaSel.pedidos.map((p) => (
              <button key={p.id} className="btn-secundario w-full justify-between" onClick={() => { setMesaSel(null); setDetalle(p.id); }}>
                <span>Cuenta #{p.numero}</span><span>{moneda(Number(p.total) - Number(p.pagado))}</span></button>
            ))}
            {mesaSel.estado !== 'ocupada' && puede('pos.vender') && (
              <button className="btn-primario w-full" onClick={() => router.push(`/pos?mesa=${mesaSel.id}`)}>Abrir cuenta en esta mesa</button>
            )}
            {puede('mesas.gestionar') && mesaSel.estado === 'libre' && <button className="btn-secundario w-full" onClick={() => setReserva({ mesa: mesaSel, nota: '' })}><CalendarCheck size={15} /> Reservar</button>}
            {puede('mesas.gestionar') && mesaSel.estado === 'reservada' && <button className="btn-secundario w-full" onClick={() => cambiarEstado(mesaSel, 'libre')}>Liberar reserva</button>}
            <button className="btn-fantasma w-full" onClick={() => verHistorial(mesaSel)}><History size={15} /> Historial de la mesa</button>
          </div>
        )}
      </Modal>
      <Modal abierto={!!reserva} onCerrar={() => setReserva(null)} titulo={`Reservar ${reserva?.mesa?.nombre || ''}`}
        pie={<button className="btn-primario" onClick={() => cambiarEstado(reserva.mesa, 'reservada', reserva.nota)}>Reservar</button>}>
        <Campo etiqueta="A nombre de / hora"><input className="input" value={reserva?.nota || ''} onChange={(e) => setReserva({ ...reserva, nota: e.target.value })} autoFocus /></Campo>
      </Modal>
      <Modal abierto={!!historial} onCerrar={() => setHistorial(null)} titulo={`Historial · ${historial?.mesa?.nombre || ''}`} ancho="max-w-3xl">
        {historial && <TablaDatos filas={historial.filas} onFila={(f) => { setHistorial(null); setDetalle(f.id); }} columnas={[
          { clave: 'numero', titulo: 'Pedido' }, { clave: 'creado_en', titulo: 'Fecha', tipo: 'fechahora' },
          { clave: 'estado', titulo: 'Estado', tipo: 'estado' }, { clave: 'estado_pago', titulo: 'Pago', tipo: 'estado' }, { clave: 'total', titulo: 'Total', tipo: 'moneda' },
        ]} />}
      </Modal>
      <DetallePedido pedidoId={detalle} onCerrar={() => setDetalle(null)} onCambio={recargar} />
    </div>
  );
}

'use client';
import { useState } from 'react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, TablaDatos, useCarga } from '@/components/ui';
import DetallePedido from '@/components/DetallePedido';
import { q } from '@/lib/supabase';
import { hoyISO, etiqueta } from '@/lib/formato';

export default function Pagina() { return <Requiere permisos={['pedidos.ver']}><Pedidos /></Requiere>; }

function Pedidos() {
  const { sedeId } = useSesion();
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [estado, setEstado] = useState('');
  const [pago, setPago] = useState('');
  const [tipo, setTipo] = useState('');
  const [abierto, setAbierto] = useState(null);
  const { datos, cargando, recargar } = useCarga(() => q((sb) => {
    let c = sb.from('pedidos').select('*, mesas(nombre), clientes(nombre), perfiles!pedidos_usuario_id_fkey(nombre)').eq('sede_id', sedeId)
      .gte('creado_en', `${desde}T00:00:00-05:00`).lte('creado_en', `${hasta}T23:59:59-05:00`).order('numero', { ascending: false }).limit(1000);
    if (estado) c = c.eq('estado', estado);
    if (pago) c = c.eq('estado_pago', pago);
    if (tipo) c = c.eq('tipo_servicio', tipo);
    return c;
  }), [sedeId, desde, hasta, estado, pago, tipo]);

  return (
    <div>
      <Encabezado titulo="Pedidos" subtitulo="Historial de pedidos y ventas de la sede" />
      <div className="mb-3 flex flex-wrap gap-2">
        <input type="date" className="input w-auto" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input type="date" className="input w-auto" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <select className="input w-auto" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {['pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado'].map((x) => <option key={x} value={x}>{etiqueta(x)}</option>)}
        </select>
        <select className="input w-auto" value={pago} onChange={(e) => setPago(e.target.value)}>
          <option value="">Todos los pagos</option>
          {['abierto', 'parcial', 'pagado', 'anulado'].map((x) => <option key={x} value={x}>{etiqueta(x)}</option>)}
        </select>
        <select className="input w-auto" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos los servicios</option>
          {['mesa', 'mostrador', 'llevar', 'recoger', 'domicilio'].map((x) => <option key={x} value={x}>{etiqueta(x)}</option>)}
        </select>
      </div>
      <TablaDatos cargando={cargando} filas={datos || []} exportar="Pedidos" subtitulo={`${desde} a ${hasta}`} onFila={(f) => setAbierto(f.id)} columnas={[
        { clave: 'numero', titulo: 'N.º' },
        { clave: 'creado_en', titulo: 'Fecha', tipo: 'fechahora' },
        { clave: 'tipo_servicio', titulo: 'Servicio', render: (f) => `${etiqueta(f.tipo_servicio)}${f.mesas?.nombre ? ' · ' + f.mesas.nombre : ''}`, exportar: (f) => `${etiqueta(f.tipo_servicio)}${f.mesas?.nombre ? ' · ' + f.mesas.nombre : ''}` },
        { clave: 'cliente', titulo: 'Cliente', render: (f) => f.clientes?.nombre || 'General', exportar: (f) => f.clientes?.nombre || 'General', valorBusqueda: (f) => f.clientes?.nombre },
        { clave: 'usuario', titulo: 'Usuario', render: (f) => f.perfiles?.nombre, exportar: (f) => f.perfiles?.nombre },
        { clave: 'estado', titulo: 'Estado', tipo: 'estado' },
        { clave: 'estado_pago', titulo: 'Pago', tipo: 'estado' },
        { clave: 'comprobante_numero', titulo: 'Comprobante' },
        { clave: 'total', titulo: 'Total', tipo: 'moneda' },
      ]} />
      <DetallePedido pedidoId={abierto} onCerrar={() => setAbierto(null)} onCambio={recargar} />
    </div>
  );
}

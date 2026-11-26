'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2, Check, X, Truck, PackageCheck, Ban } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Campo, Modal, TablaDatos, Estado, Cargando, Alerta, useAviso, useConfirmar, useCarga } from '@/components/ui';
import { q, rpc } from '@/lib/supabase';
import { numero, fechaHora, moneda } from '@/lib/formato';

export default function Pagina() { return <Requiere permisos={['transferencias.ver']}><Transferencias /></Requiere>; }

function Transferencias() {
  const { sedeId, sedes, puede } = useSesion();
  const aviso = useAviso();
  const [nueva, setNueva] = useState(null);
  const [ver, setVer] = useState(null);
  const [todasSedes, setTodasSedes] = useState([]);
  const [insumos, setInsumos] = useState([]);
  useEffect(() => {
    q((sb) => sb.from('sedes').select('id,nombre').eq('activa', true).order('nombre')).then(setTodasSedes);
    q((sb) => sb.from('insumos').select('id,nombre,unidades(abreviatura)').eq('activo', true).order('nombre')).then(setInsumos);
  }, []);
  const { datos, cargando, recargar } = useCarga(() => q((sb) => sb.from('transferencias')
    .select('*, origen:sedes!transferencias_sede_origen_id_fkey(nombre), destino:sedes!transferencias_sede_destino_id_fkey(nombre), transferencia_items(id)')
    .or(`sede_origen_id.eq.${sedeId},sede_destino_id.eq.${sedeId}`).order('creado_en', { ascending: false })), [sedeId]);

  async function crear() {
    try {
      await rpc('crear_transferencia', { p_origen: nueva.origen, p_destino: nueva.destino, p_items: nueva.items.filter((i) => i.insumo_id && Number(i.cantidad) > 0).map((i) => ({ insumo_id: i.insumo_id, cantidad: Number(i.cantidad) })), p_obs: nueva.obs || null });
      setNueva(null); recargar(); aviso.ok('Solicitud de transferencia creada.');
    } catch (e) { aviso.error(e); }
  }
  return (
    <div>
      <Encabezado titulo="Transferencias entre sedes" subtitulo="Solicitud → aprobación → despacho → recepción, con trazabilidad y diferencias">
        {puede('transferencias.solicitar') && <button className="btn-primario" onClick={() => setNueva({ origen: todasSedes.find((s) => s.id !== sedeId)?.id || '', destino: sedeId, items: [{ insumo_id: '', cantidad: '' }], obs: '' })}><Plus size={16} /> Nueva transferencia</button>}
      </Encabezado>
      {todasSedes.length < 2 && <Alerta>Necesitas al menos dos sedes para hacer transferencias. Crea otra sede en el módulo Sedes.</Alerta>}
      <TablaDatos cargando={cargando} filas={datos || []} onFila={(f) => setVer(f.id)} exportar="Transferencias" columnas={[
        { clave: 'numero', titulo: 'N.º' }, { clave: 'creado_en', titulo: 'Fecha', tipo: 'fechahora' },
        { clave: 'origen', titulo: 'Origen', render: (f) => f.origen?.nombre, exportar: (f) => f.origen?.nombre },
        { clave: 'destino', titulo: 'Destino', render: (f) => f.destino?.nombre, exportar: (f) => f.destino?.nombre },
        { clave: 'items', titulo: 'Productos', render: (f) => f.transferencia_items.length, exportar: (f) => f.transferencia_items.length },
        { clave: 'estado', titulo: 'Estado', tipo: 'estado' },
      ]} />
      <Modal abierto={!!nueva} onCerrar={() => setNueva(null)} titulo="Nueva transferencia" ancho="max-w-2xl"
        pie={<><button className="btn-secundario" onClick={() => setNueva(null)}>Cancelar</button><button className="btn-primario" disabled={!nueva?.origen || !nueva?.destino || nueva?.origen === nueva?.destino} onClick={crear}>Crear solicitud</button></>}>
        {nueva && <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Sede de origen (envía)"><select className="input" value={nueva.origen} onChange={(e) => setNueva({ ...nueva, origen: e.target.value })}><option value="">—</option>{todasSedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></Campo>
            <Campo etiqueta="Sede de destino (recibe)"><select className="input" value={nueva.destino} onChange={(e) => setNueva({ ...nueva, destino: e.target.value })}><option value="">—</option>{todasSedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></Campo>
          </div>
          {nueva.items.map((it, i) => (
            <div key={i} className="flex gap-2">
              <select className="input" value={it.insumo_id} onChange={(e) => setNueva({ ...nueva, items: nueva.items.map((x, j) => (j === i ? { ...x, insumo_id: e.target.value } : x)) })}>
                <option value="">Producto…</option>{insumos.map((x) => <option key={x.id} value={x.id}>{x.nombre} ({x.unidades?.abreviatura})</option>)}</select>
              <input type="number" step="any" className="input w-32" placeholder="Cantidad" value={it.cantidad} onChange={(e) => setNueva({ ...nueva, items: nueva.items.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)) })} />
              <button className="btn-fantasma" onClick={() => setNueva({ ...nueva, items: nueva.items.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
            </div>
          ))}
          <button className="btn-fantasma btn-sm" onClick={() => setNueva({ ...nueva, items: [...nueva.items, { insumo_id: '', cantidad: '' }] })}><Plus size={14} /> Agregar producto</button>
          <Campo etiqueta="Observaciones"><input className="input" value={nueva.obs} onChange={(e) => setNueva({ ...nueva, obs: e.target.value })} /></Campo>
        </div>}
      </Modal>
      {ver && <Detalle id={ver} onCerrar={() => setVer(null)} onCambio={recargar} />}
    </div>
  );
}

function Detalle({ id, onCerrar, onCambio }) {
  const { puede, sedes } = useSesion();
  const aviso = useAviso();
  const confirmar = useConfirmar();
  const [cant, setCant] = useState({});
  const [obs, setObs] = useState({});
  const { datos, recargar } = useCarga(async () => {
    const [t, items] = await Promise.all([
      q((sb) => sb.from('transferencias').select('*, origen:sedes!transferencias_sede_origen_id_fkey(nombre), destino:sedes!transferencias_sede_destino_id_fkey(nombre)').eq('id', id).single()),
      q((sb) => sb.from('transferencia_items').select('*, insumos(nombre, unidades(abreviatura))').eq('transferencia_id', id)),
    ]);
    return { t, items };
  }, [id]);
  if (!datos) return <Modal abierto onCerrar={onCerrar} titulo="Transferencia"><Cargando /></Modal>;
  const { t, items } = datos;
  const misSedes = new Set(sedes.map((s) => s.id));
  const hecho = async (fn, msg) => { try { await fn(); aviso.ok(msg); recargar(); onCambio(); } catch (e) { aviso.error(e); } };
  const aprobar = async (ok) => {
    const r = await confirmar({ titulo: ok ? 'Aprobar transferencia' : 'Rechazar transferencia', pedirMotivo: !ok, peligro: !ok, textoBoton: ok ? 'Aprobar' : 'Rechazar' });
    if (r.ok) hecho(() => rpc('aprobar_transferencia', { p_id: id, p_aprobar: ok, p_obs: r.motivo || null }), ok ? 'Aprobada.' : 'Rechazada.');
  };
  const cancelar = async () => {
    const r = await confirmar({ titulo: 'Cancelar transferencia', pedirMotivo: true, peligro: true, textoBoton: 'Cancelar' });
    if (r.ok) hecho(() => rpc('cancelar_transferencia', { p_id: id, p_motivo: r.motivo }), 'Cancelada.');
  };
  const editarEnvio = t.estado === 'aprobada' && puede('transferencias.despachar') && misSedes.has(t.sede_origen_id);
  const editarRecibo = t.estado === 'despachada' && puede('transferencias.recibir') && misSedes.has(t.sede_destino_id);
  return (
    <Modal abierto onCerrar={onCerrar} ancho="max-w-3xl" titulo={`Transferencia #${t.numero} · ${t.origen?.nombre} → ${t.destino?.nombre}`}
      pie={<>
        {['solicitud', 'aprobada'].includes(t.estado) && puede('transferencias.solicitar') && <button className="btn-secundario text-red-700" onClick={cancelar}><Ban size={15} /> Cancelar</button>}
        {t.estado === 'solicitud' && puede('transferencias.aprobar') && <><button className="btn-secundario" onClick={() => aprobar(false)}><X size={15} /> Rechazar</button><button className="btn-primario" onClick={() => aprobar(true)}><Check size={15} /> Aprobar</button></>}
        {editarEnvio && <button className="btn-primario" onClick={() => hecho(() => rpc('despachar_transferencia', { p_id: id, p_items: items.map((i) => ({ id: i.id, cantidad_enviada: cant[i.id] ?? i.cantidad_solicitada })) }), 'Despachada: se descontó del inventario de origen.')}><Truck size={15} /> Despachar</button>}
        {editarRecibo && <button className="btn-primario" onClick={() => hecho(() => rpc('recibir_transferencia', { p_id: id, p_items: items.map((i) => ({ id: i.id, cantidad_recibida: cant[i.id] ?? i.cantidad_enviada, observacion: obs[i.id] || null })) }), 'Recibida: se sumó al inventario de destino.')}><PackageCheck size={15} /> Confirmar recepción</button>}
      </>}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm"><Estado valor={t.estado} />
        <span className="text-cafe-400">Creada {fechaHora(t.creado_en)}{t.aprobada_en ? ` · aprobada ${fechaHora(t.aprobada_en)}` : ''}{t.despachada_en ? ` · despachada ${fechaHora(t.despachada_en)}` : ''}{t.recibida_en ? ` · recibida ${fechaHora(t.recibida_en)}` : ''}</span></div>
      <table className="tabla">
        <thead><tr><th>Producto</th><th className="text-right">Solicitado</th><th className="text-right">Enviado</th><th className="text-right">Recibido</th><th className="text-right">Diferencia</th><th className="text-right">Valor</th></tr></thead>
        <tbody>{items.map((i) => {
          const dif = i.cantidad_recibida !== null && i.cantidad_enviada !== null ? i.cantidad_recibida - i.cantidad_enviada : null;
          return (
            <tr key={i.id}>
              <td>{i.insumos?.nombre} <span className="text-xs text-cafe-400">{i.insumos?.unidades?.abreviatura}</span>{i.observacion_diferencia && <span className="block text-xs text-red-700">{i.observacion_diferencia}</span>}</td>
              <td className="text-right">{numero(i.cantidad_solicitada)}</td>
              <td className="text-right">{editarEnvio ? <input type="number" step="any" className="input w-24 text-right" defaultValue={i.cantidad_solicitada} onChange={(e) => setCant({ ...cant, [i.id]: Number(e.target.value) })} /> : numero(i.cantidad_enviada)}</td>
              <td className="text-right">{editarRecibo ? <div className="flex flex-col items-end gap-1"><input type="number" step="any" className="input w-24 text-right" defaultValue={i.cantidad_enviada} onChange={(e) => setCant({ ...cant, [i.id]: Number(e.target.value) })} />
                <input className="input w-40 text-xs" placeholder="Obs. diferencia" onChange={(e) => setObs({ ...obs, [i.id]: e.target.value })} /></div> : numero(i.cantidad_recibida)}</td>
              <td className={`text-right ${dif < 0 ? 'font-bold text-red-700' : ''}`}>{dif === null ? '—' : numero(dif)}</td>
              <td className="text-right">{moneda((i.cantidad_enviada ?? i.cantidad_solicitada) * i.costo_unitario)}</td>
            </tr>);
        })}</tbody>
      </table>
      {t.observaciones && <p className="mt-3 whitespace-pre-wrap text-sm">Obs.: {t.observaciones}</p>}
    </Modal>
  );
}

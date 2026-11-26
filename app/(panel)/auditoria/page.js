'use client';
import { useEffect, useState } from 'react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Pestanas, TablaDatos, Modal, useCarga } from '@/components/ui';
import { q } from '@/lib/supabase';
import { hoyISO, fechaHora } from '@/lib/formato';

export default function Pagina() { return <Requiere permisos={['auditoria.ver']}><Auditoria /></Requiere>; }

const OCULTAR = new Set(['creado_en', 'actualizado_en']);

function Auditoria() {
  const [tab, setTab] = useState('registro');
  return (
    <div>
      <Encabezado titulo="Auditoría" subtitulo="Quién hizo qué, cuándo y en qué sede. Los registros no se pueden borrar ni modificar." />
      <Pestanas valor={tab} onCambio={setTab} opciones={[{ id: 'registro', etiqueta: 'Registro de actividad' }, { id: 'errores', etiqueta: 'Errores del sistema' }]} />
      {tab === 'registro' ? <Registro /> : <Errores />}
    </div>
  );
}

function Registro() {
  const { sedes } = useSesion();
  const [desde, setDesde] = useState(hoyISO(-7));
  const [hasta, setHasta] = useState(hoyISO());
  const [usuario, setUsuario] = useState('');
  const [accion, setAccion] = useState('');
  const [usuarios, setUsuarios] = useState([]);
  const [ver, setVer] = useState(null);
  useEffect(() => { q((sb) => sb.from('perfiles').select('id,nombre').order('nombre')).then(setUsuarios); }, []);
  const { datos, cargando } = useCarga(() => q((sb) => {
    let c = sb.from('auditoria').select('*').gte('fecha', `${desde}T00:00:00-05:00`).lte('fecha', `${hasta}T23:59:59-05:00`).order('fecha', { ascending: false }).limit(3000);
    if (usuario) c = c.eq('usuario_id', usuario);
    if (accion) c = c.ilike('accion', `%${accion}%`);
    return c;
  }), [desde, hasta, usuario, accion]);
  const sede = (id) => sedes.find((s) => s.id === id)?.nombre || (id ? '—' : 'General');
  const cambios = ver ? Object.keys({ ...(ver.antes || {}), ...(ver.despues || {}) }).filter((k) => !OCULTAR.has(k) && JSON.stringify(ver.antes?.[k]) !== JSON.stringify(ver.despues?.[k])) : [];
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <input type="date" className="input w-auto" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input type="date" className="input w-auto" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <select className="input w-auto" value={usuario} onChange={(e) => setUsuario(e.target.value)}><option value="">Todos los usuarios</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
        <select className="input w-auto" value={accion} onChange={(e) => setAccion(e.target.value)}>
          <option value="">Todas las acciones</option>
          {['inicio_sesion', 'cierre_sesion', 'venta', 'venta_anulada', 'pedido_cancelado', 'devolucion', 'descuento', 'apertura_caja', 'cierre_caja', 'correccion_cierre', 'movimiento_caja',
            'salida_dinero', 'salida_anulada', 'compra', 'movimiento_inventario', 'conteo_aplicado', 'produccion', 'transferencia', 'crear', 'modificar', 'eliminar'].map((a) => <option key={a} value={a}>{a.replaceAll('_', ' ')}</option>)}
        </select>
      </div>
      <TablaDatos cargando={cargando} filas={datos || []} exportar="Auditoría" onFila={setVer} columnas={[
        { clave: 'fecha', titulo: 'Fecha', tipo: 'fechahora' }, { clave: 'usuario_nombre', titulo: 'Usuario', render: (f) => f.usuario_nombre || 'Sistema' },
        { clave: 'sede', titulo: 'Sede', render: (f) => sede(f.sede_id), exportar: (f) => sede(f.sede_id) },
        { clave: 'accion', titulo: 'Acción', render: (f) => f.accion.replaceAll('_', ' ') }, { clave: 'tabla', titulo: 'Registro' },
        { clave: 'detalle', titulo: 'Detalle', className: 'max-w-xs truncate' },
      ]} />
      <Modal abierto={!!ver} onCerrar={() => setVer(null)} titulo={ver ? `${ver.accion.replaceAll('_', ' ')} · ${ver.tabla || ''}` : ''} ancho="max-w-3xl">
        {ver && <div className="space-y-3 text-sm">
          <p>{fechaHora(ver.fecha)} · <b>{ver.usuario_nombre || 'Sistema'}</b> · {sede(ver.sede_id)} · registro {ver.registro_id}</p>
          {ver.detalle && <p className="rounded bg-crema-100 px-3 py-2">{ver.detalle}</p>}
          {cambios.length > 0 && <table className="tabla"><thead><tr><th>Campo</th><th>Antes</th><th>Después</th></tr></thead>
            <tbody>{cambios.map((k) => <tr key={k}><td className="font-semibold">{k}</td><td className="break-all text-red-700">{JSON.stringify(ver.antes?.[k] ?? null)}</td><td className="break-all text-emerald-700">{JSON.stringify(ver.despues?.[k] ?? null)}</td></tr>)}</tbody></table>}
        </div>}
      </Modal>
    </>
  );
}

function Errores() {
  const { datos, cargando } = useCarga(() => q((sb) => sb.from('registro_errores').select('*').order('fecha', { ascending: false }).limit(500)), []);
  return <TablaDatos cargando={cargando} filas={datos || []} exportar="Errores" columnas={[{ clave: 'fecha', titulo: 'Fecha', tipo: 'fechahora' }, { clave: 'ruta', titulo: 'Pantalla' }, { clave: 'mensaje', titulo: 'Mensaje' }]} vacio="Sin errores registrados." />;
}

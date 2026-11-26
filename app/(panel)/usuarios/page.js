'use client';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, KeyRound, ShieldCheck, History, Trash2 } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Pestanas, Campo, Modal, TablaDatos, Chip, Cargando, Alerta, useAviso, useConfirmar, useCarga } from '@/components/ui';
import { q, rpc, supabase } from '@/lib/supabase';
import { fechaHora } from '@/lib/formato';

export default function Pagina() { return <Requiere permisos={['usuarios.ver', 'roles.gestionar']}><Usuarios /></Requiere>; }

async function api(cuerpo) {
  const { data: { session } } = await supabase().auth.getSession();
  const r = await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify(cuerpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'No se pudo completar la operación.');
  return j;
}

function Usuarios() {
  const { puede } = useSesion();
  const [tab, setTab] = useState(puede('usuarios.ver') ? 'usuarios' : 'roles');
  return (
    <div>
      <Encabezado titulo="Usuarios y permisos" subtitulo="Accesos del personal, roles configurables y registro de actividad" />
      <Pestanas valor={tab} onCambio={setTab} opciones={[puede('usuarios.ver') && { id: 'usuarios', etiqueta: 'Usuarios' }, puede('roles.gestionar') && { id: 'roles', etiqueta: 'Roles y permisos' }]} />
      {tab === 'usuarios' ? <ListaUsuarios /> : <Roles />}
    </div>
  );
}

function ListaUsuarios() {
  const { puede, perfil } = useSesion();
  const aviso = useAviso();
  const [roles, setRoles] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [form, setForm] = useState(null);
  const [clave, setClave] = useState(null);
  const [extra, setExtra] = useState(null);
  const [actividad, setActividad] = useState(null);
  useEffect(() => {
    q((sb) => sb.from('roles').select('*').order('nombre')).then(setRoles);
    q((sb) => sb.from('sedes').select('id,nombre').eq('activa', true).order('nombre')).then(setSedes);
  }, []);
  const { datos, cargando, recargar } = useCarga(() => q((sb) => sb.from('perfiles').select('*, roles(nombre), usuario_sedes(sede_id)').order('nombre')), []);
  const nombreSede = (id) => sedes.find((s) => s.id === id)?.nombre || '';

  async function guardar() {
    const f = form;
    try {
      if (!f.id) {
        await api({ accion: 'crear', nombre: f.nombre, usuario: f.usuario, correo: f.correo, telefono: f.telefono, contrasena: f.contrasena, rol_id: f.rol_id, sedes: f.sedes, sede_principal_id: f.sede_principal_id || f.sedes[0] });
        aviso.ok('Usuario creado. Ya puede iniciar sesión.');
      } else {
        await rpc('actualizar_usuario', { p_id: f.id, p_nombre: f.nombre, p_usuario: f.usuario, p_telefono: f.telefono || null, p_rol: f.rol_id, p_sedes: f.sedes, p_activo: f.activo, p_sede_principal: f.sede_principal_id || null });
        if (f.activo !== f.activoOriginal) await api({ accion: 'acceso', id: f.id, activo: f.activo });
        aviso.ok('Usuario actualizado.');
      }
      setForm(null); recargar();
    } catch (e) { aviso.error(e); }
  }
  async function cambiarClave() {
    try { await api({ accion: 'contrasena', id: clave.id, contrasena: clave.valor }); setClave(null); aviso.ok('Contraseña actualizada.'); } catch (e) { aviso.error(e); }
  }
  async function verActividad(u) {
    try { setActividad({ u, filas: await q((sb) => sb.from('auditoria').select('*').eq('usuario_id', u.id).order('fecha', { ascending: false }).limit(300)) }); } catch (e) { aviso.error(e); }
  }
  const rolSel = roles.find((r) => r.id === form?.rol_id);
  return (
    <>
      {puede('usuarios.gestionar') && <div className="mb-3 flex justify-end"><button className="btn-primario" onClick={() => setForm({ nombre: '', usuario: '', correo: '', telefono: '', contrasena: '', rol_id: '', sedes: [], sede_principal_id: '', activo: true })}><Plus size={16} /> Nuevo usuario</button></div>}
      <TablaDatos cargando={cargando} filas={datos || []} exportar="Usuarios" columnas={[
        { clave: 'nombre', titulo: 'Nombre' }, { clave: 'usuario', titulo: 'Usuario' },
        { clave: 'correo', titulo: 'Correo', render: (f) => (f.correo?.endsWith('.local') ? <span className="text-cafe-300">sin correo</span> : f.correo), exportar: (f) => f.correo },
        { clave: 'rol', titulo: 'Rol', render: (f) => f.roles?.nombre, exportar: (f) => f.roles?.nombre },
        { clave: 'sedes', titulo: 'Sedes', render: (f) => f.usuario_sedes.map((s) => nombreSede(s.sede_id)).join(', ') || (f.roles?.nombre === 'Administrador general' ? 'Todas' : '—'), exportar: (f) => f.usuario_sedes.map((s) => nombreSede(s.sede_id)).join(', ') },
        { clave: 'ultimo_inicio', titulo: 'Último ingreso', tipo: 'fechahora' },
        { clave: 'activo', titulo: 'Estado', render: (f) => (f.bloqueado_hasta && new Date(f.bloqueado_hasta) > new Date() ? <Chip color="rojo">Bloqueado temporal</Chip> : <Chip color={f.activo ? 'verde' : 'gris'}>{f.activo ? 'Activo' : 'Inactivo'}</Chip>), exportar: (f) => (f.activo ? 'Activo' : 'Inactivo') },
      ]} acciones={(f) => (
        <div className="flex justify-end gap-1">
          {puede('auditoria.ver') && <button className="btn-secundario btn-sm" title="Actividad" onClick={() => verActividad(f)}><History size={13} /></button>}
          {puede('roles.gestionar') && <button className="btn-secundario btn-sm" title="Permisos individuales" onClick={() => setExtra(f)}><ShieldCheck size={13} /></button>}
          {puede('usuarios.gestionar') && <>
            <button className="btn-secundario btn-sm" title="Cambiar contraseña" onClick={() => setClave({ id: f.id, nombre: f.nombre, valor: '' })}><KeyRound size={13} /></button>
            <button className="btn-secundario btn-sm" title="Editar" onClick={() => setForm({ ...f, telefono: f.telefono || '', sedes: f.usuario_sedes.map((s) => s.sede_id), activoOriginal: f.activo, sede_principal_id: f.sede_principal_id || '' })}><Pencil size={13} /></button>
          </>}
        </div>
      )} />

      <Modal abierto={!!form} onCerrar={() => setForm(null)} titulo={form?.id ? 'Editar usuario' : 'Nuevo usuario'} ancho="max-w-2xl"
        pie={<><button className="btn-secundario" onClick={() => setForm(null)}>Cancelar</button><button className="btn-primario" disabled={!form?.nombre?.trim() || !form?.usuario?.trim() || !form?.rol_id} onClick={guardar}>Guardar</button></>}>
        {form && <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre completo *"><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Campo>
          <Campo etiqueta="Usuario para iniciar sesión *"><input className="input lowercase" value={form.usuario || ''} onChange={(e) => setForm({ ...form, usuario: e.target.value.toLowerCase().replace(/\s/g, '') })} /></Campo>
          {!form.id && <Campo etiqueta="Correo (opcional)" ayuda="Sin correo, el usuario no podrá recuperar su contraseña por sí mismo."><input type="email" className="input" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} /></Campo>}
          {!form.id && <Campo etiqueta="Contraseña inicial * (mín. 8)"><input type="text" className="input" value={form.contrasena} onChange={(e) => setForm({ ...form, contrasena: e.target.value })} /></Campo>}
          <Campo etiqueta="Teléfono"><input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></Campo>
          <Campo etiqueta="Rol *"><select className="input" value={form.rol_id || ''} onChange={(e) => setForm({ ...form, rol_id: e.target.value })} disabled={form.id === perfil.id}>
            <option value="">Selecciona…</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></Campo>
          <div className="sm:col-span-2">
            <p className="etiqueta">Sedes asignadas {rolSel?.todas_las_sedes && <span className="normal-case text-cafe-400">(este rol ve todas las sedes)</span>}</p>
            <div className="flex flex-wrap gap-2">
              {sedes.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded-lg border border-crema-200 px-3 py-1.5 text-sm">
                  <input type="checkbox" checked={form.sedes.includes(s.id)} onChange={(e) => setForm({ ...form, sedes: e.target.checked ? [...form.sedes, s.id] : form.sedes.filter((x) => x !== s.id) })} /> {s.nombre}
                </label>
              ))}
            </div>
          </div>
          {form.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.activo} disabled={form.id === perfil.id} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /> Usuario activo (desmarcar bloquea su acceso)</label>}
        </div>}
      </Modal>
      <Modal abierto={!!clave} onCerrar={() => setClave(null)} titulo={`Nueva contraseña · ${clave?.nombre || ''}`}
        pie={<button className="btn-primario" disabled={(clave?.valor || '').length < 8} onClick={cambiarClave}>Guardar</button>}>
        <Campo etiqueta="Contraseña nueva (mínimo 8 caracteres)"><input className="input" value={clave?.valor || ''} onChange={(e) => setClave({ ...clave, valor: e.target.value })} autoFocus /></Campo>
      </Modal>
      {extra && <PermisosUsuario usuario={extra} onCerrar={() => setExtra(null)} />}
      <Modal abierto={!!actividad} onCerrar={() => setActividad(null)} titulo={`Actividad · ${actividad?.u?.nombre || ''}`} ancho="max-w-3xl">
        {actividad && <TablaDatos filas={actividad.filas} exportar={`Actividad ${actividad.u.nombre}`} columnas={[
          { clave: 'fecha', titulo: 'Fecha', tipo: 'fechahora' }, { clave: 'accion', titulo: 'Acción', render: (f) => f.accion.replaceAll('_', ' ') },
          { clave: 'tabla', titulo: 'Módulo' }, { clave: 'detalle', titulo: 'Detalle' },
        ]} />}
      </Modal>
    </>
  );
}

function usePermisos() {
  const [permisos, setPermisos] = useState(null);
  useEffect(() => { q((sb) => sb.from('permisos').select('*').neq('codigo', '*').order('orden')).then(setPermisos); }, []);
  const modulos = useMemo(() => {
    const m = {}; (permisos || []).forEach((p) => { (m[p.modulo] ||= []).push(p); }); return Object.entries(m);
  }, [permisos]);
  return modulos;
}

function PermisosUsuario({ usuario, onCerrar }) {
  const aviso = useAviso();
  const modulos = usePermisos();
  const [valores, setValores] = useState(null);
  const [delRol, setDelRol] = useState(new Set());
  useEffect(() => {
    Promise.all([
      q((sb) => sb.from('usuario_permisos').select('*').eq('usuario_id', usuario.id)),
      q((sb) => sb.from('rol_permisos').select('permiso').eq('rol_id', usuario.rol_id)),
    ]).then(([up, rp]) => { setValores(Object.fromEntries(up.map((x) => [x.permiso, x.concedido]))); setDelRol(new Set(rp.map((x) => x.permiso))); });
  }, [usuario]);
  async function guardar() { try { await rpc('asignar_permisos_usuario', { p_id: usuario.id, p_permisos: valores }); aviso.ok('Permisos individuales guardados.'); onCerrar(); } catch (e) { aviso.error(e); } }
  const esAdmin = delRol.has('*');
  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Permisos de ${usuario.nombre}`} ancho="max-w-3xl" pie={<button className="btn-primario" onClick={guardar}>Guardar</button>}>
      <Alerta tono="azul">Por defecto el usuario tiene los permisos de su rol ({usuario.roles?.nombre}). Aquí puedes concederle o quitarle permisos puntuales.</Alerta>
      {!valores ? <Cargando /> : modulos.map(([mod, lista]) => (
        <div key={mod} className="mb-3"><p className="etiqueta">{mod}</p>
          {lista.map((p) => {
            const rol = esAdmin || delRol.has(p.codigo);
            const v = valores[p.codigo];
            return (
              <div key={p.codigo} className="flex items-center gap-3 border-b border-crema-100 py-1.5 text-sm">
                <span className="flex-1">{p.descripcion}</span>
                <select className="input w-56 py-1" value={v === undefined ? '' : v ? 'si' : 'no'} onChange={(e) => setValores({ ...valores, [p.codigo]: e.target.value === '' ? undefined : e.target.value === 'si' })}>
                  <option value="">Según rol ({rol ? 'sí' : 'no'})</option><option value="si">Conceder</option><option value="no">Quitar</option>
                </select>
              </div>);
          })}
        </div>
      ))}
    </Modal>
  );
}

function Roles() {
  const aviso = useAviso();
  const confirmar = useConfirmar();
  const modulos = usePermisos();
  const [edit, setEdit] = useState(null);
  const { datos, cargando, recargar } = useCarga(() => q((sb) => sb.from('roles').select('*, rol_permisos(permiso)').order('nombre')), []);
  async function guardar() {
    try { await rpc('guardar_rol', { p_id: edit.id || null, p_nombre: edit.nombre, p_descripcion: edit.descripcion || null, p_todas: edit.todas_las_sedes, p_permisos: [...edit.permisos] }); setEdit(null); recargar(); aviso.ok('Rol guardado.'); }
    catch (e) { aviso.error(e); }
  }
  async function eliminar(r) {
    const c = await confirmar({ titulo: `Eliminar rol "${r.nombre}"`, mensaje: 'Solo se puede eliminar si ningún usuario lo tiene asignado.', peligro: true, textoBoton: 'Eliminar' });
    if (!c.ok) return;
    try { await q((sb) => sb.from('roles').delete().eq('id', r.id)); recargar(); } catch (e) { aviso.error(e); }
  }
  return (
    <>
      <div className="mb-3 flex justify-end"><button className="btn-primario" onClick={() => setEdit({ nombre: '', descripcion: '', todas_las_sedes: false, permisos: new Set() })}><Plus size={16} /> Nuevo rol</button></div>
      <TablaDatos cargando={cargando} filas={datos || []} columnas={[
        { clave: 'nombre', titulo: 'Rol' }, { clave: 'descripcion', titulo: 'Descripción' },
        { clave: 'permisos', titulo: 'Permisos', render: (f) => (f.rol_permisos.some((p) => p.permiso === '*') ? 'Acceso total' : f.rol_permisos.length) },
        { clave: 'todas_las_sedes', titulo: 'Todas las sedes', tipo: 'booleano' },
      ]} acciones={(f) => !f.rol_permisos.some((p) => p.permiso === '*') && (
        <div className="flex justify-end gap-1">
          <button className="btn-secundario btn-sm" onClick={() => setEdit({ ...f, permisos: new Set(f.rol_permisos.map((p) => p.permiso)) })}><Pencil size={13} /></button>
          {!f.es_sistema && <button className="btn-secundario btn-sm text-red-700" onClick={() => eliminar(f)}><Trash2 size={13} /></button>}
        </div>
      )} />
      <Modal abierto={!!edit} onCerrar={() => setEdit(null)} titulo={edit?.id ? `Rol: ${edit.nombre}` : 'Nuevo rol'} ancho="max-w-3xl"
        pie={<><button className="btn-secundario" onClick={() => setEdit(null)}>Cancelar</button><button className="btn-primario" disabled={!edit?.nombre?.trim()} onClick={guardar}>Guardar rol</button></>}>
        {edit && <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Nombre"><input className="input" value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Descripción"><input className="input" value={edit.descripcion || ''} onChange={(e) => setEdit({ ...edit, descripcion: e.target.value })} /></Campo>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.todas_las_sedes} onChange={(e) => setEdit({ ...edit, todas_las_sedes: e.target.checked })} /> Ve todas las sedes</label>
          </div>
          {modulos.map(([mod, lista]) => (
            <div key={mod} className="mb-3">
              <div className="flex items-center justify-between"><p className="etiqueta">{mod}</p>
                <button className="text-xs text-vino-600" onClick={() => { const s = new Set(edit.permisos); const todos = lista.every((p) => s.has(p.codigo)); lista.forEach((p) => (todos ? s.delete(p.codigo) : s.add(p.codigo))); setEdit({ ...edit, permisos: s }); }}>Todos / ninguno</button></div>
              <div className="grid gap-1 sm:grid-cols-2">
                {lista.map((p) => (
                  <label key={p.codigo} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-crema-50">
                    <input type="checkbox" checked={edit.permisos.has(p.codigo)} onChange={(e) => { const s = new Set(edit.permisos); e.target.checked ? s.add(p.codigo) : s.delete(p.codigo); setEdit({ ...edit, permisos: s }); }} /> {p.descripcion}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </>}
      </Modal>
    </>
  );
}

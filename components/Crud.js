'use client';
import { useState } from 'react';
import { Plus, Pencil, Power } from 'lucide-react';
import { Modal, Campo, TablaDatos, Chip, useAviso, useCarga } from './ui';
import { q } from '@/lib/supabase';

/**
 * Catálogo genérico con crear, editar y activar/desactivar (nunca borra).
 * campos: [{ clave, etiqueta, tipo, opciones, requerido, ancho, defecto, ayuda }]
 */
export default function Crud({
  tabla, titulo = 'registro', campos, columnas, select = '*', orden = 'nombre', filtro, valoresFijos = {},
  puedeEditar = true, puedeCrear = true, campoActivo = 'activo', exportar, acciones, deps = [], alGuardar, transformar,
}) {
  const aviso = useAviso();
  const [edit, setEdit] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const { datos, cargando, recargar } = useCarga(() => q((sb) => {
    let c = sb.from(tabla).select(select).order(orden);
    if (filtro) c = filtro(c);
    return c;
  }), deps);

  const nuevo = () => setEdit(Object.fromEntries(campos.map((c) => [c.clave, c.defecto ?? (c.tipo === 'booleano' ? false : '')])));
  async function guardar() {
    const faltan = campos.filter((c) => c.requerido && (edit[c.clave] === '' || edit[c.clave] === null || edit[c.clave] === undefined));
    if (faltan.length) return aviso.error(`Completa: ${faltan.map((c) => c.etiqueta).join(', ')}`);
    setGuardando(true);
    try {
      const fila = { ...valoresFijos };
      for (const c of campos) {
        let v = edit[c.clave];
        if (c.tipo === 'numero') v = v === '' || v === null ? null : Number(v);
        else if (['select', 'fecha', 'hora'].includes(c.tipo) && v === '') v = null;
        else if (typeof v === 'string') v = v.trim() === '' ? null : v.trim();
        if (c.soloLectura) continue;
        fila[c.clave] = v;
      }
      const final = transformar ? transformar(fila, edit) : fila;
      const r = edit.id
        ? await q((sb) => sb.from(tabla).update(final).eq('id', edit.id).select().single())
        : await q((sb) => sb.from(tabla).insert(final).select().single());
      await alGuardar?.(r, !edit.id);
      setEdit(null); recargar(); aviso.ok('Guardado correctamente.');
    } catch (e) { aviso.error(e); } finally { setGuardando(false); }
  }
  async function alternar(f) {
    try { await q((sb) => sb.from(tabla).update({ [campoActivo]: !f[campoActivo] }).eq('id', f.id)); recargar(); } catch (e) { aviso.error(e); }
  }
  const cols = [...columnas, ...(campoActivo ? [{ clave: campoActivo, titulo: 'Estado', render: (f) => <Chip color={f[campoActivo] ? 'verde' : 'gris'}>{f[campoActivo] ? 'Activo' : 'Inactivo'}</Chip>, exportar: (f) => (f[campoActivo] ? 'Activo' : 'Inactivo') }] : [])];

  return (
    <>
      {puedeCrear && puedeEditar && <div className="mb-3 flex justify-end"><button className="btn-primario" onClick={nuevo}><Plus size={16} /> Nuevo {titulo}</button></div>}
      <TablaDatos cargando={cargando} filas={datos || []} columnas={cols} exportar={exportar}
        acciones={(puedeEditar || acciones) ? (f) => (
          <div className="flex justify-end gap-1">
            {acciones?.(f, recargar)}
            {puedeEditar && <button className="btn-secundario btn-sm" onClick={() => setEdit({ ...Object.fromEntries(campos.map((c) => [c.clave, f[c.clave] ?? (c.tipo === 'booleano' ? false : '')])), id: f.id })} title="Editar"><Pencil size={13} /></button>}
            {puedeEditar && campoActivo && <button className="btn-secundario btn-sm" onClick={() => alternar(f)} title={f[campoActivo] ? 'Desactivar' : 'Activar'}><Power size={13} /></button>}
          </div>
        ) : null} />
      <Modal abierto={!!edit} onCerrar={() => setEdit(null)} titulo={edit?.id ? `Editar ${titulo}` : `Nuevo ${titulo}`} ancho="max-w-2xl"
        pie={<><button className="btn-secundario" onClick={() => setEdit(null)}>Cancelar</button><button className="btn-primario" disabled={guardando} onClick={guardar}>Guardar</button></>}>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            {campos.map((c) => (
              <Campo key={c.clave} etiqueta={`${c.etiqueta}${c.requerido ? ' *' : ''}`} ayuda={c.ayuda} className={c.ancho || ''}>
                {c.tipo === 'select' ? (
                  <select className="input" value={edit[c.clave] ?? ''} disabled={c.soloLectura} onChange={(e) => setEdit({ ...edit, [c.clave]: e.target.value })}>
                    <option value="">—</option>
                    {(c.opciones || []).map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
                  </select>
                ) : c.tipo === 'booleano' ? (
                  <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={!!edit[c.clave]} onChange={(e) => setEdit({ ...edit, [c.clave]: e.target.checked })} /> {c.textoCheck || 'Sí'}</label>
                ) : c.tipo === 'textarea' ? (
                  <textarea className="input" rows={3} value={edit[c.clave] ?? ''} onChange={(e) => setEdit({ ...edit, [c.clave]: e.target.value })} />
                ) : (
                  <input className="input" type={c.tipo === 'numero' ? 'number' : c.tipo === 'fecha' ? 'date' : c.tipo === 'hora' ? 'time' : c.tipo === 'correo' ? 'email' : 'text'}
                    step={c.tipo === 'numero' ? 'any' : undefined} disabled={c.soloLectura} value={edit[c.clave] ?? ''} onChange={(e) => setEdit({ ...edit, [c.clave]: e.target.value })} />
                )}
              </Campo>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

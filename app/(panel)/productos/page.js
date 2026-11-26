'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Copy, Power, PackageX, ImagePlus, BookOpen } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Pestanas, Modal, Campo, TablaDatos, Chip, useAviso, useCarga } from '@/components/ui';
import Crud from '@/components/Crud';
import { q, rpc } from '@/lib/supabase';
import { subirArchivo } from '@/lib/archivos';
import { moneda, numero } from '@/lib/formato';

export default function Pagina() { return <Requiere permisos={['productos.ver', 'productos.gestionar']}><Productos /></Requiere>; }

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const VACIO = { codigo: '', nombre: '', categoria_id: '', descripcion: '', imagen_url: '', precio: '', costo_estimado: 0, impuesto_id: '', unidad_venta: 'und',
  tipo: 'preparado', control_inventario: 'ninguno', insumo_id: '', cantidad_insumo: 1, va_a_cocina: true, orden: 0, activo: true };

function Productos() {
  const { puede } = useSesion();
  const [tab, setTab] = useState('menu');
  return (
    <div>
      <Encabezado titulo="Productos y menú" subtitulo="Catálogo central, precios, disponibilidad por sede y categorías" />
      <Pestanas valor={tab} onCambio={setTab} opciones={[{ id: 'menu', etiqueta: 'Productos' }, puede('productos.gestionar') && { id: 'categorias', etiqueta: 'Categorías' }]} />
      {tab === 'menu' && <Menu />}
      {tab === 'categorias' && (
        <Crud tabla="categorias" titulo="categoría" orden="orden" filtro={(c) => c.eq('tipo', 'producto')} valoresFijos={{ tipo: 'producto' }} campoActivo="activa"
          campos={[{ clave: 'nombre', etiqueta: 'Nombre', requerido: true }, { clave: 'orden', etiqueta: 'Orden en el menú', tipo: 'numero', defecto: 0 }]}
          columnas={[{ clave: 'nombre', titulo: 'Categoría' }, { clave: 'orden', titulo: 'Orden', tipo: 'numero' }]} />
      )}
    </div>
  );
}

function Menu() {
  const { puede, sedes, sedeId } = useSesion();
  const aviso = useAviso();
  const [cat, setCat] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [edit, setEdit] = useState(null);
  const [aux, setAux] = useState({ categorias: [], impuestos: [], insumos: [] });
  const verCostos = puede('productos.costos');

  useEffect(() => {
    Promise.all([
      q((sb) => sb.from('categorias').select('id,nombre').eq('tipo', 'producto').order('orden')),
      q((sb) => sb.from('impuestos').select('id,nombre,porcentaje,activo').order('porcentaje')),
      q((sb) => sb.from('insumos').select('id,nombre,codigo,unidades(abreviatura)').eq('activo', true).order('nombre')),
    ]).then(([categorias, impuestos, insumos]) => setAux({ categorias, impuestos, insumos })).catch(aviso.error);
  }, [aviso.error]);

  const { datos, cargando, recargar } = useCarga(async () => {
    const [p, costos] = await Promise.all([
      q((sb) => sb.from('productos').select('*, categorias(nombre), producto_sedes(*), recetas(id,activa)').order('orden').order('nombre')),
      verCostos ? rpc('costos_productos') : Promise.resolve([]),
    ]);
    const mapa = Object.fromEntries(costos.map((c) => [c.producto_id, Number(c.costo)]));
    return p.map((x) => ({ ...x, costo: mapa[x.id], margen: mapa[x.id] !== undefined && Number(x.precio) > 0 ? ((x.precio - mapa[x.id]) / x.precio) * 100 : null,
      agotadoAqui: !!x.producto_sedes.find((s) => s.sede_id === sedeId)?.agotado, tieneReceta: x.recetas?.some((r) => r.activa) }));
  }, [sedeId, verCostos]);

  const filas = useMemo(() => (datos || []).filter((p) => (verInactivos || p.activo) && (!cat || p.categoria_id === cat)), [datos, cat, verInactivos]);

  function abrir(p) {
    if (!p) return setEdit({ ...VACIO, sedesConfig: sedes.map((s) => ({ sede_id: s.id, disponible: true, precio: '', hora_desde: '', hora_hasta: '', dias: null })) });
    setEdit({
      ...VACIO, ...Object.fromEntries(Object.keys(VACIO).map((k) => [k, p[k] ?? VACIO[k]])), id: p.id,
      sedesConfig: sedes.map((s) => {
        const c = p.producto_sedes.find((x) => x.sede_id === s.id);
        return { sede_id: s.id, existe: !!c, disponible: c ? c.disponible : true, agotado: c?.agotado || false, precio: c?.precio ?? '', hora_desde: c?.hora_desde?.slice(0, 5) || '', hora_hasta: c?.hora_hasta?.slice(0, 5) || '', dias: c?.dias || null };
      }),
    });
  }

  async function guardar() {
    const e = edit;
    if (!e.codigo.trim() || !e.nombre.trim() || e.precio === '') return aviso.error('Código, nombre y precio son obligatorios.');
    if (e.control_inventario === 'directo' && !e.insumo_id) return aviso.error('Selecciona el producto de inventario que se descuenta.');
    const fila = {
      codigo: e.codigo.trim().toUpperCase(), nombre: e.nombre.trim(), categoria_id: e.categoria_id || null, descripcion: e.descripcion || null,
      imagen_url: e.imagen_url || null, precio: Number(e.precio), costo_estimado: Number(e.costo_estimado || 0), impuesto_id: e.impuesto_id || null,
      unidad_venta: e.unidad_venta || 'und', tipo: e.tipo, control_inventario: e.control_inventario, insumo_id: e.control_inventario === 'directo' ? e.insumo_id : null,
      cantidad_insumo: Number(e.cantidad_insumo || 1), va_a_cocina: e.va_a_cocina, orden: Number(e.orden || 0), activo: e.activo,
    };
    try {
      const p = e.id ? await q((sb) => sb.from('productos').update(fila).eq('id', e.id).select().single()) : await q((sb) => sb.from('productos').insert(fila).select().single());
      for (const s of e.sedesConfig) {
        const conf = { producto_id: p.id, sede_id: s.sede_id, disponible: s.disponible, precio: s.precio === '' ? null : Number(s.precio),
          hora_desde: s.hora_desde || null, hora_hasta: s.hora_hasta || null, dias: s.dias && s.dias.length && s.dias.length < 7 ? s.dias : null };
        const personalizado = !conf.disponible || conf.precio !== null || conf.hora_desde || conf.hora_hasta || conf.dias;
        if (s.existe) await q((sb) => sb.from('producto_sedes').update(conf).eq('producto_id', p.id).eq('sede_id', s.sede_id));
        else if (personalizado) await q((sb) => sb.from('producto_sedes').insert(conf));
      }
      setEdit(null); recargar(); aviso.ok('Producto guardado.');
    } catch (err) { aviso.error(err); }
  }
  async function duplicar(p) {
    try {
      const { id, categorias, producto_sedes, recetas, costo, margen, agotadoAqui, tieneReceta, creado_en, ...resto } = p;
      await q((sb) => sb.from('productos').insert({ ...resto, codigo: `${p.codigo}-C${Math.floor(Math.random() * 900 + 100)}`, nombre: `${p.nombre} (copia)`, es_demo: false }));
      recargar(); aviso.ok('Producto duplicado. Edita la copia.');
    } catch (e) { aviso.error(e); }
  }
  async function alternarActivo(p) { try { await q((sb) => sb.from('productos').update({ activo: !p.activo }).eq('id', p.id)); recargar(); } catch (e) { aviso.error(e); } }
  async function alternarAgotado(p) {
    try {
      const fila = p.producto_sedes.find((s) => s.sede_id === sedeId);
      if (fila) await q((sb) => sb.from('producto_sedes').update({ agotado: !fila.agotado }).eq('producto_id', p.id).eq('sede_id', sedeId));
      else await q((sb) => sb.from('producto_sedes').insert({ producto_id: p.id, sede_id: sedeId, agotado: true }));
      recargar();
    } catch (e) { aviso.error(e); }
  }
  async function subirImagen(archivo) {
    try { const url = await subirArchivo('imagenes', archivo, 'productos'); setEdit((e) => ({ ...e, imagen_url: url })); } catch (e) { aviso.error(e); }
  }
  const S = (k) => ({ value: edit?.[k] ?? '', onChange: (ev) => setEdit({ ...edit, [k]: ev.target.value }) });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {aux.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Ver inactivos</label>
        {puede('productos.gestionar') && <button className="btn-primario ml-auto" onClick={() => abrir(null)}><Plus size={16} /> Nuevo producto</button>}
      </div>
      <TablaDatos cargando={cargando} filas={filas} exportar="Productos" columnas={[
        { clave: 'codigo', titulo: 'Código' },
        { clave: 'nombre', titulo: 'Producto', render: (f) => (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {f.imagen_url && <img src={f.imagen_url} alt="" className="h-8 w-8 rounded object-cover" />}
            <span>{f.nombre} {f.es_demo && <Chip color="amarillo">DEMO</Chip>} {!f.activo && <Chip>Inactivo</Chip>} {f.agotadoAqui && <Chip color="rojo">Agotado</Chip>}</span>
          </div>) },
        { clave: 'categoria', titulo: 'Categoría', render: (f) => f.categorias?.nombre, exportar: (f) => f.categorias?.nombre },
        { clave: 'control_inventario', titulo: 'Inventario', render: (f) => f.control_inventario === 'receta' ? (f.tieneReceta ? 'Por receta' : <span className="text-red-700">Receta pendiente</span>) : f.control_inventario === 'directo' ? 'Directo' : 'No descuenta',
          exportar: (f) => f.control_inventario },
        { clave: 'precio', titulo: 'Precio', tipo: 'moneda' },
        ...(verCostos ? [{ clave: 'costo', titulo: 'Costo', tipo: 'moneda' }, { clave: 'margen', titulo: 'Margen', tipo: 'porcentaje' }] : []),
      ]} acciones={(f) => (
        <div className="flex justify-end gap-1">
          {puede('productos.agotar', 'productos.gestionar') && <button className={`btn-sm btn ${f.agotadoAqui ? 'bg-red-100 text-red-700' : 'btn-secundario'}`} onClick={() => alternarAgotado(f)} title="Agotado en esta sede"><PackageX size={13} /></button>}
          {puede('productos.gestionar') && <>
            {f.control_inventario === 'receta' && <Link href={`/recetas?producto=${f.id}`} className="btn-secundario btn-sm" title="Receta"><BookOpen size={13} /></Link>}
            <button className="btn-secundario btn-sm" onClick={() => abrir(f)} title="Editar"><Pencil size={13} /></button>
            <button className="btn-secundario btn-sm" onClick={() => duplicar(f)} title="Duplicar"><Copy size={13} /></button>
            <button className="btn-secundario btn-sm" onClick={() => alternarActivo(f)} title={f.activo ? 'Desactivar' : 'Activar'}><Power size={13} /></button>
          </>}
        </div>
      )} />

      <Modal abierto={!!edit} onCerrar={() => setEdit(null)} titulo={edit?.id ? 'Editar producto' : 'Nuevo producto'} ancho="max-w-3xl"
        pie={<><button className="btn-secundario" onClick={() => setEdit(null)}>Cancelar</button><button className="btn-primario" onClick={guardar}>Guardar producto</button></>}>
        {edit && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo etiqueta="Código interno *"><input className="input uppercase" {...S('codigo')} /></Campo>
              <Campo etiqueta="Nombre *" className="sm:col-span-2"><input className="input" {...S('nombre')} /></Campo>
              <Campo etiqueta="Categoría"><select className="input" {...S('categoria_id')}><option value="">—</option>{aux.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
              <Campo etiqueta="Precio de venta *" ayuda={!puede('productos.precios') && edit.id ? 'No tienes permiso para cambiar precios.' : null}>
                <input type="number" className="input" {...S('precio')} disabled={!!edit.id && !puede('productos.precios')} /></Campo>
              <Campo etiqueta="Impuesto"><select className="input" {...S('impuesto_id')}><option value="">Sin impuesto</option>{aux.impuestos.filter((i) => i.activo).map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select></Campo>
              <Campo etiqueta="Descripción" className="sm:col-span-3"><textarea className="input" rows={2} {...S('descripcion')} /></Campo>
              <Campo etiqueta="Tipo de producto"><select className="input" {...S('tipo')}><option value="preparado">Preparado en cocina</option><option value="reventa">Reventa (bebidas, empacados)</option><option value="servicio">Servicio / otro</option></select></Campo>
              <Campo etiqueta="Unidad de venta"><input className="input" {...S('unidad_venta')} /></Campo>
              <Campo etiqueta="Orden en el menú"><input type="number" className="input" {...S('orden')} /></Campo>
            </div>
            <div className="rounded-xl border border-crema-200 p-3">
              <p className="etiqueta">Control de inventario al vender</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <select className="input" {...S('control_inventario')}>
                  <option value="receta">Descontar ingredientes según receta</option>
                  <option value="directo">Descontar un producto de inventario</option>
                  <option value="ninguno">No descontar inventario</option>
                </select>
                {edit.control_inventario === 'directo' && <>
                  <select className="input" {...S('insumo_id')}><option value="">Producto de inventario…</option>{aux.insumos.map((i) => <option key={i.id} value={i.id}>{i.nombre} ({i.unidades?.abreviatura})</option>)}</select>
                  <input type="number" step="any" className="input" placeholder="Cantidad por unidad vendida" {...S('cantidad_insumo')} />
                </>}
                {edit.control_inventario !== 'directo' && (
                  <Campo etiqueta="Costo estimado manual" ayuda={edit.control_inventario === 'receta' ? 'Se usa solo si aún no tiene receta.' : 'Para calcular el margen.'}>
                    <input type="number" className="input" {...S('costo_estimado')} /></Campo>
                )}
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.va_a_cocina} onChange={(e) => setEdit({ ...edit, va_a_cocina: e.target.checked })} /> Se envía a cocina (aparece en comandas)</label>
            </div>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {edit.imagen_url && <img src={edit.imagen_url} alt="" className="h-16 w-16 rounded-lg object-cover" />}
              <label className="btn-secundario cursor-pointer"><ImagePlus size={15} /> {edit.imagen_url ? 'Cambiar imagen' : 'Subir imagen (opcional)'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && subirImagen(e.target.files[0])} /></label>
              {edit.imagen_url && <button className="btn-fantasma btn-sm" onClick={() => setEdit({ ...edit, imagen_url: '' })}>Quitar</button>}
            </div>
            <div>
              <p className="etiqueta">Disponibilidad por sede</p>
              <div className="space-y-2">
                {edit.sedesConfig.map((s, i) => {
                  const set = (c) => setEdit({ ...edit, sedesConfig: edit.sedesConfig.map((x, j) => (j === i ? { ...x, ...c } : x)) });
                  return (
                    <div key={s.sede_id} className="rounded-xl border border-crema-200 p-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={s.disponible} onChange={(e) => set({ disponible: e.target.checked })} /> {sedes.find((x) => x.id === s.sede_id)?.nombre}</label>
                        <input type="number" className="input w-36" placeholder="Precio especial" value={s.precio} onChange={(e) => set({ precio: e.target.value })} disabled={!puede('productos.precios')} />
                        <span className="text-xs text-cafe-400">Horario</span>
                        <input type="time" className="input w-28" value={s.hora_desde} onChange={(e) => set({ hora_desde: e.target.value })} />
                        <input type="time" className="input w-28" value={s.hora_hasta} onChange={(e) => set({ hora_hasta: e.target.value })} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {DIAS.map((d, k) => {
                          const activo = !s.dias || s.dias.includes(k);
                          return <button key={k} className={`btn-sm btn ${activo ? 'bg-vino-100 text-vino-800' : 'bg-crema-100 text-cafe-300'}`}
                            onClick={() => { const base = s.dias || [0, 1, 2, 3, 4, 5, 6]; set({ dias: activo ? base.filter((x) => x !== k) : [...base, k].sort() }); }}>{d}</button>;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Trash2, Save, GitBranch, CheckCircle2, ChefHat } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Pestanas, Campo, Modal, TablaDatos, Chip, Cargando, Kpi, Alerta, useAviso, useCarga } from '@/components/ui';
import { q, rpc } from '@/lib/supabase';
import { moneda, numero, fechaHora } from '@/lib/formato';

export default function Pagina() { return <Requiere permisos={['recetas.ver']}><Suspense fallback={<Cargando />}><Recetas /></Suspense></Requiere>; }

function Recetas() {
  const { puede } = useSesion();
  const [tab, setTab] = useState('recetas');
  return (
    <div>
      <Encabezado titulo="Recetas y costeo" subtitulo="Ingredientes por plato, costo por porción, preparaciones intermedias y producción" />
      <Pestanas valor={tab} onCambio={setTab} opciones={[{ id: 'recetas', etiqueta: 'Recetas' }, puede('produccion.registrar', 'inventario.ver') && { id: 'produccion', etiqueta: 'Producción' }]} />
      {tab === 'recetas' ? <ListaRecetas /> : <Produccion />}
    </div>
  );
}

function useAux() {
  const [aux, setAux] = useState(null);
  useEffect(() => {
    Promise.all([
      q((sb) => sb.from('insumos').select('id,nombre,codigo,costo_unitario,unidad_id,es_preparacion,unidades(id,abreviatura,magnitud,factor)').eq('activo', true).order('nombre')),
      q((sb) => sb.from('unidades').select('*').eq('activa', true).order('magnitud').order('factor')),
      q((sb) => sb.from('productos').select('id,nombre,precio,control_inventario').eq('activo', true).order('nombre')),
    ]).then(([insumos, unidades, productos]) => setAux({ insumos, unidades, productos }));
  }, []);
  return aux;
}

function ListaRecetas() {
  const { puede } = useSesion();
  const params = useSearchParams();
  const aux = useAux();
  const [filtro, setFiltro] = useState('activas');
  const [editando, setEditando] = useState(null);
  const { datos, cargando, recargar } = useCarga(() => q((sb) => sb.from('recetas').select('*, productos(nombre,precio), insumos(nombre), receta_items(id)').order('nombre').order('version', { ascending: false })), []);

  useEffect(() => {
    const prod = params.get('producto');
    if (!prod || !datos) return;
    const r = datos.find((x) => x.producto_id === prod && x.activa);
    setEditando(r ? r.id : { nuevo: true, producto_id: prod });
  }, [params, datos]);

  const filas = (datos || []).filter((r) => filtro === 'todas' || (filtro === 'activas' ? r.activa : filtro === 'prep' ? r.insumo_resultado_id && r.activa : !r.activa));
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <select className="input w-auto" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="activas">Recetas activas</option><option value="prep">Preparaciones intermedias</option><option value="inactivas">Versiones anteriores</option><option value="todas">Todas</option>
        </select>
        {puede('recetas.gestionar') && <button className="btn-primario ml-auto" onClick={() => setEditando({ nuevo: true })}><Plus size={16} /> Nueva receta</button>}
      </div>
      {aux?.productos && (() => {
        const sinReceta = aux.productos.filter((p) => p.control_inventario === 'receta' && !(datos || []).some((r) => r.producto_id === p.id && r.activa));
        return sinReceta.length > 0 && <Alerta>Productos configurados “por receta” que aún no tienen receta (no descontarán inventario): {sinReceta.map((p) => p.nombre).join(', ')}.</Alerta>;
      })()}
      <TablaDatos cargando={cargando} filas={filas} exportar="Recetas" onFila={(f) => setEditando(f.id)} columnas={[
        { clave: 'nombre', titulo: 'Receta', render: (f) => <>{f.nombre} {f.es_demo && <Chip color="amarillo">DEMO</Chip>}</> },
        { clave: 'tipo', titulo: 'Tipo', render: (f) => (f.producto_id ? `Plato: ${f.productos?.nombre}` : `Preparación → ${f.insumos?.nombre}`), exportar: (f) => (f.producto_id ? f.productos?.nombre : f.insumos?.nombre) },
        { clave: 'rendimiento', titulo: 'Rinde', tipo: 'numero' },
        { clave: 'ingredientes', titulo: 'Ingredientes', render: (f) => f.receta_items.length, exportar: (f) => f.receta_items.length },
        { clave: 'version', titulo: 'Versión', render: (f) => <>v{f.version} {f.activa ? <Chip color="verde">Activa</Chip> : <Chip>Anterior</Chip>}</>, exportar: (f) => f.version },
      ]} />
      {editando && aux && <Editor id={typeof editando === 'string' ? editando : null} inicial={typeof editando === 'object' ? editando : null} aux={aux}
        onCerrar={() => setEditando(null)} onGuardado={(id) => { recargar(); if (id) setEditando(id); }} />}
    </>
  );
}

function costoLinea(l, aux) {
  const ins = aux.insumos.find((i) => i.id === l.insumo_id);
  const u = aux.unidades.find((x) => x.id === l.unidad_id);
  if (!ins || !u || u.magnitud !== ins.unidades.magnitud) return { cantBase: 0, costo: 0, error: !!ins && !!u };
  const cantBase = (Number(l.cantidad || 0) * Number(u.factor)) / Number(ins.unidades.factor) * (1 + Number(l.desperdicio_pct || 0) / 100);
  return { cantBase, costo: cantBase * Number(ins.costo_unitario || 0) };
}

function Editor({ id, inicial, aux, onCerrar, onGuardado }) {
  const { puede } = useSesion();
  const aviso = useAviso();
  const [r, setR] = useState(null);
  const [items, setItems] = useState([]);
  const [versiones, setVersiones] = useState([]);
  const edita = puede('recetas.gestionar');

  useEffect(() => {
    (async () => {
      if (!id) {
        const prod = aux.productos.find((p) => p.id === inicial?.producto_id);
        setR({ nombre: prod?.nombre || '', tipo: 'producto', producto_id: inicial?.producto_id || '', insumo_resultado_id: '', rendimiento: 1, merma_pct: 0, instrucciones: '', activa: true, version: 1 });
        setItems([]); return;
      }
      const [rec, it] = await Promise.all([
        q((sb) => sb.from('recetas').select('*').eq('id', id).single()),
        q((sb) => sb.from('receta_items').select('*').eq('receta_id', id)),
      ]);
      setR({ ...rec, tipo: rec.producto_id ? 'producto' : 'preparacion' }); setItems(it);
      setVersiones(await q((sb) => sb.from('recetas').select('id,version,activa,creado_en').or(rec.producto_id ? `producto_id.eq.${rec.producto_id}` : `insumo_resultado_id.eq.${rec.insumo_resultado_id}`).order('version', { ascending: false })));
    })().catch(aviso.error);
  }, [id, inicial, aux, aviso.error]);

  const merma = Number(r?.merma_pct || 0) / 100;
  const esPlato = r?.tipo === 'producto';
  const total = useMemo(() => items.reduce((s, l) => s + costoLinea(l, aux).costo, 0) * (esPlato ? 1 + merma : 1), [items, aux, esPlato, merma]);
  const porcion = total / Math.max(Number(r?.rendimiento || 1) * (esPlato ? 1 : Math.max(1 - merma, 0.01)), 0.0001);
  const prod = aux.productos.find((p) => p.id === r?.producto_id);
  const margen = prod && Number(prod.precio) > 0 ? ((prod.precio - porcion) / prod.precio) * 100 : null;

  async function guardar() {
    if (!r.nombre.trim()) return aviso.error('Escribe el nombre de la receta.');
    if (r.tipo === 'producto' && !r.producto_id) return aviso.error('Selecciona el producto que se vende.');
    if (r.tipo === 'preparacion' && !r.insumo_resultado_id) return aviso.error('Selecciona la preparación que produce (insumo marcado como preparación).');
    if (items.some((l) => !l.insumo_id || !(Number(l.cantidad) > 0) || !l.unidad_id)) return aviso.error('Completa todos los ingredientes (insumo, cantidad y unidad).');
    if (items.some((l) => costoLinea(l, aux).error)) return aviso.error('Hay ingredientes con una unidad incompatible (ej.: litros para un insumo en kilos).');
    const fila = { nombre: r.nombre.trim(), producto_id: r.tipo === 'producto' ? r.producto_id : null, insumo_resultado_id: r.tipo === 'preparacion' ? r.insumo_resultado_id : null,
      rendimiento: Number(r.rendimiento), merma_pct: Number(r.merma_pct || 0), instrucciones: r.instrucciones || null };
    try {
      const rec = r.id ? await q((sb) => sb.from('recetas').update(fila).eq('id', r.id).select().single()) : await q((sb) => sb.from('recetas').insert({ ...fila, activa: true }).select().single());
      await q((sb) => sb.from('receta_items').delete().eq('receta_id', rec.id));
      if (items.length) await q((sb) => sb.from('receta_items').insert(items.map((l) => ({ receta_id: rec.id, insumo_id: l.insumo_id, cantidad: Number(l.cantidad), unidad_id: l.unidad_id, desperdicio_pct: Number(l.desperdicio_pct || 0) }))));
      if (r.tipo === 'producto') await q((sb) => sb.from('productos').update({ control_inventario: 'receta' }).eq('id', r.producto_id).neq('control_inventario', 'receta'));
      aviso.ok('Receta guardada.'); onGuardado(rec.id);
    } catch (e) { aviso.error(e); }
  }
  async function nuevaVersion() {
    try { const nid = await rpc('nueva_version_receta', { p_receta: r.id }); aviso.ok('Se creó una nueva versión activa. La anterior queda en el historial.'); onGuardado(nid); } catch (e) { aviso.error(e); }
  }
  async function activar(vid) { try { await rpc('activar_version_receta', { p_receta: vid }); onGuardado(vid); } catch (e) { aviso.error(e); } }
  const setL = (i, c) => setItems((ls) => ls.map((l, j) => (j === i ? { ...l, ...c } : l)));

  return (
    <Modal abierto onCerrar={onCerrar} ancho="max-w-4xl" titulo={r?.id ? `${r.nombre} · v${r.version}` : 'Nueva receta'}
      pie={edita && r && <>
        {r.id && r.activa && <button className="btn-secundario" onClick={nuevaVersion}><GitBranch size={15} /> Crear nueva versión</button>}
        <button className="btn-primario" onClick={guardar}><Save size={15} /> Guardar</button>
      </>}>
      {!r ? <Cargando /> : (
        <div className="space-y-4">
          {r.id && !r.activa && <Alerta>Estás viendo una versión anterior. Puedes activarla de nuevo abajo.</Alerta>}
          <div className="grid gap-3 sm:grid-cols-4">
            <Campo etiqueta="Tipo"><select className="input" disabled={!!r.id} value={r.tipo} onChange={(e) => setR({ ...r, tipo: e.target.value })}>
              <option value="producto">Plato que se vende</option><option value="preparacion">Preparación intermedia</option></select></Campo>
            {r.tipo === 'producto' ? (
              <Campo etiqueta="Producto vendido" className="sm:col-span-2"><select className="input" disabled={!!r.id} value={r.producto_id} onChange={(e) => setR({ ...r, producto_id: e.target.value, nombre: r.nombre || aux.productos.find((p) => p.id === e.target.value)?.nombre || '' })}>
                <option value="">Selecciona…</option>{aux.productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>
            ) : (
              <Campo etiqueta="Produce (insumo de preparación)" className="sm:col-span-2" ayuda="Créalo en Inventario → Insumos marcando “es preparación”."><select className="input" disabled={!!r.id} value={r.insumo_resultado_id} onChange={(e) => setR({ ...r, insumo_resultado_id: e.target.value })}>
                <option value="">Selecciona…</option>{aux.insumos.filter((i) => i.es_preparacion).map((i) => <option key={i.id} value={i.id}>{i.nombre} ({i.unidades.abreviatura})</option>)}</select></Campo>
            )}
            <Campo etiqueta="Nombre"><input className="input" value={r.nombre} onChange={(e) => setR({ ...r, nombre: e.target.value })} disabled={!edita} /></Campo>
            <Campo etiqueta={r.tipo === 'producto' ? 'Rinde (porciones)' : `Rinde (${aux.insumos.find((i) => i.id === r.insumo_resultado_id)?.unidades.abreviatura || 'cantidad'})`}>
              <input type="number" step="any" className="input" value={r.rendimiento} onChange={(e) => setR({ ...r, rendimiento: e.target.value })} disabled={!edita} /></Campo>
            <Campo etiqueta="Merma general %" ayuda={r.tipo === 'producto' ? 'Aumenta el consumo de todos los ingredientes.' : 'Reduce la cantidad producida.'}>
              <input type="number" step="any" className="input" value={r.merma_pct} onChange={(e) => setR({ ...r, merma_pct: e.target.value })} disabled={!edita} /></Campo>
          </div>
          <div className="overflow-x-auto rounded-xl border border-crema-200">
            <table className="tabla">
              <thead><tr><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th><th>Desperdicio %</th><th className="text-right">Costo</th><th /></tr></thead>
              <tbody>
                {items.map((l, i) => {
                  const ins = aux.insumos.find((x) => x.id === l.insumo_id);
                  const c = costoLinea(l, aux);
                  return (
                    <tr key={i}>
                      <td className="min-w-[200px]"><select className="input" value={l.insumo_id} disabled={!edita} onChange={(e) => { const n = aux.insumos.find((x) => x.id === e.target.value); setL(i, { insumo_id: e.target.value, unidad_id: n?.unidad_id || '' }); }}>
                        <option value="">Selecciona…</option>{aux.insumos.filter((x) => x.id !== r.insumo_resultado_id).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></td>
                      <td><input type="number" step="any" className="input w-24" value={l.cantidad} disabled={!edita} onChange={(e) => setL(i, { cantidad: e.target.value })} /></td>
                      <td><select className={`input w-24 ${c.error ? 'border-red-400' : ''}`} value={l.unidad_id} disabled={!edita} onChange={(e) => setL(i, { unidad_id: e.target.value })}>
                        {aux.unidades.filter((u) => !ins || u.magnitud === ins.unidades.magnitud).map((u) => <option key={u.id} value={u.id}>{u.abreviatura}</option>)}</select></td>
                      <td><input type="number" step="any" className="input w-20" value={l.desperdicio_pct} disabled={!edita} onChange={(e) => setL(i, { desperdicio_pct: e.target.value })} /></td>
                      <td className="text-right tabular-nums">{moneda(c.costo)}<span className="block text-[10px] text-cafe-400">{ins ? `${numero(c.cantBase)} ${ins.unidades.abreviatura} × ${moneda(ins.costo_unitario)}` : ''}</span></td>
                      <td>{edita && <button className="text-cafe-300 hover:text-red-600" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={15} /></button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {edita && <button className="btn-fantasma btn-sm m-2" onClick={() => setItems([...items, { insumo_id: '', cantidad: '', unidad_id: '', desperdicio_pct: 0 }])}><Plus size={14} /> Agregar ingrediente</button>}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi titulo="Costo total preparación" valor={moneda(total)} />
            <Kpi titulo={r.tipo === 'producto' ? 'Costo por porción' : 'Costo por unidad'} valor={moneda(porcion)} tono="dorado" />
            {prod && <Kpi titulo="Precio de venta" valor={moneda(prod.precio)} tono="cafe" />}
            {margen !== null && <Kpi titulo="Margen de contribución" valor={`${numero(margen, 1)} %`} detalle={moneda(prod.precio - porcion)} tono={margen >= 60 ? 'verde' : margen >= 35 ? 'dorado' : 'rojo'} />}
          </div>
          <Campo etiqueta="Preparación / instrucciones"><textarea className="input" rows={3} value={r.instrucciones || ''} disabled={!edita} onChange={(e) => setR({ ...r, instrucciones: e.target.value })} /></Campo>
          {versiones.length > 1 && (
            <div><p className="etiqueta">Versiones</p>
              <div className="flex flex-wrap gap-2">
                {versiones.map((v) => (
                  <span key={v.id} className="flex items-center gap-2 rounded-lg border border-crema-200 px-3 py-1.5 text-sm">
                    v{v.version} · {fechaHora(v.creado_en)} {v.activa ? <Chip color="verde">Activa</Chip> : edita && <button className="text-xs text-vino-600 hover:underline" onClick={() => activar(v.id)}><CheckCircle2 size={12} className="inline" /> Activar</button>}
                  </span>))}
              </div>
            </div>
          )}
          <p className="text-xs text-cafe-400">Los costos usan el costo de la última compra de cada insumo. Al vender un plato, el sistema descuenta automáticamente estos ingredientes del inventario de la sede.</p>
        </div>
      )}
    </Modal>
  );
}

function Produccion() {
  const { sedeId, puede } = useSesion();
  const aviso = useAviso();
  const [nuevo, setNuevo] = useState(null);
  const [recetas, setRecetas] = useState([]);
  useEffect(() => { q((sb) => sb.from('recetas').select('id,nombre,rendimiento,merma_pct,insumos(nombre,unidades(abreviatura))').eq('activa', true).not('insumo_resultado_id', 'is', null).order('nombre')).then(setRecetas).catch(() => {}); }, []);
  const { datos, cargando, recargar } = useCarga(() => q((sb) => sb.from('producciones').select('*, recetas(nombre, insumos(nombre, unidades(abreviatura))), perfiles(nombre)').eq('sede_id', sedeId).order('creado_en', { ascending: false }).limit(300)), [sedeId]);
  const rec = recetas.find((x) => x.id === nuevo?.receta_id);
  async function registrar() {
    try {
      await rpc('registrar_produccion', { p_sede: sedeId, p_receta: nuevo.receta_id, p_lotes: Number(nuevo.lotes), p_cantidad_real: nuevo.real === '' ? null : Number(nuevo.real), p_obs: nuevo.obs || null });
      setNuevo(null); recargar(); aviso.ok('Producción registrada: se descontaron los ingredientes y se sumó la preparación al inventario.');
    } catch (e) { aviso.error(e); }
  }
  return (
    <>
      {puede('produccion.registrar') && <div className="mb-3 flex justify-end"><button className="btn-primario" onClick={() => setNuevo({ receta_id: '', lotes: 1, real: '', obs: '' })}><ChefHat size={16} /> Registrar producción</button></div>}
      <TablaDatos cargando={cargando} filas={datos || []} exportar="Producción" columnas={[
        { clave: 'numero', titulo: 'N.º' }, { clave: 'creado_en', titulo: 'Fecha', tipo: 'fechahora' },
        { clave: 'receta', titulo: 'Preparación', render: (f) => f.recetas?.nombre, exportar: (f) => f.recetas?.nombre },
        { clave: 'lotes', titulo: 'Tandas', tipo: 'numero' },
        { clave: 'cantidad_producida', titulo: 'Producido', render: (f) => `${numero(f.cantidad_producida)} ${f.recetas?.insumos?.unidades?.abreviatura || ''}`, exportar: (f) => f.cantidad_producida },
        { clave: 'costo_total', titulo: 'Costo', tipo: 'moneda' },
        { clave: 'usuario', titulo: 'Usuario', render: (f) => f.perfiles?.nombre, exportar: (f) => f.perfiles?.nombre },
      ]} />
      <Modal abierto={!!nuevo} onCerrar={() => setNuevo(null)} titulo="Registrar producción"
        pie={<><button className="btn-secundario" onClick={() => setNuevo(null)}>Cancelar</button><button className="btn-primario" disabled={!nuevo?.receta_id || !(Number(nuevo?.lotes) > 0)} onClick={registrar}>Registrar</button></>}>
        {nuevo && <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Preparación" className="sm:col-span-2"><select className="input" value={nuevo.receta_id} onChange={(e) => setNuevo({ ...nuevo, receta_id: e.target.value })}>
            <option value="">Selecciona…</option>{recetas.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></Campo>
          <Campo etiqueta="Tandas (veces la receta)"><input type="number" step="any" className="input" value={nuevo.lotes} onChange={(e) => setNuevo({ ...nuevo, lotes: e.target.value })} /></Campo>
          <Campo etiqueta="Cantidad real obtenida (opcional)" ayuda={rec ? `Esperado: ${numero(rec.rendimiento * Number(nuevo.lotes || 0) * (1 - rec.merma_pct / 100))} ${rec.insumos?.unidades?.abreviatura}` : null}>
            <input type="number" step="any" className="input" value={nuevo.real} onChange={(e) => setNuevo({ ...nuevo, real: e.target.value })} /></Campo>
          <Campo etiqueta="Observaciones" className="sm:col-span-2"><input className="input" value={nuevo.obs} onChange={(e) => setNuevo({ ...nuevo, obs: e.target.value })} /></Campo>
        </div>}
      </Modal>
    </>
  );
}

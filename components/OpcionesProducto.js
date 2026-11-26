'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus, Save, Wand2, Barcode, Power } from 'lucide-react';
import { Modal, Campo, Alerta, Cargando, Chip, useAviso, useCarga } from './ui';
import { useSesion } from './sesion';
import { q, rpc } from '@/lib/supabase';
import { moneda, numero } from '@/lib/formato';

const GRUPOS_TALLA = [
  ['Letras', ['XS', 'S', 'M', 'L', 'XL', 'XXL']],
  ['Números', ['6', '8', '10', '12', '14', '16']],
  ['Pantalón', ['28', '30', '32', '34', '36', '38']],
  ['Calzado', ['35', '36', '37', '38', '39', '40', '41', '42']],
  ['Única', ['Única']],
];

/** Tallas y colores (ropa) o presentaciones (tienda) de un producto */
export default function OpcionesProducto({ producto, onCerrar }) {
  const { usaModulo, sedeId } = useSesion();
  const aviso = useAviso();
  const modo = usaModulo('variantes') && !usaModulo('presentaciones') ? 'variante' : usaModulo('presentaciones') && !usaModulo('variantes') ? 'presentacion'
    : (producto.opciones?.[0]?.tipo || 'presentacion');
  const [tallas, setTallas] = useState([]);
  const [colores, setColores] = useState('');
  const [precio, setPrecio] = useState('');
  const [nuevas, setNuevas] = useState([]);
  const { datos, cargando, recargar, setDatos } = useCarga(async () => {
    const ops = await q((sb) => sb.from('producto_opciones').select('*').eq('producto_id', producto.id).order('orden').order('creado_en'));
    const ids = ops.map((o) => o.insumo_id).filter(Boolean);
    let stock = {};
    if (ids.length && sedeId) {
      try { (await q((sb) => sb.from('inventario').select('insumo_id,cantidad').eq('sede_id', sedeId).in('insumo_id', ids))).forEach((x) => { stock[x.insumo_id] = Number(x.cantidad); }); } catch { stock = null; }
    }
    return { ops, stock };
  }, [producto.id, sedeId]);

  async function generar() {
    const cols = colores.split(',').map((c) => c.trim()).filter(Boolean);
    if (!tallas.length) return aviso.error('Elige al menos una talla.');
    try {
      const n = await rpc('generar_variantes', { p_producto: producto.id, p_tallas: tallas, p_colores: cols.length ? cols : ['Único'], p_precio: precio === '' ? null : Number(precio) });
      aviso.ok(`Se crearon ${n} combinaciones, cada una con su código de barras.`); setTallas([]); setColores(''); recargar();
    } catch (e) { aviso.error(e); }
  }
  async function guardarFila(o) {
    try {
      await q((sb) => sb.from('producto_opciones').update({ nombre: o.nombre, factor: Number(o.factor || 1), precio: o.precio === '' || o.precio === null ? null : Number(o.precio), codigo_barras: o.codigo_barras || null }).eq('id', o.id));
      aviso.ok('Guardado.'); recargar();
    } catch (e) { aviso.error(e); }
  }
  async function alternar(o) { try { await q((sb) => sb.from('producto_opciones').update({ activo: !o.activo }).eq('id', o.id)); recargar(); } catch (e) { aviso.error(e); } }
  async function guardarNuevas() {
    const filas = nuevas.filter((n) => n.nombre.trim() && Number(n.factor) > 0);
    if (!filas.length) return;
    try {
      await q((sb) => sb.from('producto_opciones').insert(filas.map((n, i) => ({ producto_id: producto.id, tipo: 'presentacion', nombre: n.nombre.trim(), factor: Number(n.factor),
        precio: n.precio === '' ? null : Number(n.precio), codigo_barras: n.codigo_barras || null, orden: (datos?.ops.length || 0) + i }))));
      setNuevas([]); recargar(); aviso.ok('Presentaciones guardadas.');
    } catch (e) { aviso.error(e); }
  }
  async function codigoPara(i, esNueva) {
    try {
      const c = await rpc('generar_codigo_barras');
      if (esNueva) setNuevas(nuevas.map((x, j) => (j === i ? { ...x, codigo_barras: c } : x)));
      else setDatos({ ...datos, ops: datos.ops.map((x, j) => (j === i ? { ...x, codigo_barras: c } : x)) });
    } catch (e) { aviso.error(e); }
  }
  const setOp = (i, c) => setDatos({ ...datos, ops: datos.ops.map((x, j) => (j === i ? { ...x, ...c } : x)) });

  return (
    <Modal abierto onCerrar={onCerrar} ancho="max-w-4xl" titulo={`${modo === 'variante' ? 'Tallas y colores' : 'Presentaciones'} · ${producto.nombre}`}
      pie={<>
        {datos?.ops.some((o) => o.codigo_barras) && <Link href={`/imprimir/etiquetas?producto=${producto.id}`} target="_blank" className="btn-secundario"><Barcode size={15} /> Imprimir etiquetas</Link>}
        <button className="btn-primario" onClick={onCerrar}>Listo</button>
      </>}>
      {modo === 'variante' ? (
        <div className="mb-5 rounded-xl border border-crema-200 p-4">
          <p className="mb-2 font-semibold">Crear combinaciones</p>
          <div className="space-y-2">
            {GRUPOS_TALLA.map(([g, lista]) => (
              <div key={g} className="flex flex-wrap items-center gap-1">
                <span className="w-20 text-xs text-cafe-400">{g}</span>
                {lista.map((t) => (
                  <button key={t} onClick={() => setTallas(tallas.includes(t) ? tallas.filter((x) => x !== t) : [...tallas, t])}
                    className={`btn btn-sm ${tallas.includes(t) ? 'bg-vino-700 text-white' : 'bg-crema-100 text-cafe-600'}`}>{t}</button>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Campo etiqueta="Colores (separados por coma)" className="sm:col-span-2"><input className="input" placeholder="Ej.: Negro, Blanco, Rojo vino" value={colores} onChange={(e) => setColores(e.target.value)} /></Campo>
            <Campo etiqueta="Precio (vacío = precio del producto)"><input type="number" className="input" value={precio} onChange={(e) => setPrecio(e.target.value)} /></Campo>
          </div>
          <button className="btn-primario mt-3" onClick={generar}><Wand2 size={15} /> Crear {tallas.length * Math.max(colores.split(',').filter((c) => c.trim()).length, 1)} combinaciones</button>
          <p className="mt-2 text-xs text-cafe-400">Cada combinación queda con su propio inventario y un código de barras para imprimir la etiqueta. Si la prenda ya trae código de fábrica, cámbialo abajo (o escanéalo en el campo).</p>
        </div>
      ) : (
        <Alerta tono="azul">La <b>unidad</b> es el producto mismo ({moneda(producto.precio)}). Agrega aquí las presentaciones: six pack, paca, canasta… Al venderlas se descuentan las unidades del inventario. Si la canasta o la paca no trae código, genera uno e imprime su etiqueta.</Alerta>
      )}
      {cargando ? <Cargando /> : (
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead><tr><th>{modo === 'variante' ? 'Talla / color' : 'Presentación'}</th>{modo === 'presentacion' && <th>Unidades</th>}<th>Precio</th><th>Código de barras</th>{datos.stock && modo === 'variante' && <th className="text-right">Stock</th>}<th /></tr></thead>
            <tbody>
              {datos.ops.map((o, i) => (
                <tr key={o.id} className={o.activo ? '' : 'opacity-50'}>
                  <td><input className="input w-40" value={o.nombre} onChange={(e) => setOp(i, { nombre: e.target.value })} /></td>
                  {modo === 'presentacion' && <td><input type="number" className="input w-20" value={o.factor} onChange={(e) => setOp(i, { factor: e.target.value })} /></td>}
                  <td><input type="number" className="input w-28" placeholder={moneda(producto.precio * Number(o.factor || 1))} value={o.precio ?? ''} onChange={(e) => setOp(i, { precio: e.target.value })} /></td>
                  <td><div className="flex gap-1"><input className="input w-40 font-mono text-xs" placeholder="Escanear o generar" value={o.codigo_barras || ''} onChange={(e) => setOp(i, { codigo_barras: e.target.value })} />
                    {!o.codigo_barras && <button className="btn-secundario btn-sm" title="Generar" onClick={() => codigoPara(i, false)}><Barcode size={13} /></button>}</div></td>
                  {datos.stock && modo === 'variante' && <td className="text-right tabular-nums">{numero(datos.stock[o.insumo_id] || 0)}</td>}
                  <td className="whitespace-nowrap text-right">
                    <button className="btn-secundario btn-sm" onClick={() => guardarFila(o)} title="Guardar"><Save size={13} /></button>{' '}
                    <button className="btn-secundario btn-sm" onClick={() => alternar(o)} title={o.activo ? 'Desactivar' : 'Activar'}><Power size={13} /></button>
                  </td>
                </tr>
              ))}
              {nuevas.map((n, i) => (
                <tr key={'n' + i} className="bg-dorado-50">
                  <td><input className="input w-40" placeholder="Ej.: Canasta x30" value={n.nombre} onChange={(e) => setNuevas(nuevas.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} /></td>
                  <td><input type="number" className="input w-20" value={n.factor} onChange={(e) => setNuevas(nuevas.map((x, j) => (j === i ? { ...x, factor: e.target.value } : x)))} /></td>
                  <td><input type="number" className="input w-28" value={n.precio} onChange={(e) => setNuevas(nuevas.map((x, j) => (j === i ? { ...x, precio: e.target.value } : x)))} /></td>
                  <td><div className="flex gap-1"><input className="input w-40 font-mono text-xs" placeholder="Escanear o generar" value={n.codigo_barras} onChange={(e) => setNuevas(nuevas.map((x, j) => (j === i ? { ...x, codigo_barras: e.target.value } : x)))} />
                    {!n.codigo_barras && <button className="btn-secundario btn-sm" onClick={() => codigoPara(i, true)}><Barcode size={13} /></button>}</div></td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
          {datos.ops.length === 0 && nuevas.length === 0 && <p className="py-4 text-center text-sm text-cafe-400">{modo === 'variante' ? 'Aún no hay combinaciones.' : 'Aún no hay presentaciones.'}</p>}
          {modo === 'presentacion' && (
            <div className="mt-3 flex flex-wrap gap-2">
              {[['Six pack', 6], ['Paca x24', 24], ['Canasta x30', 30]].map(([n, f]) => (
                <button key={n} className="btn-secundario btn-sm" onClick={() => setNuevas([...nuevas, { nombre: n, factor: f, precio: '', codigo_barras: '' }])}><Plus size={13} /> {n}</button>
              ))}
              <button className="btn-secundario btn-sm" onClick={() => setNuevas([...nuevas, { nombre: '', factor: 1, precio: '', codigo_barras: '' }])}><Plus size={13} /> Otra</button>
              {nuevas.length > 0 && <button className="btn-primario btn-sm" onClick={guardarNuevas}><Save size={13} /> Guardar nuevas</button>}
            </div>
          )}
        </div>
      )}
      {modo === 'variante' && datos?.ops.length > 0 && <p className="mt-3 text-xs text-cafe-400"><Chip color="vino">Inventario</Chip> El stock de cada combinación se carga en Inventario o al recibir compras (puedes escanear la etiqueta).</p>}
    </Modal>
  );
}

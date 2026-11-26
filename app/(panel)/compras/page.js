'use client';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, PackageCheck, Wallet, Ban, Paperclip, Eye, TrendingUp, ScanBarcode } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Pestanas, Campo, Modal, TablaDatos, Estado, Kpi, Cargando, useAviso, useConfirmar, useCarga } from '@/components/ui';
import { q, rpc } from '@/lib/supabase';
import { subirArchivo, abrirSoporte } from '@/lib/archivos';
import { moneda, numero, fecha, hoyISO, etiqueta } from '@/lib/formato';

export default function Pagina() { return <Requiere permisos={['compras.ver']}><Compras /></Requiere>; }

function useAux() {
  const [aux, setAux] = useState(null);
  useEffect(() => {
    Promise.all([
      q((sb) => sb.from('proveedores').select('id,nombre').eq('activo', true).order('nombre')),
      q((sb) => sb.from('insumos').select('id,nombre,codigo,perecedero,unidad_id,costo_unitario,unidades(magnitud,abreviatura)').eq('activo', true).order('nombre')),
      q((sb) => sb.from('unidades').select('*').eq('activa', true).order('factor')),
      q((sb) => sb.from('metodos_pago').select('*').eq('activo', true).order('orden')),
    ]).then(([proveedores, insumos, unidades, metodos]) => setAux({ proveedores, insumos, unidades, metodos }));
  }, []);
  return aux;
}

function Compras() {
  const [tab, setTab] = useState('compras');
  return (
    <div>
      <Encabezado titulo="Compras" subtitulo="Registro de compras, recepción en inventario, pagos y cuentas por pagar" />
      <Pestanas valor={tab} onCambio={setTab} opciones={[{ id: 'compras', etiqueta: 'Compras' }, { id: 'precios', etiqueta: 'Comparar precios' }]} />
      {tab === 'compras' ? <Lista /> : <Precios />}
    </div>
  );
}

function Lista() {
  const { sedeId, puede } = useSesion();
  const aviso = useAviso();
  const confirmar = useConfirmar();
  const aux = useAux();
  const [desde, setDesde] = useState(hoyISO(-30));
  const [hasta, setHasta] = useState(hoyISO());
  const [estado, setEstado] = useState('');
  const [form, setForm] = useState(null);
  const [pago, setPago] = useState(null);
  const [ver, setVer] = useState(null);
  const { datos, cargando, recargar } = useCarga(() => q((sb) => {
    let c = sb.from('compras').select('*, proveedores(nombre)').eq('sede_id', sedeId).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }).order('numero', { ascending: false });
    if (estado === 'por_pagar') c = c.neq('estado', 'cancelada').neq('estado_pago', 'pagada');
    else if (estado) c = c.eq('estado', estado);
    return c;
  }), [sedeId, desde, hasta, estado]);
  const porPagar = (datos || []).filter((c) => c.estado !== 'cancelada').reduce((s, c) => s + Number(c.total) - Number(c.pagado), 0);

  async function abrirForm(c) {
    if (!c) return setForm({ proveedor_id: '', fecha: hoyISO(), forma_pago: 'contado', vence: '', factura_proveedor: '', adjunto_url: '', observaciones: '', items: [] });
    const items = await q((sb) => sb.from('compra_items').select('*').eq('compra_id', c.id));
    setForm({ ...c, vence: c.vence || '', items: items.map((i) => ({ ...i, vence: i.vence || '' })) });
  }
  async function recibir(c) {
    const r = await confirmar({ titulo: `Recibir compra #${c.numero}`, mensaje: 'Se sumarán las cantidades al inventario de la sede y se actualizarán los costos.', textoBoton: 'Recibir en inventario' });
    if (!r.ok) return;
    try { await rpc('recibir_compra', { p_id: c.id }); recargar(); aviso.ok('Compra recibida. Inventario actualizado.'); } catch (e) { aviso.error(e); }
  }
  async function cancelar(c) {
    const r = await confirmar({ titulo: `Cancelar compra #${c.numero}`, pedirMotivo: true, peligro: true, textoBoton: 'Cancelar compra' });
    if (!r.ok) return;
    try { await rpc('cancelar_compra', { p_id: c.id, p_motivo: r.motivo }); recargar(); } catch (e) { aviso.error(e); }
  }
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi titulo="Compras en el periodo" valor={moneda((datos || []).filter((c) => c.estado !== 'cancelada').reduce((s, c) => s + Number(c.total), 0))} />
        <Kpi titulo="Saldo por pagar" valor={moneda(porPagar)} tono="rojo" />
        <Kpi titulo="Pendientes de recibir" valor={(datos || []).filter((c) => c.estado === 'pendiente').length} tono="dorado" />
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input type="date" className="input w-auto" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input type="date" className="input w-auto" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <select className="input w-auto" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todas</option><option value="pendiente">Pendientes</option><option value="recibida">Recibidas</option><option value="por_pagar">Por pagar</option><option value="cancelada">Canceladas</option>
        </select>
        {puede('compras.gestionar') && <button className="btn-primario ml-auto" onClick={() => abrirForm(null)}><Plus size={16} /> Nueva compra</button>}
      </div>
      <TablaDatos cargando={cargando} filas={datos || []} exportar="Compras" onFila={(f) => setVer(f)} columnas={[
        { clave: 'numero', titulo: 'N.º' }, { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
        { clave: 'proveedor', titulo: 'Proveedor', render: (f) => f.proveedores?.nombre || '—', exportar: (f) => f.proveedores?.nombre, valorBusqueda: (f) => f.proveedores?.nombre },
        { clave: 'factura_proveedor', titulo: 'Factura prov.' }, { clave: 'forma_pago', titulo: 'Forma', tipo: 'etiqueta' },
        { clave: 'estado', titulo: 'Estado', tipo: 'estado' }, { clave: 'estado_pago', titulo: 'Pago', tipo: 'estado' },
        { clave: 'vence', titulo: 'Vence', tipo: 'fecha' },
        { clave: 'total', titulo: 'Total', tipo: 'moneda' }, { clave: 'saldo', titulo: 'Saldo', tipo: 'moneda', render: (f) => moneda(f.total - f.pagado), exportar: (f) => f.total - f.pagado },
      ]} acciones={(f) => (
        <div className="flex justify-end gap-1">
          {f.adjunto_url && <button className="btn-secundario btn-sm" onClick={() => abrirSoporte(f.adjunto_url).catch(aviso.error)}><Paperclip size={13} /></button>}
          {f.estado === 'pendiente' && puede('compras.gestionar') && <button className="btn-secundario btn-sm" onClick={() => abrirForm(f)}>Editar</button>}
          {f.estado === 'pendiente' && puede('compras.gestionar', 'inventario.entradas') && <button className="btn-secundario btn-sm" onClick={() => recibir(f)} title="Recibir"><PackageCheck size={13} /></button>}
          {f.estado !== 'cancelada' && f.estado_pago !== 'pagada' && puede('compras.pagar') && <button className="btn-secundario btn-sm" onClick={() => setPago({ compra: f, valor: f.total - f.pagado, origen: 'caja', metodo_id: '' })} title="Pagar"><Wallet size={13} /></button>}
          {f.estado === 'pendiente' && Number(f.pagado) === 0 && puede('compras.gestionar') && <button className="btn-secundario btn-sm text-red-700" onClick={() => cancelar(f)}><Ban size={13} /></button>}
        </div>
      )} />
      {form && aux && <FormCompra form={form} setForm={setForm} aux={aux} sedeId={sedeId} onListo={(id, pagar) => {
        setForm(null); recargar();
        if (pagar) q((sb) => sb.from('compras').select('*').eq('id', id).single()).then((c) => setPago({ compra: c, valor: c.total - c.pagado, origen: 'caja', metodo_id: '' }));
      }} />}
      {pago && aux && <ModalPago pago={pago} setPago={setPago} aux={aux} onListo={() => { setPago(null); recargar(); }} />}
      {ver && <DetalleCompra compra={ver} onCerrar={() => setVer(null)} />}
    </>
  );
}

function FormCompra({ form, setForm, aux, sedeId, onListo }) {
  const aviso = useAviso();
  const { puede } = useSesion();
  const [enviando, setEnviando] = useState(false);
  const setI = (i, c) => setForm({ ...form, items: form.items.map((x, j) => (j === i ? { ...x, ...c } : x)) });
  const [escaneo, setEscaneo] = useState('');
  async function escanear() {
    const c = escaneo.trim(); setEscaneo('');
    if (!c) return;
    try {
      const r = await rpc('buscar_codigo_barras', { p_codigo: c, p_sede: sedeId });
      if (!r?.insumo_id) return aviso.error(r ? `"${r.nombre}" no tiene inventario propio (por receta o tallas sin elegir).` : `Código ${c} no encontrado.`);
      const ins = aux.insumos.find((x) => x.id === r.insumo_id);
      const cant = Number(r.cantidad_insumo || 1);
      const i = form.items.findIndex((l) => l.insumo_id === r.insumo_id);
      if (i >= 0) setI(i, { cantidad: Number(form.items[i].cantidad || 0) + cant });
      else setForm({ ...form, items: [...form.items, { insumo_id: r.insumo_id, cantidad: cant, unidad_id: ins?.unidad_id || '', costo_unitario: ins?.costo_unitario || '', descuento: '', impuesto_pct: '', vence: '' }] });
    } catch (e) { aviso.error(e); }
  }
  const linea = (l) => { const b = Number(l.cantidad || 0) * Number(l.costo_unitario || 0) - Number(l.descuento || 0); return b * (1 + Number(l.impuesto_pct || 0) / 100); };
  const total = form.items.reduce((s, l) => s + linea(l), 0);
  async function guardar(recibir, pagar) {
    if (!form.items.length) return aviso.error('Agrega al menos un producto.');
    if (form.items.some((l) => !l.insumo_id || !(Number(l.cantidad) > 0) || l.costo_unitario === '' || !l.unidad_id)) return aviso.error('Completa producto, cantidad, unidad y costo en cada línea.');
    setEnviando(true);
    try {
      const id = await rpc('guardar_compra', { p: { ...form, sede_id: sedeId, items: form.items.map((l) => ({ insumo_id: l.insumo_id, cantidad: Number(l.cantidad), unidad_id: l.unidad_id, costo_unitario: Number(l.costo_unitario), descuento: Number(l.descuento || 0), impuesto_pct: Number(l.impuesto_pct || 0), vence: l.vence || null })) } });
      if (recibir) await rpc('recibir_compra', { p_id: id });
      aviso.ok(recibir ? 'Compra registrada y recibida en inventario.' : 'Compra guardada como pendiente.');
      onListo(id, pagar);
    } catch (e) { aviso.error(e); } finally { setEnviando(false); }
  }
  async function adjuntar(f) { try { setForm({ ...form, adjunto_url: await subirArchivo('soportes', f, 'compras') }); aviso.ok('Soporte adjuntado.'); } catch (e) { aviso.error(e); } }
  return (
    <Modal abierto onCerrar={() => setForm(null)} ancho="max-w-5xl" titulo={form.id ? `Editar compra #${form.numero}` : 'Nueva compra'}
      pie={<>
        <button className="btn-secundario" onClick={() => setForm(null)}>Cancelar</button>
        <button className="btn-secundario" disabled={enviando} onClick={() => guardar(false, false)}>Guardar pendiente</button>
        <button className="btn-primario" disabled={enviando} onClick={() => guardar(true, form.forma_pago === 'contado' && puede('compras.pagar'))}><PackageCheck size={15} /> Guardar y recibir{form.forma_pago === 'contado' ? ' + pagar' : ''}</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-4">
        <Campo etiqueta="Proveedor" className="sm:col-span-2"><select className="input" value={form.proveedor_id || ''} onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })}>
          <option value="">Sin proveedor / compra de mercado</option>{aux.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>
        <Campo etiqueta="Fecha"><input type="date" className="input" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></Campo>
        <Campo etiqueta="N.º factura del proveedor"><input className="input" value={form.factura_proveedor || ''} onChange={(e) => setForm({ ...form, factura_proveedor: e.target.value })} /></Campo>
        <Campo etiqueta="Forma de pago"><select className="input" value={form.forma_pago} onChange={(e) => setForm({ ...form, forma_pago: e.target.value })}><option value="contado">Contado</option><option value="credito">Crédito</option></select></Campo>
        {form.forma_pago === 'credito' && <Campo etiqueta="Vence"><input type="date" className="input" value={form.vence} onChange={(e) => setForm({ ...form, vence: e.target.value })} /></Campo>}
        <Campo etiqueta="Observaciones" className="sm:col-span-2"><input className="input" value={form.observaciones || ''} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></Campo>
      </div>
      <div className="relative mt-4 max-w-md">
        <ScanBarcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-vino-400" />
        <input className="input pl-9" placeholder="Escanea el producto para agregarlo (paca o canasta suma sus unidades)" value={escaneo}
          onChange={(e) => setEscaneo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); escanear(); } }} />
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-crema-200">
        <table className="tabla">
          <thead><tr><th>Producto</th><th>Cantidad</th><th>Unidad</th><th>Costo unit.</th><th>Desc. $</th><th>IVA %</th><th>Vence</th><th className="text-right">Total</th><th /></tr></thead>
          <tbody>{form.items.map((l, i) => {
            const ins = aux.insumos.find((x) => x.id === l.insumo_id);
            return (
              <tr key={i}>
                <td className="min-w-[180px]"><select className="input" value={l.insumo_id} onChange={(e) => { const n = aux.insumos.find((x) => x.id === e.target.value); setI(i, { insumo_id: e.target.value, unidad_id: n?.unidad_id || '', costo_unitario: l.costo_unitario || n?.costo_unitario || '' }); }}>
                  <option value="">Selecciona…</option>{aux.insumos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></td>
                <td><input type="number" step="any" className="input w-20" value={l.cantidad} onChange={(e) => setI(i, { cantidad: e.target.value })} /></td>
                <td><select className="input w-20" value={l.unidad_id} onChange={(e) => setI(i, { unidad_id: e.target.value })}>
                  {aux.unidades.filter((u) => !ins || u.magnitud === ins.unidades.magnitud).map((u) => <option key={u.id} value={u.id}>{u.abreviatura}</option>)}</select></td>
                <td><input type="number" step="any" className="input w-28" value={l.costo_unitario} onChange={(e) => setI(i, { costo_unitario: e.target.value })} /></td>
                <td><input type="number" className="input w-24" value={l.descuento || ''} onChange={(e) => setI(i, { descuento: e.target.value })} /></td>
                <td><input type="number" className="input w-16" value={l.impuesto_pct || ''} onChange={(e) => setI(i, { impuesto_pct: e.target.value })} /></td>
                <td>{ins?.perecedero ? <input type="date" className="input w-36" value={l.vence || ''} onChange={(e) => setI(i, { vence: e.target.value })} /> : <span className="text-xs text-cafe-300">—</span>}</td>
                <td className="text-right tabular-nums">{moneda(linea(l))}</td>
                <td><button className="text-cafe-300 hover:text-red-600" onClick={() => setForm({ ...form, items: form.items.filter((_, j) => j !== i) })}><Trash2 size={15} /></button></td>
              </tr>);
          })}</tbody>
        </table>
        <button className="btn-fantasma btn-sm m-2" onClick={() => setForm({ ...form, items: [...form.items, { insumo_id: '', cantidad: '', unidad_id: '', costo_unitario: '', descuento: '', impuesto_pct: '', vence: '' }] })}><Plus size={14} /> Agregar producto</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="btn-secundario cursor-pointer"><Paperclip size={15} /> {form.adjunto_url ? 'Soporte adjuntado ✓' : 'Adjuntar foto o factura'}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files[0] && adjuntar(e.target.files[0])} /></label>
        <p className="text-lg">Total: <b className="font-titulo text-2xl text-vino-700">{moneda(total)}</b></p>
      </div>
    </Modal>
  );
}

function ModalPago({ pago, setPago, aux, onListo }) {
  const aviso = useAviso();
  async function pagar() {
    try {
      await rpc('pagar_compra', { p_id: pago.compra.id, p_valor: Number(pago.valor), p_origen: pago.origen, p_metodo: pago.metodo_id || null });
      aviso.ok(pago.origen === 'caja' ? 'Pago registrado y descontado de tu caja.' : 'Pago registrado.'); onListo();
    } catch (e) { aviso.error(e); }
  }
  return (
    <Modal abierto onCerrar={() => setPago(null)} titulo={`Pagar compra #${pago.compra.numero}`}
      pie={<><button className="btn-secundario" onClick={() => setPago(null)}>Cancelar</button><button className="btn-primario" disabled={!(Number(pago.valor) > 0)} onClick={pagar}>Registrar pago</button></>}>
      <div className="space-y-3">
        <p className="text-sm">Saldo pendiente: <b>{moneda(pago.compra.total - pago.compra.pagado)}</b></p>
        <Campo etiqueta="Valor a pagar"><input type="number" className="input text-lg" value={pago.valor} onChange={(e) => setPago({ ...pago, valor: e.target.value })} /></Campo>
        <Campo etiqueta="Sale de"><select className="input" value={pago.origen} onChange={(e) => setPago({ ...pago, origen: e.target.value })}>
          <option value="caja">Mi caja (efectivo)</option><option value="banco">Banco / transferencia (no afecta caja)</option></select></Campo>
        {pago.origen === 'banco' && <Campo etiqueta="Medio"><select className="input" value={pago.metodo_id} onChange={(e) => setPago({ ...pago, metodo_id: e.target.value })}>
          <option value="">—</option>{aux.metodos.filter((m) => !m.es_efectivo).map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></Campo>}
      </div>
    </Modal>
  );
}

function DetalleCompra({ compra, onCerrar }) {
  const { datos } = useCarga(async () => {
    const [items, pagos] = await Promise.all([
      q((sb) => sb.from('compra_items').select('*, insumos(nombre), unidades(abreviatura)').eq('compra_id', compra.id)),
      q((sb) => sb.from('pagos_compra').select('*, gastos(numero, origen, anulado, fecha)').eq('compra_id', compra.id).order('creado_en')),
    ]);
    return { items, pagos };
  }, [compra.id]);
  return (
    <Modal abierto onCerrar={onCerrar} ancho="max-w-3xl" titulo={`Compra #${compra.numero} · ${compra.proveedores?.nombre || 'Sin proveedor'}`}>
      {!datos ? <Cargando /> : <div className="space-y-4">
        <div className="flex flex-wrap gap-2 text-sm"><Estado valor={compra.estado} /><Estado valor={compra.estado_pago} /><span>{fecha(compra.fecha)} · {etiqueta(compra.forma_pago)}</span></div>
        <table className="tabla"><thead><tr><th>Producto</th><th className="text-right">Cantidad</th><th className="text-right">Costo unit.</th><th className="text-right">Total</th></tr></thead>
          <tbody>{datos.items.map((i) => <tr key={i.id}><td>{i.insumos?.nombre}{i.vence ? <span className="block text-xs text-cafe-400">Vence {fecha(i.vence)}</span> : null}</td><td className="text-right">{numero(i.cantidad)} {i.unidades?.abreviatura}</td><td className="text-right">{moneda(i.costo_unitario)}</td><td className="text-right">{moneda(i.total)}</td></tr>)}</tbody></table>
        <div className="ml-auto w-60 text-sm"><div className="flex justify-between"><span>Subtotal</span><span>{moneda(compra.subtotal)}</span></div>
          <div className="flex justify-between"><span>Descuentos</span><span>-{moneda(compra.descuento)}</span></div><div className="flex justify-between"><span>Impuestos</span><span>{moneda(compra.impuestos)}</span></div>
          <div className="flex justify-between font-bold"><span>Total</span><span>{moneda(compra.total)}</span></div></div>
        {datos.pagos.length > 0 && <div><p className="etiqueta">Pagos</p>{datos.pagos.map((p) => <p key={p.id} className={`text-sm ${p.gastos?.anulado ? 'line-through text-cafe-300' : ''}`}>{fecha(p.gastos?.fecha)} · Salida #{p.gastos?.numero} · {etiqueta(p.gastos?.origen)} · <b>{moneda(p.valor)}</b></p>)}</div>}
        {compra.observaciones && <p className="text-sm">Obs.: {compra.observaciones}</p>}
        {compra.motivo_cancelacion && <p className="text-sm text-red-700">Cancelada: {compra.motivo_cancelacion}</p>}
      </div>}
    </Modal>
  );
}

function Precios() {
  const aux = useAux();
  const [insumo, setInsumo] = useState('');
  const { datos, cargando } = useCarga(() => (insumo ? rpc('historial_precios', { p_insumo: insumo }) : Promise.resolve([])), [insumo]);
  const resumen = useMemo(() => {
    if (!datos?.length) return null;
    const v = datos.map((d) => Number(d.costo_por_unidad_base));
    const porProv = {}; datos.forEach((d) => { (porProv[d.proveedor] ||= []).push(Number(d.costo_por_unidad_base)); });
    return { ultimo: v[0], min: Math.min(...v), max: Math.max(...v), prov: Object.entries(porProv).map(([p, l]) => ({ proveedor: p, promedio: l.reduce((a, b) => a + b, 0) / l.length, compras: l.length })).sort((a, b) => a.promedio - b.promedio) };
  }, [datos]);
  if (!aux) return <Cargando />;
  const ins = aux.insumos.find((i) => i.id === insumo);
  return (
    <>
      <select className="input mb-4 max-w-md" value={insumo} onChange={(e) => setInsumo(e.target.value)}>
        <option value="">Selecciona un producto para ver su historial de precios…</option>{aux.insumos.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
      </select>
      {resumen && <div className="mb-4 grid grid-cols-3 gap-3">
        <Kpi titulo={`Último precio por ${ins?.unidades?.abreviatura}`} valor={moneda(resumen.ultimo)} icono={TrendingUp} />
        <Kpi titulo="Más barato" valor={moneda(resumen.min)} tono="verde" /><Kpi titulo="Más caro" valor={moneda(resumen.max)} tono="rojo" />
      </div>}
      {resumen?.prov.length > 1 && <div className="tarjeta mb-4 p-4 text-sm"><p className="etiqueta">Promedio por proveedor</p>
        {resumen.prov.map((p) => <p key={p.proveedor}>{p.proveedor}: <b>{moneda(p.promedio)}</b> ({p.compras} compras)</p>)}</div>}
      {insumo && <TablaDatos cargando={cargando} filas={datos || []} exportar={`Precios ${ins?.nombre || ''}`} claveFila="numero" columnas={[
        { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' }, { clave: 'numero', titulo: 'Compra' }, { clave: 'proveedor', titulo: 'Proveedor' },
        { clave: 'cantidad', titulo: 'Cantidad', render: (f) => `${numero(f.cantidad)} ${f.unidad}`, exportar: (f) => f.cantidad },
        { clave: 'costo_unitario', titulo: 'Costo pagado (unidad de compra)', tipo: 'moneda' },
        { clave: 'costo_por_unidad_base', titulo: `Costo por ${ins?.unidades?.abreviatura || 'unidad'}`, tipo: 'moneda' },
      ]} />}
    </>
  );
}

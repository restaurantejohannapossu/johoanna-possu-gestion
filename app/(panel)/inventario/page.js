'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, History, ClipboardCheck, Plus, Settings2, CheckCheck, Ban, ScanBarcode } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Pestanas, Campo, Modal, TablaDatos, Chip, Kpi, Cargando, Alerta, useAviso, useConfirmar, useCarga } from '@/components/ui';
import Crud from '@/components/Crud';
import { q, rpc } from '@/lib/supabase';
import { moneda, numero, fecha, fechaHora, hoyISO, etiqueta } from '@/lib/formato';

export default function Pagina() { return <Requiere permisos={['inventario.ver']}><Inventario /></Requiere>; }

function Inventario() {
  const { puede } = useSesion();
  const [tab, setTab] = useState('existencias');
  return (
    <div>
      <Encabezado titulo="Inventario" subtitulo="Existencias por sede, movimientos, inventario físico y vencimientos" />
      <Pestanas valor={tab} onCambio={setTab} opciones={[
        { id: 'existencias', etiqueta: 'Existencias' }, { id: 'movimientos', etiqueta: 'Movimientos (kardex)' },
        { id: 'conteos', etiqueta: 'Inventario físico' }, { id: 'lotes', etiqueta: 'Vencimientos' },
        { id: 'insumos', etiqueta: 'Catálogo de insumos' }, puede('configuracion.gestionar', 'insumos.gestionar') && { id: 'unidades', etiqueta: 'Unidades de medida' },
      ]} />
      {tab === 'existencias' && <Existencias />}
      {tab === 'movimientos' && <Movimientos />}
      {tab === 'conteos' && <Conteos />}
      {tab === 'lotes' && <Lotes />}
      {tab === 'insumos' && <Insumos />}
      {tab === 'unidades' && <Unidades />}
    </div>
  );
}

const TIPOS_MOV = [
  { id: 'compra', texto: 'Entrada (compra sin factura registrada)', permiso: 'inventario.entradas', costo: true },
  { id: 'inicial', texto: 'Inventario inicial', permiso: 'inventario.entradas', costo: true },
  { id: 'desperdicio', texto: 'Salida por desperdicio', permiso: 'inventario.desperdicio' },
  { id: 'consumo_interno', texto: 'Salida por consumo interno', permiso: 'inventario.desperdicio' },
  { id: 'vencimiento', texto: 'Salida por vencimiento', permiso: 'inventario.desperdicio' },
  { id: 'devolucion', texto: 'Devolución a proveedor', permiso: 'inventario.ajustes' },
  { id: 'ajuste', texto: 'Ajuste (+ suma / − resta)', permiso: 'inventario.ajustes' },
];

function Existencias() {
  const { sedeId, puede } = useSesion();
  const aviso = useAviso();
  const [mov, setMov] = useState(null);
  const [conf, setConf] = useState(null);
  const [kardex, setKardex] = useState(null);
  const [filtro, setFiltro] = useState('');
  const { datos, cargando, recargar } = useCarga(async () => {
    const r = await q((sb) => sb.from('insumos').select('id,codigo,nombre,minimo,maximo,costo_unitario,es_preparacion,es_demo,categorias(nombre),unidades(abreviatura),inventario(sede_id,cantidad,costo_promedio,minimo,ubicacion,ultima_compra)')
      .eq('activo', true).eq('inventario.sede_id', sedeId).order('nombre'));
    return r.map((i) => {
      const inv = i.inventario[0] || {};
      const cant = Number(inv.cantidad || 0); const min = Number(inv.minimo ?? i.minimo ?? 0);
      return { ...i, cantidad: cant, minimoEf: min, costo: Number(inv.costo_promedio || i.costo_unitario || 0), valor: Math.max(cant, 0) * Number(inv.costo_promedio || 0),
        ubicacion: inv.ubicacion, ultima_compra: inv.ultima_compra, tieneInv: !!i.inventario[0], estado: cant <= 0 ? 'agotado' : cant <= min ? 'bajo' : 'ok' };
    });
  }, [sedeId]);
  const filas = (datos || []).filter((x) => !filtro || x.estado === filtro);
  const [escaneo, setEscaneo] = useState('');
  async function escanear() {
    const c = escaneo.trim(); setEscaneo('');
    if (!c) return;
    try {
      const r = await rpc('buscar_codigo_barras', { p_codigo: c, p_sede: sedeId });
      const i = r?.insumo_id && (datos || []).find((x) => x.id === r.insumo_id);
      if (!i) return aviso.error(r ? `"${r.nombre}" no tiene inventario propio.` : `Código ${c} no encontrado.`);
      const t = TIPOS_MOV.find((x) => puede(x.permiso));
      if (!t) return aviso.error('No tienes permiso para registrar movimientos.');
      setMov({ insumo: i, tipo: t.id, cantidad: r.cantidad_insumo || 1, costo: '', motivo: '', obs: '' });
    } catch (e) { aviso.error(e); }
  }
  const valor = (datos || []).reduce((s, x) => s + x.valor, 0);
  const tipoSel = TIPOS_MOV.find((t) => t.id === mov?.tipo);

  async function registrar() {
    try {
      await rpc('registrar_movimiento', { p_sede: sedeId, p_insumo: mov.insumo.id, p_tipo: mov.tipo, p_cantidad: Number(mov.cantidad), p_costo: mov.costo === '' ? null : Number(mov.costo), p_motivo: mov.motivo || null, p_obs: mov.obs || null });
      setMov(null); recargar(); aviso.ok('Movimiento registrado.');
    } catch (e) { aviso.error(e); }
  }
  async function guardarConf() {
    try {
      const fila = { minimo: conf.minimo === '' ? null : Number(conf.minimo), ubicacion: conf.ubicacion || null };
      if (conf.tieneInv) await q((sb) => sb.from('inventario').update(fila).eq('insumo_id', conf.id).eq('sede_id', sedeId));
      else await q((sb) => sb.from('inventario').insert({ ...fila, insumo_id: conf.id, sede_id: sedeId, cantidad: 0 }));
      setConf(null); recargar();
    } catch (e) { aviso.error(e); }
  }
  async function verKardex(i) {
    try { setKardex({ insumo: i, filas: await q((sb) => sb.from('movimientos_inventario').select('*, perfiles(nombre)').eq('insumo_id', i.id).eq('sede_id', sedeId).order('fecha', { ascending: false }).limit(300)) }); }
    catch (e) { aviso.error(e); }
  }
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi titulo="Inventario valorizado" valor={moneda(valor)} />
        <Kpi titulo="Productos e insumos" valor={datos?.length ?? '…'} tono="cafe" />
        <Kpi titulo="Bajo el mínimo" valor={(datos || []).filter((x) => x.estado === 'bajo').length} tono="dorado" />
        <Kpi titulo="Agotados" valor={(datos || []).filter((x) => x.estado === 'agotado').length} tono="rojo" />
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-[260px] flex-1 sm:flex-none">
          <ScanBarcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-vino-400" />
          <input className="input pl-9" placeholder="Escanear para registrar entrada o salida" value={escaneo} onChange={(e) => setEscaneo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); escanear(); } }} />
        </div>
        <select className="input w-auto" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Todos</option><option value="bajo">Bajo el mínimo</option><option value="agotado">Agotados</option><option value="ok">Con existencia suficiente</option>
        </select>
      </div>
      <TablaDatos cargando={cargando} filas={filas} exportar="Existencias de inventario" columnas={[
        { clave: 'codigo', titulo: 'Código' },
        { clave: 'nombre', titulo: 'Producto / insumo', render: (f) => <>{f.nombre} {f.es_preparacion && <Chip color="azul">Preparación</Chip>} {f.es_demo && <Chip color="amarillo">DEMO</Chip>}</> },
        { clave: 'categoria', titulo: 'Categoría', render: (f) => f.categorias?.nombre, exportar: (f) => f.categorias?.nombre },
        { clave: 'cantidad', titulo: 'Disponible', tipo: 'numero', render: (f) => <b className={f.estado === 'agotado' ? 'text-red-700' : f.estado === 'bajo' ? 'text-dorado-700' : ''}>{numero(f.cantidad)} {f.unidades?.abreviatura}</b> },
        { clave: 'minimoEf', titulo: 'Mínimo', tipo: 'numero' },
        { clave: 'costo', titulo: 'Costo prom.', tipo: 'moneda' },
        { clave: 'valor', titulo: 'Valor total', tipo: 'moneda' },
        { clave: 'ubicacion', titulo: 'Ubicación' },
        { clave: 'ultima_compra', titulo: 'Últ. compra', tipo: 'fecha' },
        { clave: 'estado', titulo: 'Estado', render: (f) => <Chip color={f.estado === 'agotado' ? 'rojo' : f.estado === 'bajo' ? 'amarillo' : 'verde'}>{f.estado === 'ok' ? 'OK' : f.estado === 'bajo' ? 'Bajo' : 'Agotado'}</Chip>, exportar: (f) => f.estado },
      ]} acciones={(f) => (
        <div className="flex justify-end gap-1">
          {TIPOS_MOV.some((t) => puede(t.permiso)) && <button className="btn-secundario btn-sm" title="Registrar movimiento" onClick={() => setMov({ insumo: f, tipo: TIPOS_MOV.find((t) => puede(t.permiso)).id, cantidad: '', costo: '', motivo: '', obs: '' })}><ArrowUpDown size={13} /></button>}
          <button className="btn-secundario btn-sm" title="Kardex" onClick={() => verKardex(f)}><History size={13} /></button>
          {puede('inventario.ajustes') && <button className="btn-secundario btn-sm" title="Mínimo y ubicación en esta sede" onClick={() => setConf({ id: f.id, nombre: f.nombre, tieneInv: f.tieneInv, minimo: f.inventario[0]?.minimo ?? '', ubicacion: f.ubicacion || '' })}><Settings2 size={13} /></button>}
        </div>
      )} />

      <Modal abierto={!!mov} onCerrar={() => setMov(null)} titulo={`Movimiento · ${mov?.insumo?.nombre || ''}`}
        pie={<><button className="btn-secundario" onClick={() => setMov(null)}>Cancelar</button><button className="btn-primario" disabled={!Number(mov?.cantidad)} onClick={registrar}>Registrar</button></>}>
        {mov && <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Tipo de movimiento" className="sm:col-span-2"><select className="input" value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value })}>
            {TIPOS_MOV.filter((t) => puede(t.permiso)).map((t) => <option key={t.id} value={t.id}>{t.texto}</option>)}</select></Campo>
          <Campo etiqueta={`Cantidad (${mov.insumo.unidades?.abreviatura})`} ayuda={`Disponible: ${numero(mov.insumo.cantidad)}`}>
            <input type="number" step="any" className="input" value={mov.cantidad} onChange={(e) => setMov({ ...mov, cantidad: e.target.value })} autoFocus /></Campo>
          {tipoSel?.costo && <Campo etiqueta={`Costo por ${mov.insumo.unidades?.abreviatura}`}><input type="number" step="any" className="input" value={mov.costo} onChange={(e) => setMov({ ...mov, costo: e.target.value })} /></Campo>}
          <Campo etiqueta={['ajuste', 'desperdicio', 'devolucion', 'vencimiento'].includes(mov.tipo) ? 'Motivo (obligatorio)' : 'Motivo'} className="sm:col-span-2"><input className="input" value={mov.motivo} onChange={(e) => setMov({ ...mov, motivo: e.target.value })} /></Campo>
          <Campo etiqueta="Observaciones" className="sm:col-span-2"><input className="input" value={mov.obs} onChange={(e) => setMov({ ...mov, obs: e.target.value })} /></Campo>
        </div>}
      </Modal>
      <Modal abierto={!!conf} onCerrar={() => setConf(null)} titulo={`${conf?.nombre || ''} · configuración en esta sede`}
        pie={<button className="btn-primario" onClick={guardarConf}>Guardar</button>}>
        {conf && <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Mínimo en esta sede" ayuda="Vacío = usa el mínimo general del insumo"><input type="number" step="any" className="input" value={conf.minimo} onChange={(e) => setConf({ ...conf, minimo: e.target.value })} /></Campo>
          <Campo etiqueta="Ubicación de almacenamiento"><input className="input" value={conf.ubicacion} onChange={(e) => setConf({ ...conf, ubicacion: e.target.value })} /></Campo>
        </div>}
      </Modal>
      <Modal abierto={!!kardex} onCerrar={() => setKardex(null)} titulo={`Kardex · ${kardex?.insumo?.nombre || ''}`} ancho="max-w-4xl">
        {kardex && <TablaDatos filas={kardex.filas} exportar={`Kardex ${kardex.insumo.nombre}`} columnas={[
          { clave: 'fecha', titulo: 'Fecha', tipo: 'fechahora' }, { clave: 'tipo', titulo: 'Tipo', tipo: 'etiqueta' },
          { clave: 'cantidad', titulo: 'Cantidad', tipo: 'numero', render: (f) => <span className={f.cantidad < 0 ? 'text-red-700' : 'text-emerald-700'}>{numero(f.cantidad)}</span> },
          { clave: 'saldo', titulo: 'Saldo', tipo: 'numero' }, { clave: 'costo_unitario', titulo: 'Costo', tipo: 'moneda' },
          { clave: 'motivo', titulo: 'Motivo' }, { clave: 'usuario', titulo: 'Usuario', render: (f) => f.perfiles?.nombre, exportar: (f) => f.perfiles?.nombre },
        ]} />}
      </Modal>
    </>
  );
}

function Movimientos() {
  const { sedeId } = useSesion();
  const [desde, setDesde] = useState(hoyISO(-7));
  const [hasta, setHasta] = useState(hoyISO());
  const [tipo, setTipo] = useState('');
  const { datos, cargando } = useCarga(() => q((sb) => {
    let c = sb.from('movimientos_inventario').select('*, insumos(nombre, unidades(abreviatura)), perfiles(nombre)').eq('sede_id', sedeId)
      .gte('fecha', `${desde}T00:00:00-05:00`).lte('fecha', `${hasta}T23:59:59-05:00`).order('fecha', { ascending: false }).limit(3000);
    if (tipo) c = c.eq('tipo', tipo);
    return c;
  }), [sedeId, desde, hasta, tipo]);
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <input type="date" className="input w-auto" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input type="date" className="input w-auto" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <select className="input w-auto" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {['compra', 'venta', 'desperdicio', 'consumo_interno', 'ajuste', 'devolucion', 'transferencia_salida', 'transferencia_entrada', 'produccion_consumo', 'produccion_entrada', 'vencimiento', 'conteo_fisico', 'inicial', 'anulacion'].map((t) => <option key={t} value={t}>{etiqueta(t)}</option>)}
        </select>
      </div>
      <Alerta tono="azul">Los movimientos históricos no se pueden borrar ni modificar. Para corregir, registra un ajuste con su motivo.</Alerta>
      <TablaDatos cargando={cargando} filas={datos || []} exportar="Movimientos de inventario" subtitulo={`${desde} a ${hasta}`} columnas={[
        { clave: 'fecha', titulo: 'Fecha', tipo: 'fechahora' },
        { clave: 'insumo', titulo: 'Insumo', render: (f) => f.insumos?.nombre, exportar: (f) => f.insumos?.nombre, valorBusqueda: (f) => f.insumos?.nombre },
        { clave: 'tipo', titulo: 'Tipo', tipo: 'etiqueta' },
        { clave: 'cantidad', titulo: 'Cantidad', tipo: 'numero', render: (f) => <span className={f.cantidad < 0 ? 'text-red-700' : 'text-emerald-700'}>{numero(f.cantidad)} {f.insumos?.unidades?.abreviatura}</span> },
        { clave: 'costo_unitario', titulo: 'Costo unit.', tipo: 'moneda' },
        { clave: 'saldo', titulo: 'Saldo', tipo: 'numero' },
        { clave: 'motivo', titulo: 'Motivo / documento' },
        { clave: 'usuario', titulo: 'Usuario', render: (f) => f.perfiles?.nombre, exportar: (f) => f.perfiles?.nombre },
      ]} />
    </>
  );
}

function Conteos() {
  const { sedeId, puede } = useSesion();
  const aviso = useAviso();
  const confirmar = useConfirmar();
  const [abierto, setAbierto] = useState(null);
  const { datos, cargando, recargar } = useCarga(() => q((sb) => sb.from('conteos').select('*, perfiles!conteos_usuario_id_fkey(nombre)').eq('sede_id', sedeId).order('creado_en', { ascending: false })), [sedeId]);
  async function crear() {
    try { const id = await rpc('crear_conteo', { p_sede: sedeId }); recargar(); setAbierto(id); } catch (e) { aviso.error(e); }
  }
  return (
    <>
      {puede('inventario.conteos') && <div className="mb-3 flex justify-end"><button className="btn-primario" onClick={crear}><Plus size={16} /> Nuevo inventario físico</button></div>}
      <TablaDatos cargando={cargando} filas={datos || []} onFila={(f) => setAbierto(f.id)} columnas={[
        { clave: 'numero', titulo: 'N.º' }, { clave: 'creado_en', titulo: 'Creado', tipo: 'fechahora' },
        { clave: 'usuario', titulo: 'Responsable', render: (f) => f.perfiles?.nombre }, { clave: 'estado', titulo: 'Estado', tipo: 'estado' },
        { clave: 'aplicado_en', titulo: 'Aplicado', tipo: 'fechahora' },
      ]} />
      {abierto && <DetalleConteo id={abierto} onCerrar={() => { setAbierto(null); recargar(); }} confirmar={confirmar} />}
    </>
  );
}

function DetalleConteo({ id, onCerrar, confirmar }) {
  const { puede } = useSesion();
  const aviso = useAviso();
  const [buscar, setBuscar] = useState('');
  const { datos, recargar, setDatos } = useCarga(async () => {
    const [c, items] = await Promise.all([
      q((sb) => sb.from('conteos').select('*').eq('id', id).single()),
      q((sb) => sb.from('conteo_items').select('*, insumos(nombre, codigo, unidades(abreviatura))').eq('conteo_id', id)),
    ]);
    return { c, items: items.sort((a, b) => a.insumos.nombre.localeCompare(b.insumos.nombre)) };
  }, [id]);
  const borrador = datos?.c.estado === 'borrador';
  async function guardarItem(it, valor) {
    try {
      await q((sb) => sb.from('conteo_items').update({ cantidad_contada: valor === '' ? null : Number(valor) }).eq('id', it.id));
      setDatos((d) => ({ ...d, items: d.items.map((x) => (x.id === it.id ? { ...x, cantidad_contada: valor === '' ? null : Number(valor) } : x)) }));
    } catch (e) { aviso.error(e); }
  }
  async function aplicar() {
    const r = await confirmar({ titulo: 'Aplicar inventario físico', mensaje: 'Las existencias del sistema se ajustarán a lo contado. Los productos sin conteo no cambian. Esta acción queda auditada.', textoBoton: 'Aplicar ajustes' });
    if (!r.ok) return;
    try { const res = await rpc('aplicar_conteo', { p_id: id }); aviso.ok(`Se aplicaron ${res.ajustes} ajustes (diferencia ${moneda(res.valor_diferencia)}).`); recargar(); } catch (e) { aviso.error(e); }
  }
  async function anular() { try { await rpc('anular_conteo', { p_id: id }); onCerrar(); } catch (e) { aviso.error(e); } }
  const items = (datos?.items || []).filter((i) => !buscar || i.insumos.nombre.toLowerCase().includes(buscar.toLowerCase()));
  const dif = (datos?.items || []).reduce((s, i) => s + (i.cantidad_contada === null ? 0 : (i.cantidad_contada - i.cantidad_sistema) * i.costo_unitario), 0);
  return (
    <Modal abierto onCerrar={onCerrar} ancho="max-w-4xl" titulo={`Inventario físico #${datos?.c.numero || ''}`}
      pie={borrador && <>
        {puede('inventario.conteos') && <button className="btn-secundario text-red-700" onClick={anular}><Ban size={15} /> Anular</button>}
        {puede('inventario.ajustes') && <button className="btn-primario" onClick={aplicar}><CheckCheck size={15} /> Aplicar ajustes</button>}
      </>}>
      {!datos ? <Cargando /> : <>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input className="input max-w-xs" placeholder="Buscar insumo…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          <span className="text-sm">Contados: <b>{datos.items.filter((i) => i.cantidad_contada !== null).length}</b> de {datos.items.length}</span>
          <span className="text-sm">Diferencia valorizada: <b className={dif < 0 ? 'text-red-700' : 'text-emerald-700'}>{moneda(dif)}</b></span>
        </div>
        <div className="overflow-x-auto"><table className="tabla">
          <thead><tr><th>Insumo</th><th className="text-right">Sistema</th><th>Contado</th><th className="text-right">Diferencia</th><th className="text-right">Valor</th></tr></thead>
          <tbody>{items.map((i) => {
            const d = i.cantidad_contada === null ? null : i.cantidad_contada - i.cantidad_sistema;
            return (
              <tr key={i.id}>
                <td>{i.insumos.nombre} <span className="text-xs text-cafe-400">{i.insumos.codigo}</span></td>
                <td className="text-right tabular-nums">{numero(i.cantidad_sistema)} {i.insumos.unidades?.abreviatura}</td>
                <td>{borrador ? <input type="number" step="any" className="input w-28" defaultValue={i.cantidad_contada ?? ''} onBlur={(e) => guardarItem(i, e.target.value)} /> : numero(i.cantidad_contada)}</td>
                <td className={`text-right tabular-nums ${d < 0 ? 'text-red-700' : d > 0 ? 'text-emerald-700' : ''}`}>{d === null ? '—' : numero(d)}</td>
                <td className="text-right tabular-nums">{d === null ? '—' : moneda(d * i.costo_unitario)}</td>
              </tr>);
          })}</tbody>
        </table></div>
      </>}
    </Modal>
  );
}

function Lotes() {
  const { sedeId } = useSesion();
  const { datos, cargando } = useCarga(() => q((sb) => sb.from('lotes').select('*, insumos(nombre, unidades(abreviatura))').eq('sede_id', sedeId).gt('cantidad', 0).not('vence', 'is', null).order('vence')), [sedeId]);
  const hoy = hoyISO();
  return (
    <>
      <Alerta tono="azul">Los lotes se crean al recibir compras con fecha de vencimiento. Las salidas descuentan primero lo que vence antes.</Alerta>
      <TablaDatos cargando={cargando} filas={datos || []} exportar="Vencimientos" columnas={[
        { clave: 'insumo', titulo: 'Insumo', render: (f) => f.insumos?.nombre, exportar: (f) => f.insumos?.nombre },
        { clave: 'cantidad', titulo: 'Cantidad', tipo: 'numero', render: (f) => `${numero(f.cantidad)} ${f.insumos?.unidades?.abreviatura}` },
        { clave: 'vence', titulo: 'Vence', tipo: 'fecha' },
        { clave: 'estado', titulo: 'Estado', render: (f) => { const d = Math.round((new Date(f.vence) - new Date(hoy)) / 86400000); return <Chip color={d < 0 ? 'rojo' : d <= 5 ? 'amarillo' : 'verde'}>{d < 0 ? `Vencido hace ${-d} días` : d === 0 ? 'Vence hoy' : `${d} días`}</Chip>; } },
        { clave: 'creado_en', titulo: 'Ingresó', tipo: 'fecha' },
      ]} />
    </>
  );
}

function Insumos() {
  const { puede } = useSesion();
  const [aux, setAux] = useState(null);
  useEffect(() => {
    Promise.all([
      q((sb) => sb.from('categorias').select('id,nombre').eq('tipo', 'insumo').order('orden')),
      q((sb) => sb.from('unidades').select('id,nombre,abreviatura').eq('activa', true).order('magnitud')),
      q((sb) => sb.from('proveedores').select('id,nombre').eq('activo', true).order('nombre')).catch(() => []),
    ]).then(([c, u, p]) => setAux({ c, u, p }));
  }, []);
  if (!aux) return <Cargando />;
  const op = (l, t = 'nombre') => l.map((x) => ({ valor: x.id, texto: x[t] }));
  return (
    <Crud tabla="insumos" titulo="insumo" exportar="Insumos" puedeEditar={puede('insumos.gestionar')}
      select="*, categorias(nombre), unidades(abreviatura), proveedores(nombre)"
      transformar={(f) => ({ ...f, codigo: f.codigo?.toUpperCase(), costo_unitario: f.costo_unitario ?? 0, minimo: f.minimo ?? 0 })}
      campos={[
        { clave: 'codigo', etiqueta: 'Código', requerido: true }, { clave: 'nombre', etiqueta: 'Nombre', requerido: true },
        { clave: 'categoria_id', etiqueta: 'Categoría', tipo: 'select', opciones: op(aux.c) },
        { clave: 'unidad_id', etiqueta: 'Unidad de medida (inventario)', tipo: 'select', opciones: aux.u.map((u) => ({ valor: u.id, texto: `${u.nombre} (${u.abreviatura})` })), requerido: true, ayuda: 'Puede comprar en otra unidad compatible (ej.: compra en arrobas, inventario en kg).' },
        { clave: 'costo_unitario', etiqueta: 'Costo por unidad', tipo: 'numero', defecto: 0, ayuda: 'Se actualiza solo con cada compra.' },
        { clave: 'proveedor_id', etiqueta: 'Proveedor principal', tipo: 'select', opciones: op(aux.p) },
        { clave: 'minimo', etiqueta: 'Cantidad mínima', tipo: 'numero', defecto: 0 }, { clave: 'maximo', etiqueta: 'Cantidad máxima (opcional)', tipo: 'numero' },
        { clave: 'ubicacion', etiqueta: 'Ubicación de almacenamiento' },
        { clave: 'perecedero', etiqueta: 'Perecedero', tipo: 'booleano', textoCheck: 'Tiene fecha de vencimiento' },
        { clave: 'es_preparacion', etiqueta: 'Preparación intermedia', tipo: 'booleano', textoCheck: 'Se produce en cocina con una receta (sopa, salsas, guisos…)' },
      ]}
      columnas={[
        { clave: 'codigo', titulo: 'Código' }, { clave: 'nombre', titulo: 'Nombre', render: (f) => <>{f.nombre} {f.es_preparacion && <Chip color="azul">Preparación</Chip>}</> },
        { clave: 'categoria', titulo: 'Categoría', render: (f) => f.categorias?.nombre, exportar: (f) => f.categorias?.nombre },
        { clave: 'unidad', titulo: 'Unidad', render: (f) => f.unidades?.abreviatura, exportar: (f) => f.unidades?.abreviatura },
        { clave: 'costo_unitario', titulo: 'Costo', tipo: 'moneda' }, { clave: 'minimo', titulo: 'Mínimo', tipo: 'numero' },
        { clave: 'proveedor', titulo: 'Proveedor', render: (f) => f.proveedores?.nombre, exportar: (f) => f.proveedores?.nombre },
      ]} />
  );
}

function Unidades() {
  return (
    <>
      <Alerta tono="azul">Las conversiones solo se permiten entre unidades de la misma magnitud. El factor indica cuántas unidades base (g, ml o und) equivale. Ej.: 1 kg = 1.000 g → factor 1000; 1 arroba = 12.500 g.</Alerta>
      <Crud tabla="unidades" titulo="unidad" orden="magnitud" campoActivo="activa"
        campos={[
          { clave: 'nombre', etiqueta: 'Nombre', requerido: true }, { clave: 'abreviatura', etiqueta: 'Abreviatura', requerido: true },
          { clave: 'magnitud', etiqueta: 'Magnitud', requerido: true, ayuda: 'masa, volumen, conteo… o una propia (paquete, caja)' },
          { clave: 'factor', etiqueta: 'Factor respecto a la unidad base', tipo: 'numero', requerido: true, defecto: 1 },
        ]}
        columnas={[{ clave: 'nombre', titulo: 'Unidad' }, { clave: 'abreviatura', titulo: 'Abrev.' }, { clave: 'magnitud', titulo: 'Magnitud' }, { clave: 'factor', titulo: 'Factor', tipo: 'numero' }]} />
    </>
  );
}

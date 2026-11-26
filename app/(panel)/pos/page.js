'use client';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Plus, Minus, Trash2, Send, Wallet, StickyNote, Percent, X, AlertTriangle, PackagePlus, ScanBarcode, Users } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Cargando, Modal, Campo, Chip, useAviso, useConfirmar } from '@/components/ui';
import { ModalCobro, ModalVentaLista, SelectorCliente, useCajaAbierta } from '@/components/Cobro';
import { q, rpc } from '@/lib/supabase';
import { moneda, etiqueta } from '@/lib/formato';


export default function PaginaPOS() {
  return <Requiere permisos={['pos.vender']}><Suspense fallback={<Cargando />}><POS /></Suspense></Requiere>;
}

function disponibleAhora(ps) {
  if (!ps) return true;
  if (!ps.disponible) return false;
  const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  if (ps.dias && !ps.dias.includes(ahora.getDay())) return false;
  const hhmm = ahora.toTimeString().slice(0, 5);
  if (ps.hora_desde && hhmm < ps.hora_desde.slice(0, 5)) return false;
  if (ps.hora_hasta && hhmm > ps.hora_hasta.slice(0, 5)) return false;
  return true;
}

function POS() {
  const { sedeId, puede, negocio, usaModulo } = useSesion();
  const TIPOS = [
    'mostrador', usaModulo('mesas') && 'mesa', negocio?.tipo === 'restaurante' && 'llevar', negocio?.tipo === 'restaurante' && 'recoger',
    usaModulo('cuentas') && 'cuenta', usaModulo('domicilios') && 'domicilio',
  ].filter(Boolean);
  const nombreTipo = (t) => (t === 'cuenta' ? (negocio?.tipo === 'ropa' ? 'Apartado' : 'Cuenta') : etiqueta(t));
  const aviso = useAviso();
  const confirmar = useConfirmar();
  const router = useRouter();
  const params = useSearchParams();
  const pedidoParam = params.get('pedido');
  const mesaParam = params.get('mesa');
  const { sesion, recargar: recargarCaja } = useCajaAbierta(sedeId);

  const [productos, setProductos] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [mesas, setMesas] = useState([]);
  const [cat, setCat] = useState('');
  const [buscar, setBuscar] = useState('');
  const [carrito, setCarrito] = useState([]);
  const [tipo, setTipo] = useState('mostrador');
  const [mesaId, setMesaId] = useState('');
  const [cliente, setCliente] = useState(null);
  const [domicilio, setDomicilio] = useState({ cliente_nombre: '', telefono: '', direccion: '', barrio: '', referencias: '', valor_domicilio: '' });
  const [observaciones, setObservaciones] = useState('');
  const [pedido, setPedido] = useState(null);          // pedido existente (cuenta abierta)
  const [itemsPedido, setItemsPedido] = useState([]);
  const [nota, setNota] = useState(null);              // índice de línea para observación
  const [personal, setPersonal] = useState(null);
  const [cobro, setCobro] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [nombreCuenta, setNombreCuenta] = useState('');
  const [elegir, setElegir] = useState(null);          // producto con tallas/colores o presentaciones
  const [cuentas, setCuentas] = useState(null);         // lista de cuentas abiertas
  const buscarRef = useRef(null);

  useEffect(() => {
    if (!sedeId) return;
    Promise.all([
      q((sb) => sb.from('productos').select('id,codigo,codigo_barras,nombre,precio,imagen_url,categoria_id,va_a_cocina,es_demo,impuestos(porcentaje,incluido_en_precio,activo),producto_sedes(sede_id,disponible,agotado,precio,hora_desde,hora_hasta,dias),producto_opciones(id,tipo,nombre,talla,color,factor,precio,codigo_barras,insumo_id,activo,orden)').eq('activo', true).order('orden').order('nombre')),
      q((sb) => sb.from('categorias').select('id,nombre').eq('tipo', 'producto').eq('activa', true).order('orden')),
      q((sb) => sb.from('mesas').select('id,nombre,estado,zona').eq('sede_id', sedeId).eq('activa', true).order('orden')),
    ]).then(([p, c, m]) => {
      setProductos(p.map((x) => {
        const ps = x.producto_sedes.find((s) => s.sede_id === sedeId);
        const opciones = (x.producto_opciones || []).filter((o) => o.activo).sort((a, b) => a.orden - b.orden);
        return { ...x, ps, opciones, precioSede: ps?.precio ?? x.precio, agotado: !!ps?.agotado, disponible: disponibleAhora(ps) };
      }).filter((x) => !x.ps || x.ps.disponible));
      setCategorias(c); setMesas(m);
    }).catch(aviso.error);
  }, [sedeId, aviso.error]);

  async function cargarPedido(id) {
    try {
      const [p, items] = await Promise.all([
        q((sb) => sb.from('pedidos').select('*, clientes(id,nombre,telefono), domicilios(*), mesas(nombre)').eq('id', id).single()),
        q((sb) => sb.from('pedido_items').select('*').eq('pedido_id', id).eq('estado', 'activo').order('creado_en')),
      ]);
      setPedido(p); setItemsPedido(items); setTipo(p.tipo_servicio); setMesaId(p.mesa_id || ''); setCliente(p.clientes || null); setNombreCuenta(p.nombre_cuenta || '');
    } catch (e) { aviso.error(e); }
  }
  useEffect(() => {
    if (pedidoParam) cargarPedido(pedidoParam);
    else if (mesaParam) { setTipo('mesa'); setMesaId(mesaParam); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoParam, mesaParam]);

  const visibles = useMemo(() => {
    const t = buscar.trim().toLowerCase();
    return (productos || []).filter((p) => (!cat || p.categoria_id === cat) && (!t || p.nombre.toLowerCase().includes(t) || p.codigo.toLowerCase().includes(t) || p.codigo_barras === buscar.trim()));
  }, [productos, cat, buscar]);

  /** Agrega al pedido. Si el producto tiene tallas/colores o presentaciones y no se indicó cuál, pregunta. */
  const agregar = (p, opcion, preguntar = true) => {
    if (p.agotado || !p.disponible) return aviso.error(`"${p.nombre}" no está disponible ahora.`);
    if (!opcion && preguntar && p.opciones?.length) return setElegir(p);
    const nombre = opcion ? `${p.nombre} · ${opcion.nombre}` : p.nombre;
    const precio = opcion ? Number(opcion.precio ?? Number(p.precioSede) * Number(opcion.factor || 1)) : Number(p.precioSede);
    setCarrito((c) => {
      const i = c.findIndex((l) => l.producto_id === p.id && (l.opcion_id || null) === (opcion?.id || null) && !l.observaciones && !l.descuento);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, cantidad: l.cantidad + 1 } : l));
      return [...c, { producto_id: p.id, opcion_id: opcion?.id || null, nombre, precio, cantidad: 1, observaciones: '', descuento: 0, imp: p.impuestos?.activo ? p.impuestos : null }];
    });
  };

  /** Lector de código de barras (la pistola escribe el código y presiona Enter) */
  async function leerCodigo(codigo) {
    const c = String(codigo || '').trim();
    if (!c) return;
    const local = (productos || []).flatMap((p) => [
      p.codigo_barras === c && { p, o: null },
      ...(p.opciones || []).filter((o) => o.codigo_barras === c).map((o) => ({ p, o })),
    ]).find(Boolean);
    if (local) { agregar(local.p, local.o, !local.o && local.p.opciones?.some((o) => o.tipo === 'variante')); setBuscar(''); return; }
    try {
      const r = await rpc('buscar_codigo_barras', { p_codigo: c, p_sede: sedeId });
      const p = r && (productos || []).find((x) => x.id === r.producto_id);
      if (p) { agregar(p, p.opciones?.find((o) => o.id === r.opcion_id) || null, !!r.requiere_opcion); setBuscar(''); return; }
      if (visibles.length === 1) { agregar(visibles[0]); setBuscar(''); return; }
      aviso.error(`No se encontró ningún producto con el código ${c}.`);
    } catch (e) { aviso.error(e); }
  }
  // Captura la pistola aunque el cursor no esté en el buscador
  useEffect(() => {
    let buffer = ''; let ultimo = 0;
    const f = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const ahora = Date.now();
      if (ahora - ultimo > 80) buffer = '';
      ultimo = ahora;
      if (e.key === 'Enter') { if (buffer.length >= 4) { e.preventDefault(); leerCodigo(buffer); } buffer = ''; return; }
      if (e.key.length === 1) buffer += e.key;
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  async function verCuentas() {
    try {
      setCuentas(await q((sb) => sb.from('pedidos').select('id,numero,nombre_cuenta,total,pagado,creado_en,tipo_servicio,mesas(nombre)').eq('sede_id', sedeId)
        .neq('estado', 'cancelado').in('estado_pago', ['abierto', 'parcial']).order('creado_en')));
    } catch (e) { aviso.error(e); }
  }
  const cambiarLinea = (i, cambios) => setCarrito((c) => c.map((l, j) => (j === i ? { ...l, ...cambios } : l)));
  const quitarLinea = (i) => setCarrito((c) => c.filter((_, j) => j !== i));

  const totalCarrito = carrito.reduce((s, l) => {
    const base = l.cantidad * l.precio - Number(l.descuento || 0);
    return s + base + (l.imp && !l.imp.incluido_en_precio ? (base * l.imp.porcentaje) / 100 : 0);
  }, 0);
  const valorDom = tipo === 'domicilio' && !pedido ? Number(domicilio.valor_domicilio || 0) : 0;
  const totalEstimado = (pedido ? Number(pedido.total) : 0) + totalCarrito + valorDom;

  function limpiar() {
    setCarrito([]); setPedido(null); setItemsPedido([]); setCliente(null); setObservaciones(''); setMesaId(''); setTipo('mostrador'); setNombreCuenta('');
    setDomicilio({ cliente_nombre: '', telefono: '', direccion: '', barrio: '', referencias: '', valor_domicilio: '' });
    if (pedidoParam || mesaParam) router.replace('/pos');
  }

  /** Crea el pedido (si no existe) y agrega las líneas del carrito. Devuelve el pedido actualizado. */
  async function guardar() {
    if (!sedeId) throw new Error('Selecciona una sede.');
    let id = pedido?.id;
    if (!id) {
      if (carrito.length === 0) throw new Error('Agrega productos al pedido.');
      if (tipo === 'mesa' && !mesaId) throw new Error('Selecciona la mesa.');
      if (tipo === 'domicilio' && !domicilio.direccion.trim()) throw new Error('Escribe la dirección del domicilio.');
      if (tipo === 'cuenta' && !nombreCuenta.trim() && !cliente) throw new Error('Escribe a nombre de quién es la cuenta.');
      id = await rpc('crear_pedido', {
        p_sede: sedeId, p_tipo: tipo, p_mesa: tipo === 'mesa' ? mesaId : null, p_cliente: cliente?.id || null,
        p_observaciones: observaciones || null,
        p_nombre_cuenta: tipo === 'cuenta' ? (nombreCuenta.trim() || null) : null,
        p_domicilio: tipo === 'domicilio' ? { ...domicilio, cliente_nombre: domicilio.cliente_nombre || cliente?.nombre || '', telefono: domicilio.telefono || cliente?.telefono || '', valor_domicilio: Number(domicilio.valor_domicilio || 0) } : null,
      });
    }
    if (carrito.length) {
      await rpc('agregar_items', {
        p_pedido: id,
        p_items: carrito.map((l) => (l.producto_id
          ? { producto_id: l.producto_id, opcion_id: l.opcion_id || null, cantidad: l.cantidad, observaciones: l.observaciones || null, descuento: Number(l.descuento || 0) }
          : { nombre: l.nombre, precio: l.precio, cantidad: l.cantidad, observaciones: l.observaciones || null, va_a_cocina: l.va_a_cocina })),
      });
    }
    setCarrito([]);
    return q((sb) => sb.from('pedidos').select('*').eq('id', id).single());
  }

  async function enviar() {
    setGuardando(true);
    try {
      const p = await guardar();
      aviso.ok(`Pedido #${p.numero} guardado y enviado a cocina.`);
      if (p.tipo_servicio === 'mesa') limpiar(); else await cargarPedido(p.id);
    } catch (e) { aviso.error(e); } finally { setGuardando(false); }
  }

  async function cobrar() {
    if (!sesion) return aviso.error('Debes abrir tu caja antes de cobrar.');
    setGuardando(true);
    try { const p = await guardar(); setPedido(p); await cargarPedido(p.id); setCobro(p); } catch (e) { aviso.error(e); } finally { setGuardando(false); }
  }

  async function quitarItemGuardado(it) {
    const necesitaMotivo = it.va_a_cocina && pedido?.estado !== 'pendiente';
    const r = await confirmar({ titulo: 'Quitar producto', mensaje: `¿Quitar "${it.nombre}" de la cuenta?`, pedirMotivo: necesitaMotivo, peligro: true, textoBoton: 'Quitar' });
    if (!r.ok) return;
    try { await rpc('cancelar_item', { p_item: it.id, p_motivo: r.motivo || null }); await cargarPedido(pedido.id); } catch (e) { aviso.error(e); }
  }

  async function descuentoGeneral() {
    const r = await confirmar({ titulo: 'Descuento a la cuenta', mensaje: 'Escribe el valor del descuento en pesos y el motivo, separados por una barra. Ejemplo: 5000 / cliente frecuente', pedirMotivo: true, etiquetaMotivo: 'Valor / motivo' });
    if (!r.ok) return;
    const [valor, ...motivo] = r.motivo.split('/');
    try { await rpc('descuento_pedido', { p_pedido: pedido.id, p_valor: Number(valor.replace(/\D/g, '')), p_motivo: motivo.join('/').trim() }); await cargarPedido(pedido.id); } catch (e) { aviso.error(e); }
  }

  if (!productos) return <Cargando />;
  return (
    <div className="-m-4 flex flex-col gap-4 p-4 sm:-m-6 sm:p-6 xl:h-[calc(100vh-57px)] xl:flex-row xl:overflow-hidden">
      {/* PRODUCTOS */}
      <section className="flex min-w-0 flex-1 flex-col xl:overflow-hidden">
        {sesion === null && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-dorado-200 bg-dorado-50 px-4 py-2 text-sm text-dorado-700">
            <AlertTriangle size={16} /> No tienes la caja abierta en esta sede. Puedes tomar pedidos, pero para cobrar <Link href="/caja" className="font-bold underline">abre tu caja</Link>.
          </div>
        )}
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cafe-300" />
            <input ref={buscarRef} className="input pl-9 pr-10 text-base" placeholder="Buscar o escanear código de barras…" value={buscar} onChange={(e) => setBuscar(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); leerCodigo(buscar); } }} />
            <ScanBarcode size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-vino-400" title="Compatible con lector de código de barras" />
          </div>
          {usaModulo('cuentas') && <button className="btn-secundario" onClick={verCuentas}><Users size={16} /> {negocio?.tipo === 'ropa' ? 'Apartados' : 'Cuentas abiertas'}</button>}
          {puede('pos.producto_personalizado') && (
            <button className="btn-secundario" onClick={() => setPersonal({ nombre: '', precio: '', cantidad: 1, va_a_cocina: false })}><PackagePlus size={16} /> Personalizado</button>
          )}
        </div>
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          <button onClick={() => setCat('')} className={`btn whitespace-nowrap ${!cat ? 'bg-vino-700 text-white' : 'bg-white text-cafe-600 border border-crema-200'}`}>Todos</button>
          {categorias.map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)} className={`btn whitespace-nowrap ${cat === c.id ? 'bg-vino-700 text-white' : 'bg-white text-cafe-600 border border-crema-200'}`}>{c.nombre}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 xl:overflow-y-auto xl:pb-4">
          {visibles.map((p) => {
            const bloqueado = p.agotado || !p.disponible;
            return (
              <button key={p.id} onClick={() => agregar(p)} disabled={bloqueado}
                className={`group relative flex min-h-[96px] flex-col justify-between overflow-hidden rounded-xl border p-3 text-left transition ${bloqueado ? 'border-crema-200 bg-crema-100 opacity-60' : 'border-crema-200 bg-white hover:-translate-y-0.5 hover:border-dorado-300 hover:shadow-md active:scale-[.98]'}`}>
                {p.imagen_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imagen_url} alt="" className="mb-2 h-20 w-full rounded-lg object-cover" />
                )}
                <span className="text-sm font-semibold leading-tight text-cafe-800">{p.nombre}</span>
                <span className="mt-2 flex items-center justify-between">
                  <span className="font-titulo text-base font-bold text-vino-700">{moneda(p.precioSede)}</span>
                  {p.agotado ? <Chip color="rojo">Agotado</Chip> : !p.disponible ? <Chip>No disponible</Chip> : p.opciones?.length ? <Chip color="vino">{p.opciones.some((o) => o.tipo === 'variante') ? `${p.opciones.length} tallas/colores` : `+${p.opciones.length} present.`}</Chip> : p.es_demo ? <Chip color="amarillo">DEMO</Chip> : null}
                </span>
              </button>
            );
          })}
          {visibles.length === 0 && <p className="col-span-full py-10 text-center text-sm text-cafe-400">No hay productos. Créalos en el módulo Productos.</p>}
        </div>
      </section>

      {/* PEDIDO */}
      <aside id="panel-pedido" className="tarjeta mb-20 flex w-full shrink-0 flex-col xl:mb-0 xl:w-[420px] xl:overflow-hidden">
        <div className="border-b border-crema-200 p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{pedido ? `Pedido #${pedido.numero}` : 'Nuevo pedido'}</h2>
            {(pedido || carrito.length > 0) && <button className="btn-fantasma btn-sm" onClick={limpiar}><X size={14} /> Limpiar</button>}
          </div>
          {pedido ? (
            <p className="text-xs text-cafe-400">{nombreTipo(pedido.tipo_servicio)}{pedido.nombre_cuenta ? ` · ${pedido.nombre_cuenta}` : ''}{pedido.mesa_id ? ` · ${mesas.find((m) => m.id === pedido.mesa_id)?.nombre || ''}` : ''} · {etiqueta(pedido.estado)} · {etiqueta(pedido.estado_pago)}</p>
          ) : (
            <>
              {TIPOS.length > 1 && <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${TIPOS.length}, minmax(0, 1fr))` }}>
                {TIPOS.map((t) => (
                  <button key={t} onClick={() => setTipo(t)} className={`rounded-lg px-1 py-1.5 text-[11px] font-semibold ${tipo === t ? 'bg-vino-700 text-white' : 'bg-crema-100 text-cafe-600'}`}>{nombreTipo(t)}</button>
                ))}
              </div>}
              {tipo === 'cuenta' && (
                <input className="input mt-2" placeholder={negocio?.tipo === 'ropa' ? 'Apartado a nombre de…' : 'Cuenta a nombre de… (ej.: Don Pedro, mesa de afuera)'} value={nombreCuenta} onChange={(e) => setNombreCuenta(e.target.value)} />
              )}
              {tipo === 'mesa' && (
                <select className="input mt-2" value={mesaId} onChange={(e) => setMesaId(e.target.value)}>
                  <option value="">Selecciona la mesa…</option>
                  {mesas.map((m) => <option key={m.id} value={m.id} disabled={m.estado === 'ocupada'}>{m.nombre}{m.zona ? ` (${m.zona})` : ''} — {etiqueta(m.estado)}</option>)}
                </select>
              )}
              <div className="mt-2"><SelectorCliente valor={cliente} onCambio={(c) => { setCliente(c); if (c && tipo === 'domicilio') setDomicilio((d) => ({ ...d, cliente_nombre: c.nombre, telefono: c.telefono || '', direccion: c.direccion || d.direccion, barrio: c.barrio || d.barrio })); }} /></div>
              {tipo === 'domicilio' && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input className="input" placeholder="Nombre" value={domicilio.cliente_nombre} onChange={(e) => setDomicilio({ ...domicilio, cliente_nombre: e.target.value })} />
                  <input className="input" placeholder="Teléfono" value={domicilio.telefono} onChange={(e) => setDomicilio({ ...domicilio, telefono: e.target.value })} />
                  <input className="input col-span-2" placeholder="Dirección *" value={domicilio.direccion} onChange={(e) => setDomicilio({ ...domicilio, direccion: e.target.value })} />
                  <input className="input" placeholder="Barrio" value={domicilio.barrio} onChange={(e) => setDomicilio({ ...domicilio, barrio: e.target.value })} />
                  <input className="input" type="number" placeholder="Valor domicilio" value={domicilio.valor_domicilio} onChange={(e) => setDomicilio({ ...domicilio, valor_domicilio: e.target.value })} />
                  <input className="input col-span-2" placeholder="Referencias" value={domicilio.referencias} onChange={(e) => setDomicilio({ ...domicilio, referencias: e.target.value })} />
                </div>
              )}
            </>
          )}
        </div>

        <div className="min-h-[160px] flex-1 overflow-y-auto p-3">
          {itemsPedido.length > 0 && (
            <div className="mb-3">
              <p className="etiqueta">Ya en la cuenta</p>
              {itemsPedido.map((it) => (
                <div key={it.id} className="flex items-start gap-2 border-b border-crema-100 py-1.5 text-sm">
                  <span className="w-8 font-bold tabular-nums">{Number(it.cantidad)}×</span>
                  <span className="flex-1">{it.nombre}{it.observaciones && <span className="block text-xs text-cafe-400">{it.observaciones}</span>}</span>
                  <span className="tabular-nums">{moneda(it.total)}</span>
                  <button className="text-cafe-300 hover:text-red-600" onClick={() => quitarItemGuardado(it)} title="Quitar"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
          {carrito.length > 0 && <p className="etiqueta">{pedido ? 'Agregar a la cuenta' : 'Productos'}</p>}
          {carrito.map((l, i) => (
            <div key={i} className="border-b border-crema-100 py-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border border-crema-300">
                  <button className="px-2 py-1.5" onClick={() => (l.cantidad > 1 ? cambiarLinea(i, { cantidad: l.cantidad - 1 }) : quitarLinea(i))}><Minus size={14} /></button>
                  <input className="w-10 border-x border-crema-300 py-1 text-center text-sm font-bold" value={l.cantidad} inputMode="decimal"
                    onChange={(e) => cambiarLinea(i, { cantidad: Math.max(0.01, Number(e.target.value.replace(',', '.')) || 1) })} />
                  <button className="px-2 py-1.5" onClick={() => cambiarLinea(i, { cantidad: l.cantidad + 1 })}><Plus size={14} /></button>
                </div>
                <span className="flex-1 text-sm font-medium leading-tight">{l.nombre}</span>
                <span className="text-sm font-semibold tabular-nums">{moneda(l.cantidad * l.precio - Number(l.descuento || 0))}</span>
              </div>
              <div className="mt-1 flex items-center gap-3 pl-1 text-xs">
                <button className="flex items-center gap-1 text-cafe-400 hover:text-vino-600" onClick={() => setNota(i)}><StickyNote size={12} /> {l.observaciones || 'Observación'}</button>
                {puede('pos.descuento') && l.producto_id && (
                  <button className="flex items-center gap-1 text-cafe-400 hover:text-vino-600" onClick={() => setNota({ desc: i })}><Percent size={12} /> {Number(l.descuento) > 0 ? `-${moneda(l.descuento)}` : 'Descuento'}</button>
                )}
                <button className="ml-auto text-cafe-300 hover:text-red-600" onClick={() => quitarLinea(i)}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
          {!pedido && carrito.length === 0 && <p className="py-8 text-center text-sm text-cafe-400">Toca un producto para agregarlo.</p>}
          {!pedido && (
            <input className="input mt-3 text-sm" placeholder="Observaciones generales del pedido" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          )}
        </div>

        <div className="border-t border-crema-200 bg-crema-50 p-3">
          {pedido && (
            <div className="mb-2 space-y-0.5 text-sm">
              <div className="flex justify-between text-cafe-500"><span>Subtotal</span><span>{moneda(pedido.subtotal)}</span></div>
              {Number(pedido.impuestos) > 0 && <div className="flex justify-between text-cafe-500"><span>Impuestos</span><span>{moneda(pedido.impuestos)}</span></div>}
              {Number(pedido.descuento) > 0 && <div className="flex justify-between text-cafe-500"><span>Descuento</span><span>-{moneda(pedido.descuento)}</span></div>}
              {Number(pedido.valor_domicilio) > 0 && <div className="flex justify-between text-cafe-500"><span>Domicilio</span><span>{moneda(pedido.valor_domicilio)}</span></div>}
              {Number(pedido.pagado) > 0 && <div className="flex justify-between text-emerald-700"><span>Pagado</span><span>-{moneda(pedido.pagado)}</span></div>}
              {carrito.length > 0 && <div className="flex justify-between text-cafe-500"><span>Por agregar</span><span>{moneda(totalCarrito)}</span></div>}
            </div>
          )}
          <div className="flex items-end justify-between">
            <span className="text-sm font-semibold text-cafe-500">Total</span>
            <span className="font-titulo text-3xl font-bold text-vino-700">{moneda(totalEstimado - (pedido ? Number(pedido.pagado) : 0))}</span>
          </div>
          {pedido && puede('pos.descuento') && <button className="btn-fantasma btn-sm mt-1" onClick={descuentoGeneral}><Percent size={13} /> Descuento a la cuenta</button>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn-secundario py-3" disabled={guardando || (!pedido && carrito.length === 0) || (pedido && carrito.length === 0)} onClick={enviar}>
              <Send size={16} /> {pedido ? 'Agregar' : 'Guardar / cocina'}
            </button>
            <button className="btn-primario py-3 text-base" disabled={guardando || (!pedido && carrito.length === 0)} onClick={cobrar}><Wallet size={18} /> Cobrar</button>
          </div>
        </div>
      </aside>

      {/* Barra fija en celular para ver el pedido */}
      {(carrito.length > 0 || pedido) && (
        <button onClick={() => document.getElementById('panel-pedido')?.scrollIntoView({ behavior: 'smooth' })}
          className="no-imprimir fixed inset-x-3 bottom-3 z-30 flex items-center justify-between rounded-2xl bg-vino-700 px-5 py-3.5 text-white shadow-2xl xl:hidden">
          <span className="text-sm font-semibold">{carrito.reduce((s, l) => s + l.cantidad, 0) + itemsPedido.length} producto(s) · Ver pedido</span>
          <span className="font-titulo text-xl font-bold">{moneda(totalEstimado - (pedido ? Number(pedido.pagado) : 0))}</span>
        </button>
      )}

      {/* Observación / descuento por línea */}
      <Modal abierto={nota !== null} onCerrar={() => setNota(null)} titulo={typeof nota === 'object' && nota ? 'Descuento del producto' : 'Observación'}
        pie={<button className="btn-primario" onClick={() => setNota(null)}>Listo</button>}>
        {typeof nota === 'number' && carrito[nota] && (
          <>
            <textarea className="input" rows={3} autoFocus placeholder="Ej.: sin cebolla, término medio…" value={carrito[nota].observaciones}
              onChange={(e) => cambiarLinea(nota, { observaciones: e.target.value })} />
            <div className="mt-2 flex flex-wrap gap-1">
              {['Sin cebolla', 'Sin sal', 'Para llevar', 'Sin ensalada', 'Bien asado', 'Poco arroz'].map((s) => (
                <button key={s} className="btn-secundario btn-sm" onClick={() => cambiarLinea(nota, { observaciones: [carrito[nota].observaciones, s].filter(Boolean).join(', ') })}>{s}</button>
              ))}
            </div>
          </>
        )}
        {typeof nota === 'object' && nota && carrito[nota.desc] && (
          <Campo etiqueta="Descuento en pesos para esta línea">
            <input type="number" className="input" autoFocus value={carrito[nota.desc].descuento || ''} onChange={(e) => cambiarLinea(nota.desc, { descuento: Number(e.target.value) })} />
          </Campo>
        )}
      </Modal>

      {/* Elegir talla/color o presentación */}
      <Modal abierto={!!elegir} onCerrar={() => setElegir(null)} titulo={elegir?.nombre || ''} ancho="max-w-xl">
        {elegir && (() => {
          const variantes = elegir.opciones.filter((o) => o.tipo === 'variante');
          const presentaciones = elegir.opciones.filter((o) => o.tipo === 'presentacion');
          const tallas = [...new Set(variantes.map((o) => o.talla))];
          const colores = [...new Set(variantes.map((o) => o.color))];
          const elegirOpcion = (o) => { agregar(elegir, o, false); setElegir(null); };
          return variantes.length ? (
            <div className="overflow-x-auto">
              <p className="mb-2 text-sm text-cafe-500">Elige la talla y el color (o escanea la etiqueta de la prenda):</p>
              <table className="w-full text-sm">
                <thead><tr><th className="p-1 text-left text-xs text-cafe-400">Color \ Talla</th>{tallas.map((t) => <th key={t} className="p-1 text-xs font-bold">{t}</th>)}</tr></thead>
                <tbody>{colores.map((c) => (
                  <tr key={c}><td className="p-1 font-semibold">{c}</td>
                    {tallas.map((t) => { const o = variantes.find((x) => x.talla === t && x.color === c); return (
                      <td key={t} className="p-1 text-center">{o ? <button className="btn-secundario w-full py-3 hover:border-vino-400 hover:bg-vino-50" onClick={() => elegirOpcion(o)}>{t}</button> : '—'}</td>); })}
                  </tr>))}</tbody>
              </table>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn-secundario flex-col py-4" onClick={() => { agregar(elegir, null, false); setElegir(null); }}>
                <span className="text-base">Unidad</span><span className="font-titulo text-lg font-bold text-vino-700">{moneda(elegir.precioSede)}</span></button>
              {presentaciones.map((o) => (
                <button key={o.id} className="btn-secundario flex-col py-4" onClick={() => elegirOpcion(o)}>
                  <span className="text-base">{o.nombre}</span>
                  <span className="font-titulo text-lg font-bold text-vino-700">{moneda(o.precio ?? Number(elegir.precioSede) * Number(o.factor))}</span>
                  <span className="text-xs text-cafe-400">{Number(o.factor)} unidades</span></button>
              ))}
            </div>
          );
        })()}
      </Modal>

      {/* Cuentas abiertas */}
      <Modal abierto={!!cuentas} onCerrar={() => setCuentas(null)} titulo={negocio?.tipo === 'ropa' ? 'Apartados y cuentas abiertas' : 'Cuentas abiertas'}>
        {cuentas && (cuentas.length === 0 ? <p className="py-6 text-center text-sm text-cafe-400">No hay cuentas abiertas.</p> : (
          <div className="space-y-2">
            {cuentas.map((c) => (
              <button key={c.id} className="btn-secundario w-full justify-between py-3" onClick={() => { setCuentas(null); router.push(`/pos?pedido=${c.id}`); }}>
                <span className="text-left"><b>#{c.numero}</b> · {c.nombre_cuenta || c.mesas?.nombre || nombreTipo(c.tipo_servicio)}</span>
                <span>{moneda(Number(c.total) - Number(c.pagado))}</span>
              </button>
            ))}
          </div>
        ))}
      </Modal>

      {/* Producto personalizado */}
      <Modal abierto={!!personal} onCerrar={() => setPersonal(null)} titulo="Producto personalizado"
        pie={<><button className="btn-secundario" onClick={() => setPersonal(null)}>Cancelar</button>
          <button className="btn-primario" disabled={!personal?.nombre?.trim() || !(Number(personal?.precio) >= 0) || personal?.precio === ''}
            onClick={() => { setCarrito((c) => [...c, { producto_id: null, nombre: personal.nombre.trim(), precio: Number(personal.precio), cantidad: Number(personal.cantidad) || 1, observaciones: '', descuento: 0, va_a_cocina: personal.va_a_cocina }]); setPersonal(null); }}>Agregar</button></>}>
        {personal && (
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Descripción" className="col-span-2"><input className="input" value={personal.nombre} onChange={(e) => setPersonal({ ...personal, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Precio"><input type="number" className="input" value={personal.precio} onChange={(e) => setPersonal({ ...personal, precio: e.target.value })} /></Campo>
            <Campo etiqueta="Cantidad"><input type="number" className="input" value={personal.cantidad} onChange={(e) => setPersonal({ ...personal, cantidad: e.target.value })} /></Campo>
            <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={personal.va_a_cocina} onChange={(e) => setPersonal({ ...personal, va_a_cocina: e.target.checked })} /> Enviar a cocina</label>
          </div>
        )}
      </Modal>

      <ModalCobro abierto={!!cobro} pedido={cobro && pedido ? pedido : cobro} onCerrar={() => setCobro(null)}
        onPagado={(r) => { const id = cobro.id; setCobro(null); setResultado({ ...r, id }); recargarCaja(); if (r.estado_pago !== 'pagado') cargarPedido(id); }} />
      <ModalVentaLista abierto={!!resultado} resultado={resultado} pedidoId={resultado?.id} telefono={cliente?.telefono || domicilio.telefono}
        onNueva={() => { const pagado = resultado?.estado_pago === 'pagado'; setResultado(null); if (pagado) limpiar(); }} />
    </div>
  );
}

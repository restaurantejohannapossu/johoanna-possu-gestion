'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Printer, MessageCircle, FileBadge, Eye } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Pestanas, TablaDatos, Modal, Campo, Alerta, Estado, Chip, useAviso, useCarga } from '@/components/ui';
import Crud from '@/components/Crud';
import DetallePedido from '@/components/DetallePedido';
import { textoComprobante, abrirWhatsApp } from '@/components/Cobro';
import { q, rpc } from '@/lib/supabase';
import { hoyISO, moneda } from '@/lib/formato';

export default function Pagina() { return <Requiere permisos={['facturacion.ver']}><Facturacion /></Requiere>; }

function Facturacion() {
  const { puede } = useSesion();
  const [tab, setTab] = useState('comprobantes');
  return (
    <div>
      <Encabezado titulo="Facturación y comprobantes" subtitulo="Comprobantes internos de venta y preparación para facturación electrónica DIAN" />
      <Pestanas valor={tab} onCambio={setTab} opciones={[
        { id: 'comprobantes', etiqueta: 'Comprobantes de venta' }, { id: 'electronica', etiqueta: 'Facturación electrónica' },
        puede('facturacion.configurar') && { id: 'resoluciones', etiqueta: 'Resoluciones y numeración' },
      ]} />
      {tab === 'comprobantes' && <Comprobantes />}
      {tab === 'electronica' && <Electronica />}
      {tab === 'resoluciones' && <Resoluciones />}
    </div>
  );
}

function Comprobantes() {
  const { sedeId } = useSesion();
  const aviso = useAviso();
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [detalle, setDetalle] = useState(null);
  const [fe, setFe] = useState(null);
  const { datos, cargando, recargar } = useCarga(() => q((sb) => sb.from('pedidos').select('id,numero,comprobante_numero,cerrado_en,total,devuelto,estado_pago,tipo_servicio,clientes(nombre,documento,telefono,correo,direccion)')
    .eq('sede_id', sedeId).not('comprobante_numero', 'is', null).gte('cerrado_en', `${desde}T00:00:00-05:00`).lte('cerrado_en', `${hasta}T23:59:59-05:00`).order('comprobante_numero', { ascending: false })), [sedeId, desde, hasta]);
  async function solicitar() {
    try { await rpc('solicitar_documento_electronico', { p_pedido: fe.pedido.id, p_cliente: fe.cliente }); setFe(null); aviso.ok('Solicitud registrada. Quedará pendiente hasta que se emita con el proveedor tecnológico.'); } catch (e) { aviso.error(e); }
  }
  return (
    <>
      <Alerta tono="azul">Los <b>comprobantes internos</b> respaldan cada venta, pero <b>no son facturas electrónicas</b>. Para un cliente que pida factura electrónica, usa el botón de solicitud.</Alerta>
      <div className="mb-3 flex gap-2">
        <input type="date" className="input w-auto" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input type="date" className="input w-auto" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </div>
      <TablaDatos cargando={cargando} filas={datos || []} exportar="Comprobantes de venta" subtitulo={`${desde} a ${hasta}`} columnas={[
        { clave: 'comprobante_numero', titulo: 'Comprobante' }, { clave: 'numero', titulo: 'Pedido' }, { clave: 'cerrado_en', titulo: 'Fecha', tipo: 'fechahora' },
        { clave: 'cliente', titulo: 'Cliente', render: (f) => f.clientes?.nombre || 'Cliente general', exportar: (f) => f.clientes?.nombre || 'Cliente general' },
        { clave: 'estado_pago', titulo: 'Estado', tipo: 'estado' }, { clave: 'total', titulo: 'Total', tipo: 'moneda' },
      ]} acciones={(f) => (
        <div className="flex justify-end gap-1">
          <button className="btn-secundario btn-sm" onClick={() => setDetalle(f.id)}><Eye size={13} /></button>
          {['58mm', '80mm', 'carta'].map((x) => <Link key={x} href={`/imprimir/${f.id}?formato=${x}&auto=1`} target="_blank" className="btn-secundario btn-sm" title={`Imprimir ${x}`}><Printer size={13} /> {x === 'carta' ? 'PDF' : x.replace('mm', '')}</Link>)}
          {f.clientes?.telefono && <button className="btn-secundario btn-sm" onClick={async () => abrirWhatsApp(f.clientes.telefono, await textoComprobante(f.id))}><MessageCircle size={13} /></button>}
          {f.estado_pago === 'pagado' && <button className="btn-secundario btn-sm" title="Solicitar factura electrónica" onClick={() => setFe({ pedido: f, cliente: { tipo_documento: 'CC', documento: f.clientes?.documento || '', nombre: f.clientes?.nombre || '', correo: f.clientes?.correo || '', direccion: f.clientes?.direccion || '', telefono: f.clientes?.telefono || '' } })}><FileBadge size={13} /></button>}
        </div>
      )} />
      <Modal abierto={!!fe} onCerrar={() => setFe(null)} titulo={`Solicitar factura electrónica · comprobante ${fe?.pedido?.comprobante_numero || ''}`}
        pie={<><button className="btn-secundario" onClick={() => setFe(null)}>Cancelar</button><button className="btn-primario" onClick={solicitar}>Registrar solicitud</button></>}>
        {fe && <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Tipo de documento"><select className="input" value={fe.cliente.tipo_documento} onChange={(e) => setFe({ ...fe, cliente: { ...fe.cliente, tipo_documento: e.target.value } })}>{['CC', 'NIT', 'CE', 'Pasaporte'].map((x) => <option key={x}>{x}</option>)}</select></Campo>
          {['documento', 'nombre', 'correo', 'telefono', 'direccion'].map((k) => (
            <Campo key={k} etiqueta={{ documento: 'Número de documento *', nombre: 'Nombre o razón social *', correo: 'Correo para enviar la factura', telefono: 'Teléfono', direccion: 'Dirección' }[k]}>
              <input className="input" value={fe.cliente[k]} onChange={(e) => setFe({ ...fe, cliente: { ...fe.cliente, [k]: e.target.value } })} /></Campo>
          ))}
        </div>}
      </Modal>
      <DetallePedido pedidoId={detalle} onCerrar={() => setDetalle(null)} onCambio={recargar} />
    </>
  );
}

function Electronica() {
  const { sedeId, empresa } = useSesion();
  const { datos, cargando } = useCarga(() => q((sb) => sb.from('documentos_electronicos').select('*, pedidos(numero, comprobante_numero, total)').eq('sede_id', sedeId).order('creado_en', { ascending: false })), [sedeId]);
  return (
    <>
      <div className="tarjeta mb-4 p-5">
        <h3 className="mb-2 font-bold">Estado de la integración</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {empresa?.fe_habilitada ? <Chip color="verde">Habilitada</Chip> : <Chip color="amarillo">No conectada</Chip>}
          <span>Proveedor tecnológico: <b>{empresa?.fe_proveedor || 'Sin definir'}</b> · Ambiente: <b>{empresa?.fe_ambiente}</b></span>
        </div>
        <p className="mt-3 text-sm text-cafe-500">
          El sistema ya guarda los datos tributarios (NIT, responsabilidades, resoluciones, prefijos y numeración) y la cola de solicitudes de factura. La emisión legal
          (XML UBL, firma, CUFE, código QR y validación previa de la DIAN) se hace a través de un <b>proveedor tecnológico autorizado</b>. Mientras no exista esa conexión,
          las solicitudes quedan en estado <b>pendiente</b> y <b>nunca</b> se muestran como validadas.
        </p>
      </div>
      <TablaDatos cargando={cargando} filas={datos || []} exportar="Documentos electrónicos" columnas={[
        { clave: 'creado_en', titulo: 'Solicitado', tipo: 'fechahora' }, { clave: 'tipo', titulo: 'Tipo' },
        { clave: 'comprobante', titulo: 'Comprobante', render: (f) => f.pedidos?.comprobante_numero, exportar: (f) => f.pedidos?.comprobante_numero },
        { clave: 'cliente', titulo: 'Adquiriente', render: (f) => `${f.cliente?.nombre || ''} · ${f.cliente?.tipo_documento || ''} ${f.cliente?.documento || ''}`, exportar: (f) => `${f.cliente?.nombre} ${f.cliente?.documento}` },
        { clave: 'total', titulo: 'Valor', tipo: 'moneda', render: (f) => moneda(f.pedidos?.total), exportar: (f) => f.pedidos?.total },
        { clave: 'numero', titulo: 'Número', render: (f) => (f.numero ? `${f.prefijo || ''}${f.numero}` : '—') },
        { clave: 'estado', titulo: 'Estado', render: (f) => <Estado valor={f.estado} /> },
        { clave: 'cufe', titulo: 'CUFE', render: (f) => (f.cufe ? <span className="font-mono text-xs">{f.cufe.slice(0, 16)}…</span> : '—') },
      ]} vacio="No hay solicitudes de factura electrónica." />
    </>
  );
}

function Resoluciones() {
  const { sedes } = useSesion();
  return (
    <>
      <Alerta tono="azul">Registra aquí las resoluciones de numeración que la DIAN autoriza (prefijo, rango y vigencia). Se usarán al conectar el proveedor tecnológico.</Alerta>
      <Crud tabla="resoluciones" titulo="resolución" orden="creado_en" campoActivo="activa" exportar="Resoluciones"
        campos={[
          { clave: 'tipo', etiqueta: 'Tipo de documento', tipo: 'select', requerido: true, opciones: [
            { valor: 'factura_electronica', texto: 'Factura electrónica de venta' }, { valor: 'documento_equivalente_pos', texto: 'Documento equivalente electrónico (POS)' },
            { valor: 'nota_credito', texto: 'Nota crédito' }, { valor: 'nota_debito', texto: 'Nota débito' }] },
          { clave: 'sede_id', etiqueta: 'Sede (vacío = todas)', tipo: 'select', opciones: sedes.map((s) => ({ valor: s.id, texto: s.nombre })) },
          { clave: 'prefijo', etiqueta: 'Prefijo' }, { clave: 'numero_resolucion', etiqueta: 'Número de resolución' },
          { clave: 'fecha_resolucion', etiqueta: 'Fecha de resolución', tipo: 'fecha' }, { clave: 'vigencia_hasta', etiqueta: 'Vigente hasta', tipo: 'fecha' },
          { clave: 'desde', etiqueta: 'Rango desde', tipo: 'numero' }, { clave: 'hasta', etiqueta: 'Rango hasta', tipo: 'numero' },
        ]}
        columnas={[
          { clave: 'tipo', titulo: 'Tipo' }, { clave: 'prefijo', titulo: 'Prefijo' }, { clave: 'numero_resolucion', titulo: 'Resolución' },
          { clave: 'rango', titulo: 'Rango', render: (f) => `${f.desde ?? '—'} – ${f.hasta ?? '—'}` }, { clave: 'actual', titulo: 'Último usado' },
          { clave: 'vigencia_hasta', titulo: 'Vigencia', tipo: 'fecha' },
        ]} />
    </>
  );
}

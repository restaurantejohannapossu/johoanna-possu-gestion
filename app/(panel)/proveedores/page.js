'use client';
import { useState } from 'react';
import { History, MessageCircle } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Modal, TablaDatos, Kpi, useCarga } from '@/components/ui';
import Crud from '@/components/Crud';
import { abrirWhatsApp } from '@/components/Cobro';
import { q } from '@/lib/supabase';
import { moneda } from '@/lib/formato';

export default function Pagina() { return <Requiere permisos={['proveedores.ver']}><Proveedores /></Requiere>; }

function Proveedores() {
  const { puede } = useSesion();
  const [hist, setHist] = useState(null);
  return (
    <div>
      <Encabezado titulo="Proveedores" subtitulo="Directorio de proveedores, historial de compras y saldos" />
      <Crud tabla="proveedores" titulo="proveedor" exportar="Proveedores" puedeEditar={puede('proveedores.gestionar')}
        campos={[
          { clave: 'nombre', etiqueta: 'Nombre o razón social', requerido: true, ancho: 'sm:col-span-2' },
          { clave: 'tipo_documento', etiqueta: 'Tipo de documento', tipo: 'select', opciones: ['NIT', 'CC', 'CE', 'Otro'].map((x) => ({ valor: x, texto: x })), defecto: 'NIT' },
          { clave: 'documento', etiqueta: 'NIT o documento' },
          { clave: 'telefono', etiqueta: 'Teléfono' }, { clave: 'whatsapp', etiqueta: 'WhatsApp' },
          { clave: 'correo', etiqueta: 'Correo', tipo: 'correo' }, { clave: 'ciudad', etiqueta: 'Ciudad' },
          { clave: 'direccion', etiqueta: 'Dirección', ancho: 'sm:col-span-2' },
          { clave: 'productos_suministrados', etiqueta: 'Productos que suministra', tipo: 'textarea', ancho: 'sm:col-span-2' },
          { clave: 'observaciones', etiqueta: 'Observaciones', tipo: 'textarea', ancho: 'sm:col-span-2' },
        ]}
        columnas={[
          { clave: 'nombre', titulo: 'Proveedor' }, { clave: 'documento', titulo: 'NIT / Doc.' },
          { clave: 'telefono', titulo: 'Teléfono' }, { clave: 'ciudad', titulo: 'Ciudad' },
          { clave: 'productos_suministrados', titulo: 'Suministra', className: 'max-w-xs truncate' },
        ]}
        acciones={(f) => <>
          {f.whatsapp && <button className="btn-secundario btn-sm" onClick={() => abrirWhatsApp(f.whatsapp, 'Hola, le escribimos del Restaurante Johoanna Possu.')}><MessageCircle size={13} /></button>}
          {puede('compras.ver') && <button className="btn-secundario btn-sm" onClick={() => setHist(f)} title="Historial"><History size={13} /></button>}
        </>} />
      {hist && <Historial proveedor={hist} onCerrar={() => setHist(null)} />}
    </div>
  );
}

function Historial({ proveedor, onCerrar }) {
  const { datos } = useCarga(() => q((sb) => sb.from('compras').select('id,numero,fecha,estado,estado_pago,total,pagado,sedes(nombre)').eq('proveedor_id', proveedor.id).order('fecha', { ascending: false })), [proveedor.id]);
  const total = (datos || []).filter((c) => c.estado !== 'cancelada').reduce((s, c) => s + Number(c.total), 0);
  const saldo = (datos || []).filter((c) => c.estado !== 'cancelada').reduce((s, c) => s + Number(c.total) - Number(c.pagado), 0);
  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Historial · ${proveedor.nombre}`} ancho="max-w-3xl">
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Kpi titulo="Compras" valor={datos?.length ?? '…'} /><Kpi titulo="Total comprado" valor={moneda(total)} /><Kpi titulo="Saldo por pagar" valor={moneda(saldo)} tono="rojo" />
      </div>
      <TablaDatos filas={datos || []} cargando={!datos} exportar={`Compras ${proveedor.nombre}`} columnas={[
        { clave: 'numero', titulo: 'N.º' }, { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
        { clave: 'sede', titulo: 'Sede', render: (f) => f.sedes?.nombre, exportar: (f) => f.sedes?.nombre },
        { clave: 'estado', titulo: 'Estado', tipo: 'estado' }, { clave: 'estado_pago', titulo: 'Pago', tipo: 'estado' },
        { clave: 'total', titulo: 'Total', tipo: 'moneda' }, { clave: 'pagado', titulo: 'Pagado', tipo: 'moneda' },
      ]} />
    </Modal>
  );
}

'use client';
import { useState } from 'react';
import { History, MessageCircle } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Modal, TablaDatos, Kpi, useCarga } from '@/components/ui';
import Crud from '@/components/Crud';
import { abrirWhatsApp } from '@/components/Cobro';
import { q } from '@/lib/supabase';
import { moneda, fecha } from '@/lib/formato';

export default function Pagina() { return <Requiere permisos={['clientes.ver']}><Clientes /></Requiere>; }

function Clientes() {
  const { puede, negocio } = useSesion();
  const [hist, setHist] = useState(null);
  return (
    <div>
      <Encabezado titulo="Clientes" subtitulo="Base de datos de clientes, historial de compras y preferencias" />
      <Crud tabla="clientes" titulo="cliente" exportar="Clientes" puedeEditar={puede('clientes.gestionar')}
        campos={[
          { clave: 'nombre', etiqueta: 'Nombre', requerido: true, ancho: 'sm:col-span-2' },
          { clave: 'tipo_documento', etiqueta: 'Tipo de documento', tipo: 'select', opciones: ['CC', 'NIT', 'CE', 'TI', 'Pasaporte'].map((x) => ({ valor: x, texto: x })), defecto: 'CC' },
          { clave: 'documento', etiqueta: 'Documento' },
          { clave: 'telefono', etiqueta: 'Teléfono' }, { clave: 'whatsapp', etiqueta: 'WhatsApp' },
          { clave: 'correo', etiqueta: 'Correo', tipo: 'correo' }, { clave: 'barrio', etiqueta: 'Barrio' },
          { clave: 'direccion', etiqueta: 'Dirección', ancho: 'sm:col-span-2' },
          { clave: 'preferencias', etiqueta: 'Preferencias', tipo: 'textarea', ancho: 'sm:col-span-2', ayuda: 'Ej.: no come cebolla, prefiere jugo de lulo' },
          { clave: 'observaciones', etiqueta: 'Observaciones', tipo: 'textarea', ancho: 'sm:col-span-2' },
        ]}
        columnas={[
          { clave: 'nombre', titulo: 'Cliente' }, { clave: 'documento', titulo: 'Documento' }, { clave: 'telefono', titulo: 'Teléfono' },
          { clave: 'direccion', titulo: 'Dirección', render: (f) => [f.direccion, f.barrio].filter(Boolean).join(', '), exportar: (f) => [f.direccion, f.barrio].filter(Boolean).join(', ') },
          { clave: 'preferencias', titulo: 'Preferencias', className: 'max-w-xs truncate' },
        ]}
        acciones={(f) => <>
          {(f.whatsapp || f.telefono) && <button className="btn-secundario btn-sm" onClick={() => abrirWhatsApp(f.whatsapp || f.telefono, `Hola ${f.nombre}, te saludamos de ${negocio?.nombre || ''}.`)}><MessageCircle size={13} /></button>}
          <button className="btn-secundario btn-sm" onClick={() => setHist(f)} title="Historial"><History size={13} /></button>
        </>} />
      {hist && <Historial cliente={hist} onCerrar={() => setHist(null)} />}
    </div>
  );
}

function Historial({ cliente, onCerrar }) {
  const { datos } = useCarga(async () => {
    const pedidos = await q((sb) => sb.from('pedidos').select('id,numero,cerrado_en,creado_en,tipo_servicio,total,estado_pago,sedes(nombre)').eq('cliente_id', cliente.id).order('creado_en', { ascending: false }).limit(500));
    const pagados = pedidos.filter((p) => p.estado_pago === 'pagado');
    let top = [];
    if (pagados.length) {
      const items = await q((sb) => sb.from('pedido_items').select('nombre,cantidad').in('pedido_id', pagados.slice(0, 200).map((p) => p.id)).eq('estado', 'activo'));
      const m = {}; items.forEach((i) => { m[i.nombre] = (m[i.nombre] || 0) + Number(i.cantidad); });
      top = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
    }
    return { pedidos, pagados, top };
  }, [cliente.id]);
  const total = datos?.pagados.reduce((s, p) => s + Number(p.total), 0) || 0;
  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Historial · ${cliente.nombre}`} ancho="max-w-3xl">
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi titulo="Compras" valor={datos?.pagados.length ?? '…'} />
        <Kpi titulo="Total comprado" valor={moneda(total)} />
        <Kpi titulo="Ticket promedio" valor={moneda(datos?.pagados.length ? total / datos.pagados.length : 0)} />
        <Kpi titulo="Última compra" valor={datos?.pagados[0] ? fecha(datos.pagados[0].cerrado_en) : '—'} />
      </div>
      {datos?.top.length > 0 && <p className="mb-3 text-sm"><b>Lo que más pide:</b> {datos.top.map(([n, c]) => `${n} (${c})`).join(', ')}</p>}
      <TablaDatos filas={datos?.pedidos || []} cargando={!datos} columnas={[
        { clave: 'numero', titulo: 'Pedido' }, { clave: 'creado_en', titulo: 'Fecha', tipo: 'fechahora' },
        { clave: 'sede', titulo: 'Sede', render: (f) => f.sedes?.nombre }, { clave: 'tipo_servicio', titulo: 'Servicio', tipo: 'etiqueta' },
        { clave: 'estado_pago', titulo: 'Estado', tipo: 'estado' }, { clave: 'total', titulo: 'Total', tipo: 'moneda' },
      ]} />
    </Modal>
  );
}

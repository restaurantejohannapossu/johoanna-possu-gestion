'use client';
import { useState } from 'react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Pestanas, Alerta } from '@/components/ui';
import Crud from '@/components/Crud';
import { q } from '@/lib/supabase';

export default function Pagina() { return <Requiere permisos={['sedes.gestionar']}><Sedes /></Requiere>; }

function Sedes() {
  const { sedeId, sede, recargarPerfil, puede } = useSesion();
  const [tab, setTab] = useState('sedes');
  return (
    <div>
      <Encabezado titulo="Sedes" subtitulo="Crea sedes nuevas sin desarrollar nada más: cada una tiene sus cajas, mesas, inventario y ventas" />
      <Pestanas valor={tab} onCambio={setTab} opciones={[{ id: 'sedes', etiqueta: 'Sedes' }, { id: 'cajas', etiqueta: `Cajas · ${sede?.nombre || ''}` }, puede('mesas.configurar') && { id: 'mesas', etiqueta: `Mesas · ${sede?.nombre || ''}` }]} />
      {tab === 'sedes' && (
        <>
          <Alerta tono="azul">Al crear una sede se crea automáticamente su “Caja principal”. El menú es central: puedes ajustar precios y disponibilidad por sede desde Productos.</Alerta>
          <Crud tabla="sedes" titulo="sede" campoActivo="activa" exportar="Sedes"
            transformar={(f) => ({ ...f, codigo: f.codigo?.toUpperCase().replace(/\s+/g, '_') })}
            alGuardar={async (s, nueva) => { if (nueva) await q((sb) => sb.from('cajas').insert({ sede_id: s.id, nombre: 'Caja principal' })); await recargarPerfil(); }}
            campos={[
              { clave: 'codigo', etiqueta: 'Código', requerido: true }, { clave: 'nombre', etiqueta: 'Nombre', requerido: true },
              { clave: 'direccion', etiqueta: 'Dirección', ancho: 'sm:col-span-2' }, { clave: 'telefono', etiqueta: 'Teléfono' }, { clave: 'whatsapp', etiqueta: 'WhatsApp' },
              { clave: 'horarios', etiqueta: 'Horarios de atención', ancho: 'sm:col-span-2' },
            ]}
            columnas={[{ clave: 'codigo', titulo: 'Código' }, { clave: 'nombre', titulo: 'Sede' }, { clave: 'direccion', titulo: 'Dirección' }, { clave: 'whatsapp', titulo: 'WhatsApp' }, { clave: 'horarios', titulo: 'Horarios' }]} />
        </>
      )}
      {tab === 'cajas' && (
        <Crud tabla="cajas" titulo="caja" campoActivo="activa" filtro={(c) => c.eq('sede_id', sedeId)} valoresFijos={{ sede_id: sedeId }} deps={[sedeId]}
          campos={[{ clave: 'nombre', etiqueta: 'Nombre de la caja', requerido: true }]} columnas={[{ clave: 'nombre', titulo: 'Caja' }]} />
      )}
      {tab === 'mesas' && (
        <Crud tabla="mesas" titulo="mesa" campoActivo="activa" orden="orden" filtro={(c) => c.eq('sede_id', sedeId)} valoresFijos={{ sede_id: sedeId }} deps={[sedeId]} exportar="Mesas"
          campos={[
            { clave: 'nombre', etiqueta: 'Nombre', requerido: true }, { clave: 'zona', etiqueta: 'Zona (salón, terraza…)' },
            { clave: 'capacidad', etiqueta: 'Capacidad (personas)', tipo: 'numero', defecto: 4 }, { clave: 'orden', etiqueta: 'Orden', tipo: 'numero', defecto: 0 },
          ]}
          columnas={[{ clave: 'nombre', titulo: 'Mesa' }, { clave: 'zona', titulo: 'Zona' }, { clave: 'capacidad', titulo: 'Capacidad', tipo: 'numero' }, { clave: 'estado', titulo: 'Estado actual', tipo: 'estado' }]} />
      )}
    </div>
  );
}

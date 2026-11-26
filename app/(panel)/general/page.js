'use client';
import { useEffect, useState } from 'react';
import { Plus, Pencil, ImagePlus, Save } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Pestanas, Campo, Modal, Alerta, Cargando, Chip, useAviso, useCarga } from '@/components/ui';
import Crud from '@/components/Crud';
import { q } from '@/lib/supabase';
import { subirArchivo } from '@/lib/archivos';

export default function Pagina() { return <Requiere permisos={['configuracion.gestionar']}><General /></Requiere>; }

const TEMAS = [
  { id: 'restaurante', nombre: 'Vinotinto y dorado', colores: ['#6b1e2e', '#e0a92a', '#fbf5e9'] },
  { id: 'boutique', nombre: 'Ciruela y rosa dorado', colores: ['#6e2a5a', '#db8b72', '#fbf5f7'] },
  { id: 'tienda', nombre: 'Azul noche y ámbar', colores: ['#27436d', '#f2ae2b', '#f6f5ef'] },
];
const MODULOS = [
  ['mesas', 'Mesas', 'Cuentas por mesa (restaurante)'], ['cocina', 'Cocina', 'Comandas en pantalla para la cocina'],
  ['recetas', 'Recetas', 'Ingredientes y costeo de platos'], ['domicilios', 'Domicilios', 'Pedidos a domicilio'],
  ['variantes', 'Tallas y colores', 'Cada combinación con su código e inventario (ropa)'],
  ['presentaciones', 'Presentaciones', 'Unidad, paca, canasta… (tienda)'], ['cuentas', 'Cuentas abiertas', 'Cuentas que se pagan al final o apartados'],
];
const MODULOS_TIPO = {
  restaurante: { mesas: true, cocina: true, recetas: true, domicilios: true, variantes: false, presentaciones: false, cuentas: false },
  ropa: { mesas: false, cocina: false, recetas: false, domicilios: true, variantes: true, presentaciones: false, cuentas: true },
  tienda: { mesas: false, cocina: false, recetas: false, domicilios: true, variantes: false, presentaciones: true, cuentas: true },
  otro: { mesas: false, cocina: false, recetas: false, domicilios: false, variantes: false, presentaciones: true, cuentas: true },
};

function General() {
  const { perfil } = useSesion();
  const [tab, setTab] = useState('negocios');
  return (
    <div>
      <Encabezado titulo="Configuración general" subtitulo="Lo que comparten todos los negocios: negocios, medios de pago, impuestos, seguridad" />
      <Pestanas valor={tab} onCambio={setTab} opciones={[
        { id: 'negocios', etiqueta: 'Negocios' }, { id: 'grupo', etiqueta: 'Datos generales y seguridad' },
        { id: 'metodos', etiqueta: 'Métodos de pago' }, { id: 'impuestos', etiqueta: 'Impuestos' }, { id: 'gastos', etiqueta: 'Categorías de gastos' },
      ]} />
      {tab === 'negocios' && <Negocios superadmin={perfil?.superadmin} />}
      {tab === 'grupo' && <Grupo />}
      {tab === 'metodos' && <Crud tabla="metodos_pago" titulo="método de pago" orden="orden"
        campos={[{ clave: 'nombre', etiqueta: 'Nombre', requerido: true }, { clave: 'orden', etiqueta: 'Orden', tipo: 'numero', defecto: 0 }, { clave: 'es_efectivo', etiqueta: 'Es efectivo', tipo: 'booleano', textoCheck: 'Cuenta como dinero físico en caja' }]}
        columnas={[{ clave: 'nombre', titulo: 'Método' }, { clave: 'es_efectivo', titulo: 'Efectivo', tipo: 'booleano' }, { clave: 'orden', titulo: 'Orden', tipo: 'numero' }]} />}
      {tab === 'impuestos' && <><Alerta>Configure los impuestos según el régimen de cada negocio con su contador. Se asignan a cada producto.</Alerta>
        <Crud tabla="impuestos" titulo="impuesto" orden="porcentaje"
          campos={[{ clave: 'nombre', etiqueta: 'Nombre', requerido: true }, { clave: 'tipo', etiqueta: 'Tipo', tipo: 'select', opciones: [{ valor: 'INC', texto: 'Impuesto al consumo (INC)' }, { valor: 'IVA', texto: 'IVA' }, { valor: 'otro', texto: 'Otro' }], defecto: 'IVA', requerido: true },
            { clave: 'porcentaje', etiqueta: 'Porcentaje', tipo: 'numero', requerido: true }, { clave: 'incluido_en_precio', etiqueta: 'Incluido en el precio', tipo: 'booleano', defecto: true, textoCheck: 'El precio de venta ya incluye el impuesto' }]}
          columnas={[{ clave: 'nombre', titulo: 'Impuesto' }, { clave: 'tipo', titulo: 'Tipo' }, { clave: 'porcentaje', titulo: '%', tipo: 'numero' }, { clave: 'incluido_en_precio', titulo: 'Incluido', tipo: 'booleano' }]} /></>}
      {tab === 'gastos' && <Crud tabla="categorias" titulo="categoría de gasto" orden="orden" filtro={(c) => c.eq('tipo', 'gasto')} valoresFijos={{ tipo: 'gasto' }} campoActivo="activa"
        campos={[{ clave: 'nombre', etiqueta: 'Nombre', requerido: true }, { clave: 'orden', etiqueta: 'Orden', tipo: 'numero', defecto: 0 }]} columnas={[{ clave: 'nombre', titulo: 'Categoría' }]} />}
    </div>
  );
}

function Negocios({ superadmin }) {
  const aviso = useAviso();
  const { recargarPerfil } = useSesion();
  const [edit, setEdit] = useState(null);
  const { datos, cargando, recargar } = useCarga(() => q((sb) => sb.from('negocios').select('*').order('orden')), []);
  async function guardar() {
    const e = edit;
    if (!e.nombre?.trim() || !e.codigo?.trim()) return aviso.error('Nombre y código son obligatorios.');
    const fila = { nombre: e.nombre.trim(), codigo: e.codigo.trim().toUpperCase().replace(/\s+/g, '_'), tipo: e.tipo, eslogan: e.eslogan || null, tema: e.tema,
      modulos: e.modulos, logo_url: e.logo_url || null, activo: e.activo, orden: Number(e.orden || 0) };
    try {
      if (e.id) await q((sb) => sb.from('negocios').update(fila).eq('id', e.id));
      else {
        const n = await q((sb) => sb.from('negocios').insert(fila).select().single());
        const s = await q((sb) => sb.from('sedes').insert({ codigo: fila.codigo, nombre: fila.nombre, negocio_id: n.id }).select().single());
        await q((sb) => sb.from('cajas').insert({ sede_id: s.id, nombre: 'Caja principal' }));
      }
      setEdit(null); recargar(); await recargarPerfil(); aviso.ok('Negocio guardado.');
    } catch (err) { aviso.error(err); }
  }
  async function logo(f) { try { setEdit({ ...edit, logo_url: await subirArchivo('imagenes', f, 'logos') }); } catch (err) { aviso.error(err); } }
  if (cargando) return <Cargando />;
  return (
    <>
      {superadmin && <div className="mb-3 flex justify-end"><button className="btn-primario" onClick={() => setEdit({ nombre: '', codigo: '', tipo: 'tienda', eslogan: '', tema: 'tienda', modulos: MODULOS_TIPO.tienda, activo: true, orden: (datos?.length || 0) + 1 })}><Plus size={16} /> Nuevo negocio</button></div>}
      <div className="grid gap-4 md:grid-cols-3">
        {(datos || []).map((n) => (
          <div key={n.id} data-tema={n.tema} className="tarjeta overflow-hidden">
            <div className="flex items-center gap-3 bg-gradient-to-r from-vino-700 to-vino-900 p-4 text-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={n.logo_url || '/logos/restaurante.jpg'} alt="" className="h-12 w-12 rounded-full bg-white object-contain p-0.5" />
              <div className="min-w-0"><p className="truncate font-titulo font-bold">{n.nombre}</p><p className="text-xs text-dorado-200">{n.codigo} · {n.tipo}</p></div>
            </div>
            <div className="p-4 text-sm">
              <div className="flex flex-wrap gap-1">
                {MODULOS.filter(([k]) => n.modulos?.[k]).map(([k, t]) => <Chip key={k} color="vino">{t}</Chip>)}
                {!n.activo && <Chip color="rojo">Inactivo</Chip>}
              </div>
              <button className="btn-secundario btn-sm mt-3" onClick={() => setEdit({ ...n })}><Pencil size={13} /> Editar</button>
            </div>
          </div>
        ))}
      </div>
      <Alerta tono="azul">Los datos del comprobante (NIT, dirección, WhatsApp, mensaje) de cada negocio se editan entrando al negocio → <b>Configuración del negocio</b>.</Alerta>
      <Modal abierto={!!edit} onCerrar={() => setEdit(null)} titulo={edit?.id ? `Editar ${edit.nombre}` : 'Nuevo negocio'} ancho="max-w-2xl"
        pie={<><button className="btn-secundario" onClick={() => setEdit(null)}>Cancelar</button><button className="btn-primario" onClick={guardar}><Save size={15} /> Guardar</button></>}>
        {edit && <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Nombre *"><input className="input" value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Código *"><input className="input uppercase" value={edit.codigo} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, codigo: e.target.value })} /></Campo>
            <Campo etiqueta="Tipo de negocio"><select className="input" value={edit.tipo} disabled={!!edit.id}
              onChange={(e) => setEdit({ ...edit, tipo: e.target.value, modulos: MODULOS_TIPO[e.target.value], tema: { restaurante: 'restaurante', ropa: 'boutique', tienda: 'tienda' }[e.target.value] || edit.tema })}>
              <option value="restaurante">Restaurante</option><option value="ropa">Ropa y accesorios</option><option value="tienda">Tienda / licorera</option><option value="otro">Otro</option></select></Campo>
            <Campo etiqueta="Eslogan"><input className="input" value={edit.eslogan || ''} onChange={(e) => setEdit({ ...edit, eslogan: e.target.value })} /></Campo>
          </div>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {edit.logo_url && <img src={edit.logo_url} alt="" className="h-16 w-16 rounded-full border object-contain" />}
            <label className="btn-secundario cursor-pointer"><ImagePlus size={15} /> {edit.logo_url ? 'Cambiar logo' : 'Subir logo'}<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && logo(e.target.files[0])} /></label>
          </div>
          <div>
            <p className="etiqueta">Aspecto (colores)</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {TEMAS.map((t) => (
                <button key={t.id} onClick={() => setEdit({ ...edit, tema: t.id })} className={`rounded-xl border-2 p-3 text-left ${edit.tema === t.id ? 'border-vino-600' : 'border-crema-200'}`}>
                  <div className="mb-2 flex gap-1">{t.colores.map((c) => <span key={c} className="h-6 w-6 rounded-full border" style={{ background: c }} />)}</div>
                  <p className="text-xs font-semibold">{t.nombre}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="etiqueta">Módulos que usa</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODULOS.map(([k, t, d]) => (
                <label key={k} className="flex items-start gap-2 rounded-lg border border-crema-200 p-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={!!edit.modulos?.[k]} onChange={(e) => setEdit({ ...edit, modulos: { ...edit.modulos, [k]: e.target.checked } })} />
                  <span><b>{t}</b><span className="block text-xs text-cafe-400">{d}</span></span>
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.activo} onChange={(e) => setEdit({ ...edit, activo: e.target.checked })} /> Negocio activo</label>
          {!edit.id && <p className="text-xs text-cafe-400">Al crearlo se crea también su sede y su “Caja principal”.</p>}
        </div>}
      </Modal>
    </>
  );
}

function Grupo() {
  const aviso = useAviso();
  const { recargarEmpresa } = useSesion();
  const [e, setE] = useState(null);
  useEffect(() => { q((sb) => sb.from('config_empresa').select('*').eq('id', 1).single()).then(setE).catch(aviso.error); }, [aviso.error]);
  if (!e) return <Cargando />;
  const J = (k, tipo) => ({
    [tipo === 'check' ? 'checked' : 'value']: tipo === 'check' ? !!e.inventario?.[k] : e.inventario?.[k] ?? '',
    onChange: (ev) => setE({ ...e, inventario: { ...e.inventario, [k]: tipo === 'check' ? ev.target.checked : Number(ev.target.value) } }),
  });
  async function guardar() {
    try {
      await q((sb) => sb.from('config_empresa').update({ nombre: e.nombre, eslogan: e.eslogan, logo_url: e.logo_url || null, inventario: e.inventario,
        intentos_bloqueo: Number(e.intentos_bloqueo), minutos_bloqueo: Number(e.minutos_bloqueo), actualizado_en: new Date().toISOString() }).eq('id', 1));
      await recargarEmpresa(); aviso.ok('Configuración guardada.');
    } catch (err) { aviso.error(err); }
  }
  return (
    <div className="tarjeta max-w-3xl p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre del grupo (pantalla de inicio de sesión)"><input className="input" value={e.nombre || ''} onChange={(ev) => setE({ ...e, nombre: ev.target.value })} /></Campo>
        <Campo etiqueta="Descripción"><input className="input" value={e.eslogan || ''} onChange={(ev) => setE({ ...e, eslogan: ev.target.value })} /></Campo>
        <div className="sm:col-span-2 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {e.logo_url && <img src={e.logo_url} alt="" className="h-14 w-14 rounded-full border object-contain" />}
          <label className="btn-secundario cursor-pointer"><ImagePlus size={15} /> Logo general (opcional)<input type="file" accept="image/*" className="hidden" onChange={async (ev) => { try { setE({ ...e, logo_url: await subirArchivo('imagenes', ev.target.files[0], 'logos') }); } catch (er) { aviso.error(er); } }} /></label>
          {e.logo_url && <button className="btn-fantasma btn-sm" onClick={() => setE({ ...e, logo_url: null })}>Quitar (muestra los 3 logos)</button>}
        </div>
        <div><p className="etiqueta">Inventario (todos los negocios)</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...J('permitir_negativo', 'check')} /> Permitir vender aunque el inventario quede en negativo</label>
          <Campo etiqueta="Avisar vencimientos con días de anticipación" className="mt-2"><input type="number" className="input" {...J('dias_alerta_vencimiento')} /></Campo></div>
        <div><p className="etiqueta">Seguridad de inicio de sesión</p>
          <Campo etiqueta="Intentos fallidos antes de bloquear"><input type="number" className="input" value={e.intentos_bloqueo} onChange={(ev) => setE({ ...e, intentos_bloqueo: ev.target.value })} /></Campo>
          <Campo etiqueta="Minutos de bloqueo temporal" className="mt-2"><input type="number" className="input" value={e.minutos_bloqueo} onChange={(ev) => setE({ ...e, minutos_bloqueo: ev.target.value })} /></Campo></div>
      </div>
      <div className="mt-6 flex justify-end"><button className="btn-primario" onClick={guardar}><Save size={15} /> Guardar</button></div>
    </div>
  );
}

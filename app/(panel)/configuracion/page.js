'use client';
import { useEffect, useState } from 'react';
import { ImagePlus, Save, Trash2 } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Pestanas, Campo, Alerta, Cargando, useAviso, useConfirmar } from '@/components/ui';
import Crud from '@/components/Crud';
import { q, rpc } from '@/lib/supabase';
import { subirArchivo } from '@/lib/archivos';

export default function Pagina() { return <Requiere permisos={['configuracion.gestionar', 'facturacion.configurar']}><Configuracion /></Requiere>; }

function Configuracion() {
  const { puede, negocio } = useSesion();
  const [tab, setTab] = useState(puede('configuracion.gestionar') ? 'negocio' : 'tributario');
  const g = puede('configuracion.gestionar');
  return (
    <div>
      <Encabezado titulo={`Configuración · ${negocio?.nombre || ''}`} subtitulo="Datos de este negocio, su comprobante y su impresión. Lo compartido está en el Panel general → Configuración general." />
      <Pestanas valor={tab} onCambio={setTab} opciones={[
        g && { id: 'negocio', etiqueta: 'Datos del negocio' }, { id: 'tributario', etiqueta: 'Datos tributarios' }, g && { id: 'impresion', etiqueta: 'Comprobante e impresión' },
        g && { id: 'categorias', etiqueta: 'Categorías de inventario' }, puede('datos_demo.eliminar') && { id: 'demo', etiqueta: 'Datos de demostración' },
      ]} />
      {['negocio', 'tributario', 'impresion'].includes(tab) && <FormNegocio seccion={tab} />}
      {tab === 'categorias' && <Crud tabla="categorias" titulo="categoría" orden="orden" filtro={(c) => c.eq('tipo', 'insumo')} valoresFijos={{ tipo: 'insumo' }} campoActivo="activa"
        campos={[{ clave: 'nombre', etiqueta: 'Nombre', requerido: true }, { clave: 'orden', etiqueta: 'Orden', tipo: 'numero', defecto: 0 }]} columnas={[{ clave: 'nombre', titulo: 'Categoría' }]} />}
      {tab === 'demo' && <Demo />}
    </div>
  );
}

function FormNegocio({ seccion }) {
  const { negocioId, recargarPerfil } = useSesion();
  const aviso = useAviso();
  const [e, setE] = useState(null);
  useEffect(() => { if (negocioId) q((sb) => sb.from('negocios').select('*').eq('id', negocioId).single()).then(setE).catch(aviso.error); }, [negocioId, aviso.error]);
  if (!e) return <Cargando />;
  const S = (k) => ({ value: e[k] ?? '', onChange: (ev) => setE({ ...e, [k]: ev.target.value }) });
  const I = (k, tipo) => ({
    [tipo === 'check' ? 'checked' : 'value']: tipo === 'check' ? e.impresion?.[k] !== false : e.impresion?.[k] ?? '',
    onChange: (ev) => setE({ ...e, impresion: { ...e.impresion, [k]: tipo === 'check' ? ev.target.checked : ev.target.value } }),
  });
  async function guardar() {
    try {
      const { id, creado_en, codigo, tipo, modulos, tema, activo, orden, ...resto } = e;
      await q((sb) => sb.from('negocios').update(resto).eq('id', negocioId));
      await recargarPerfil(); aviso.ok('Configuración guardada.');
    } catch (err) { aviso.error(err); }
  }
  async function logo(f) { try { setE({ ...e, logo_url: await subirArchivo('imagenes', f, 'logos') }); } catch (err) { aviso.error(err); } }
  return (
    <div className="tarjeta max-w-4xl p-5">
      {seccion === 'negocio' && <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 sm:col-span-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {e.logo_url ? <img src={e.logo_url} alt="Logo" className="h-20 w-20 rounded-full border border-crema-200 object-contain" /> : <div className="flex h-20 w-20 items-center justify-center rounded-full bg-crema-200 text-xs text-cafe-400">Sin logo</div>}
          <label className="btn-secundario cursor-pointer"><ImagePlus size={15} /> Cambiar logo<input type="file" accept="image/*" className="hidden" onChange={(ev) => ev.target.files[0] && logo(ev.target.files[0])} /></label>
        </div>
        <Campo etiqueta="Nombre comercial"><input className="input" {...S('nombre')} /></Campo>
        <Campo etiqueta="Eslogan"><input className="input" {...S('eslogan')} /></Campo>
        <Campo etiqueta="Dirección" className="sm:col-span-2"><input className="input" {...S('direccion')} /></Campo>
        <Campo etiqueta="Ciudad"><input className="input" {...S('ciudad')} /></Campo>
        <Campo etiqueta="Teléfono"><input className="input" {...S('telefono')} /></Campo>
        <Campo etiqueta="WhatsApp"><input className="input" {...S('whatsapp')} /></Campo>
        <Campo etiqueta="Correo"><input type="email" className="input" {...S('correo')} /></Campo>
        <Campo etiqueta="Horarios" className="sm:col-span-2"><input className="input" {...S('horarios')} /></Campo>
      </div>}
      {seccion === 'tributario' && <div className="grid gap-4 sm:grid-cols-2">
        <Alerta tono="azul">Cada negocio tiene su propio NIT. Puedes llenarlo cuando lo tengas: el comprobante lo mostrará automáticamente.</Alerta><div />
        <Campo etiqueta="Razón social"><input className="input" {...S('razon_social')} /></Campo>
        <Campo etiqueta="NIT (con dígito de verificación)"><input className="input" {...S('nit')} /></Campo>
        <Campo etiqueta="Régimen"><input className="input" placeholder="Ej.: No responsable de IVA" {...S('regimen')} /></Campo>
        <Campo etiqueta="Responsabilidades tributarias (RUT)"><input className="input" {...S('responsabilidades_tributarias')} /></Campo>
        <Campo etiqueta="Proveedor tecnológico de facturación electrónica"><input className="input" {...S('fe_proveedor')} /></Campo>
        <Campo etiqueta="Ambiente"><select className="input" {...S('fe_ambiente')}><option value="pruebas">Habilitación / pruebas</option><option value="produccion">Producción</option></select></Campo>
      </div>}
      {seccion === 'impresion' && <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Mensaje al final del comprobante" className="sm:col-span-2"><textarea className="input" rows={2} {...S('mensaje_comprobante')} /></Campo>
        <Campo etiqueta="Formato de impresión por defecto"><select className="input" {...I('formato')}><option value="58mm">Térmica 58 mm</option><option value="80mm">Térmica 80 mm</option><option value="carta">Carta / PDF</option></select></Campo>
        <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" {...I('mostrar_logo', 'check')} /> Mostrar logo en el comprobante</label>
      </div>}
      <div className="mt-6 flex justify-end"><button className="btn-primario" onClick={guardar}><Save size={15} /> Guardar cambios</button></div>
    </div>
  );
}

function Demo() {
  const aviso = useAviso();
  const confirmar = useConfirmar();
  async function eliminar() {
    const r = await confirmar({ titulo: 'Eliminar datos de demostración', mensaje: 'Se borrarán los productos, insumos, recetas, proveedores y clientes marcados como DEMO. Los que ya tengan ventas o movimientos se desactivan para conservar el historial.', peligro: true, textoBoton: 'Eliminar datos DEMO' });
    if (!r.ok) return;
    try { const x = await rpc('eliminar_datos_demo'); aviso.ok(`Listo: ${x.productos_eliminados} productos y ${x.insumos_eliminados} insumos eliminados; ${x.desactivados_con_historial} desactivados por tener historial.`); } catch (e) { aviso.error(e); }
  }
  return (
    <div className="tarjeta max-w-2xl p-5">
      <p className="text-sm text-cafe-600">Los datos de demostración aparecen con la etiqueta <b>DEMO</b>. Cuando cargues el menú y el inventario reales, elimínalos aquí.</p>
      <button className="btn-peligro mt-4" onClick={eliminar}><Trash2 size={15} /> Eliminar datos de demostración</button>
    </div>
  );
}

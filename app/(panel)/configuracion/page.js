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
  const { puede } = useSesion();
  const [tab, setTab] = useState(puede('configuracion.gestionar') ? 'empresa' : 'tributario');
  const g = puede('configuracion.gestionar');
  return (
    <div>
      <Encabezado titulo="Configuración" subtitulo="Datos del restaurante, impresión, impuestos, medios de pago y preferencias del sistema" />
      <Pestanas valor={tab} onCambio={setTab} opciones={[
        g && { id: 'empresa', etiqueta: 'Restaurante' }, { id: 'tributario', etiqueta: 'Datos tributarios' }, g && { id: 'sistema', etiqueta: 'Impresión, inventario y seguridad' },
        g && { id: 'metodos', etiqueta: 'Métodos de pago' }, g && { id: 'impuestos', etiqueta: 'Impuestos' }, g && { id: 'categorias', etiqueta: 'Categorías de insumos' },
        puede('datos_demo.eliminar') && { id: 'demo', etiqueta: 'Datos de demostración' },
      ]} />
      {['empresa', 'tributario', 'sistema'].includes(tab) && <FormEmpresa seccion={tab} />}
      {tab === 'metodos' && <><Alerta tono="azul">Desactiva un método para que no aparezca al cobrar. El historial se conserva.</Alerta>
        <Crud tabla="metodos_pago" titulo="método de pago" orden="orden"
          campos={[{ clave: 'nombre', etiqueta: 'Nombre', requerido: true }, { clave: 'orden', etiqueta: 'Orden', tipo: 'numero', defecto: 0 }, { clave: 'es_efectivo', etiqueta: 'Es efectivo', tipo: 'booleano', textoCheck: 'Cuenta como dinero físico en caja' }]}
          columnas={[{ clave: 'nombre', titulo: 'Método' }, { clave: 'es_efectivo', titulo: 'Efectivo', tipo: 'booleano' }, { clave: 'orden', titulo: 'Orden', tipo: 'numero' }]} /></>}
      {tab === 'impuestos' && <><Alerta>Configure los impuestos según el régimen del restaurante con su contador (por ejemplo, impuesto al consumo del 8 % o no responsable). Asígnelos a cada producto.</Alerta>
        <Crud tabla="impuestos" titulo="impuesto" orden="porcentaje"
          campos={[{ clave: 'nombre', etiqueta: 'Nombre', requerido: true }, { clave: 'tipo', etiqueta: 'Tipo', tipo: 'select', opciones: [{ valor: 'INC', texto: 'Impuesto al consumo (INC)' }, { valor: 'IVA', texto: 'IVA' }, { valor: 'otro', texto: 'Otro' }], defecto: 'INC', requerido: true },
            { clave: 'porcentaje', etiqueta: 'Porcentaje', tipo: 'numero', requerido: true }, { clave: 'incluido_en_precio', etiqueta: 'Incluido en el precio', tipo: 'booleano', defecto: true, textoCheck: 'El precio de venta ya incluye el impuesto' }]}
          columnas={[{ clave: 'nombre', titulo: 'Impuesto' }, { clave: 'tipo', titulo: 'Tipo' }, { clave: 'porcentaje', titulo: '%', tipo: 'numero' }, { clave: 'incluido_en_precio', titulo: 'Incluido', tipo: 'booleano' }]} /></>}
      {tab === 'categorias' && <Crud tabla="categorias" titulo="categoría" orden="orden" filtro={(c) => c.eq('tipo', 'insumo')} valoresFijos={{ tipo: 'insumo' }} campoActivo="activa"
        campos={[{ clave: 'nombre', etiqueta: 'Nombre', requerido: true }, { clave: 'orden', etiqueta: 'Orden', tipo: 'numero', defecto: 0 }]} columnas={[{ clave: 'nombre', titulo: 'Categoría' }]} />}
      {tab === 'demo' && <Demo />}
    </div>
  );
}

function FormEmpresa({ seccion }) {
  const { recargarEmpresa } = useSesion();
  const aviso = useAviso();
  const [e, setE] = useState(null);
  useEffect(() => { q((sb) => sb.from('config_empresa').select('*').eq('id', 1).single()).then(setE).catch(aviso.error); }, [aviso.error]);
  if (!e) return <Cargando />;
  const S = (k) => ({ value: e[k] ?? '', onChange: (ev) => setE({ ...e, [k]: ev.target.value }) });
  const J = (grupo, k, tipo = 'texto') => ({
    [tipo === 'check' ? 'checked' : 'value']: tipo === 'check' ? !!e[grupo]?.[k] : e[grupo]?.[k] ?? '',
    onChange: (ev) => setE({ ...e, [grupo]: { ...e[grupo], [k]: tipo === 'check' ? ev.target.checked : tipo === 'numero' ? Number(ev.target.value) : ev.target.value } }),
  });
  async function guardar() {
    try {
      const { id, ...resto } = e;
      await q((sb) => sb.from('config_empresa').update({ ...resto, intentos_bloqueo: Number(e.intentos_bloqueo), minutos_bloqueo: Number(e.minutos_bloqueo), actualizado_en: new Date().toISOString() }).eq('id', 1));
      await recargarEmpresa(); aviso.ok('Configuración guardada.');
    } catch (err) { aviso.error(err); }
  }
  async function logo(f) { try { setE({ ...e, logo_url: await subirArchivo('imagenes', f, 'logo') }); } catch (err) { aviso.error(err); } }
  return (
    <div className="tarjeta max-w-4xl p-5">
      {seccion === 'empresa' && <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 sm:col-span-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {e.logo_url ? <img src={e.logo_url} alt="Logo" className="h-20 w-20 rounded-full border border-crema-200 object-contain" /> : <div className="flex h-20 w-20 items-center justify-center rounded-full bg-crema-200 text-xs text-cafe-400">Sin logo</div>}
          <label className="btn-secundario cursor-pointer"><ImagePlus size={15} /> Subir logo<input type="file" accept="image/*" className="hidden" onChange={(ev) => ev.target.files[0] && logo(ev.target.files[0])} /></label>
          {e.logo_url && <button className="btn-fantasma btn-sm" onClick={() => setE({ ...e, logo_url: null })}>Quitar</button>}
        </div>
        <Campo etiqueta="Nombre comercial"><input className="input" {...S('nombre')} /></Campo>
        <Campo etiqueta="Eslogan"><input className="input" {...S('eslogan')} /></Campo>
        <Campo etiqueta="Dirección" className="sm:col-span-2"><input className="input" {...S('direccion')} /></Campo>
        <Campo etiqueta="Ciudad"><input className="input" {...S('ciudad')} /></Campo>
        <Campo etiqueta="Teléfono"><input className="input" {...S('telefono')} /></Campo>
        <Campo etiqueta="WhatsApp"><input className="input" {...S('whatsapp')} /></Campo>
        <Campo etiqueta="Correo"><input type="email" className="input" {...S('correo')} /></Campo>
        <Campo etiqueta="Horarios" className="sm:col-span-2"><input className="input" {...S('horarios')} /></Campo>
        <Campo etiqueta="Mensaje de agradecimiento en el comprobante" className="sm:col-span-2"><input className="input" {...S('mensaje_comprobante')} /></Campo>
        <p className="text-xs text-cafe-400 sm:col-span-2">País: {e.pais} · Moneda: {e.moneda} · Zona horaria: {e.zona_horaria} · Idioma: español</p>
      </div>}
      {seccion === 'tributario' && <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Razón social"><input className="input" {...S('razon_social')} /></Campo>
        <Campo etiqueta="NIT (con dígito de verificación)"><input className="input" {...S('nit')} /></Campo>
        <Campo etiqueta="Régimen"><input className="input" placeholder="Ej.: Responsable de impuesto al consumo / No responsable de IVA" {...S('regimen')} /></Campo>
        <Campo etiqueta="Responsabilidades tributarias (RUT)"><input className="input" placeholder="Códigos del RUT, casilla 53" {...S('responsabilidades_tributarias')} /></Campo>
        <Campo etiqueta="Proveedor tecnológico de facturación electrónica"><input className="input" placeholder="Nombre del proveedor autorizado por la DIAN" {...S('fe_proveedor')} /></Campo>
        <Campo etiqueta="Ambiente"><select className="input" {...S('fe_ambiente')}><option value="pruebas">Habilitación / pruebas</option><option value="produccion">Producción</option></select></Campo>
        <div className="sm:col-span-2"><Alerta tono="azul">La emisión legal de facturas electrónicas se activa al integrar el proveedor tecnológico (sus credenciales se guardan como variables seguras del servidor, nunca aquí). Hasta entonces el sistema solo emite comprobantes internos y registra solicitudes pendientes.</Alerta></div>
      </div>}
      {seccion === 'sistema' && <div className="grid gap-5 sm:grid-cols-2">
        <div><p className="etiqueta">Impresión de comprobantes</p>
          <Campo etiqueta="Formato por defecto"><select className="input" {...J('impresion', 'formato')}><option value="58mm">Térmica 58 mm</option><option value="80mm">Térmica 80 mm</option><option value="carta">Carta / PDF</option></select></Campo>
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" {...J('impresion', 'mostrar_logo', 'check')} /> Mostrar logo en el comprobante</label></div>
        <div><p className="etiqueta">Inventario</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...J('inventario', 'permitir_negativo', 'check')} /> Permitir vender aunque el inventario quede en negativo</label>
          <Campo etiqueta="Avisar vencimientos con días de anticipación" className="mt-2"><input type="number" className="input" {...J('inventario', 'dias_alerta_vencimiento', 'numero')} /></Campo></div>
        <div><p className="etiqueta">Seguridad de inicio de sesión</p>
          <Campo etiqueta="Intentos fallidos antes de bloquear"><input type="number" className="input" {...S('intentos_bloqueo')} /></Campo>
          <Campo etiqueta="Minutos de bloqueo temporal" className="mt-2"><input type="number" className="input" {...S('minutos_bloqueo')} /></Campo></div>
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
      <p className="text-sm text-cafe-600">Si instalaste los datos de demostración para probar el sistema, todo aparece marcado con la etiqueta <b>DEMO</b>. Cuando cargues el menú y el inventario reales, elimínalos aquí.</p>
      <button className="btn-peligro mt-4" onClick={eliminar}><Trash2 size={15} /> Eliminar datos de demostración</button>
    </div>
  );
}

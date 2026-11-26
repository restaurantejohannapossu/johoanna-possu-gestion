'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, Pestanas, TablaDatos, Kpi, Cargando, Vacio, useCarga } from '@/components/ui';
import { GraficoBarras, BarraParticion } from '@/components/graficos';
import Crud from '@/components/Crud';
import { q } from '@/lib/supabase';
import { moneda, hoyISO, inicioMesISO } from '@/lib/formato';

export default function Pagina() { return <Requiere permisos={['gastos.ver']}><Gastos /></Requiere>; }

function Gastos() {
  const { puede } = useSesion();
  const [tab, setTab] = useState('analisis');
  return (
    <div>
      <Encabezado titulo="Gastos" subtitulo="Consulta y análisis de gastos por categoría, sede, usuario y periodo" />
      <Pestanas valor={tab} onCambio={setTab} opciones={[{ id: 'analisis', etiqueta: 'Análisis' }, { id: 'recurrentes', etiqueta: 'Gastos recurrentes' },
        puede('configuracion.gestionar') && { id: 'categorias', etiqueta: 'Categorías' }]} />
      {tab === 'analisis' && <Analisis />}
      {tab === 'recurrentes' && <Recurrentes />}
      {tab === 'categorias' && <Crud tabla="categorias" titulo="categoría de gasto" orden="orden" filtro={(c) => c.eq('tipo', 'gasto')} valoresFijos={{ tipo: 'gasto' }} campoActivo="activa"
        campos={[{ clave: 'nombre', etiqueta: 'Nombre', requerido: true }, { clave: 'orden', etiqueta: 'Orden', tipo: 'numero', defecto: 0 }]}
        columnas={[{ clave: 'nombre', titulo: 'Categoría' }]} />}
    </div>
  );
}

function agrupar(lista, clave) {
  const m = {};
  lista.forEach((g) => { const k = clave(g) || 'Sin dato'; m[k] = (m[k] || 0) + Number(g.valor); });
  return Object.entries(m).map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total);
}

function Analisis() {
  const { sedes } = useSesion();
  const [desde, setDesde] = useState(inicioMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [sede, setSede] = useState('');
  const { datos, cargando } = useCarga(() => q((sb) => {
    let c = sb.from('gastos').select('*, categorias(nombre), sedes(nombre), metodos_pago(nombre), perfiles!gastos_usuario_id_fkey(nombre)')
      .eq('anulado', false).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false });
    if (sede) c = c.eq('sede_id', sede);
    return c;
  }), [desde, hasta, sede]);
  const g = datos || [];
  const porCat = useMemo(() => agrupar(g, (x) => x.categorias?.nombre), [g]);
  const porSede = useMemo(() => agrupar(g, (x) => x.sedes?.nombre), [g]);
  const porUsuario = useMemo(() => agrupar(g, (x) => x.perfiles?.nombre), [g]);
  const porOrigen = useMemo(() => agrupar(g, (x) => (x.origen === 'caja' ? 'Caja (efectivo)' : x.metodos_pago?.nombre || 'Banco / otro')), [g]);
  const total = g.reduce((s, x) => s + Number(x.valor), 0);
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <input type="date" className="input w-auto" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input type="date" className="input w-auto" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <select className="input w-auto" value={sede} onChange={(e) => setSede(e.target.value)}><option value="">Todas mis sedes</option>{sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
      </div>
      {cargando ? <Cargando /> : <>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi titulo="Total gastos" valor={moneda(total)} tono="rojo" /><Kpi titulo="Registros" valor={g.length} tono="cafe" />
          <Kpi titulo="Mayor categoría" valor={porCat[0]?.nombre || '—'} detalle={porCat[0] ? moneda(porCat[0].total) : null} tono="dorado" />
          <Kpi titulo="Pagos a proveedores" valor={moneda(g.filter((x) => x.compra_id).reduce((s, x) => s + Number(x.valor), 0))} />
        </div>
        <div className="mb-5 grid gap-5 lg:grid-cols-2">
          <div className="tarjeta p-4"><h3 className="mb-3 font-bold">Por categoría</h3>{porCat.length ? <GraficoBarras datos={porCat} categoria="nombre" valor="total" /> : <Vacio />}</div>
          <div className="tarjeta space-y-6 p-4">
            <div><h3 className="mb-3 font-bold">Por medio de pago</h3>{porOrigen.length ? <BarraParticion datos={porOrigen} etiqueta="nombre" valor="total" /> : <Vacio />}</div>
            {porSede.length > 1 && <div><h3 className="mb-3 font-bold">Por sede</h3><BarraParticion datos={porSede} etiqueta="nombre" valor="total" /></div>}
            <div><h3 className="mb-3 font-bold">Por usuario</h3>{porUsuario.length ? <BarraParticion datos={porUsuario} etiqueta="nombre" valor="total" /> : <Vacio />}</div>
          </div>
        </div>
        <TablaDatos filas={g} exportar="Gastos" subtitulo={`${desde} a ${hasta}`} columnas={[
          { clave: 'numero', titulo: 'N.º' }, { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
          { clave: 'sede', titulo: 'Sede', render: (f) => f.sedes?.nombre, exportar: (f) => f.sedes?.nombre },
          { clave: 'categoria', titulo: 'Categoría', render: (f) => f.categorias?.nombre, exportar: (f) => f.categorias?.nombre },
          { clave: 'descripcion', titulo: 'Descripción' }, { clave: 'beneficiario', titulo: 'Beneficiario' },
          { clave: 'usuario', titulo: 'Usuario', render: (f) => f.perfiles?.nombre, exportar: (f) => f.perfiles?.nombre },
          { clave: 'valor', titulo: 'Valor', tipo: 'moneda' },
        ]} />
      </>}
    </>
  );
}

function Recurrentes() {
  const { sedeId, puede } = useSesion();
  const [cats, setCats] = useState(null);
  useEffect(() => { q((sb) => sb.from('categorias').select('id,nombre').eq('tipo', 'gasto').order('orden')).then(setCats); }, []);
  if (!cats) return <Cargando />;
  return (
    <Crud tabla="gastos_recurrentes" titulo="gasto recurrente" orden="proxima_fecha" filtro={(c) => c.eq('sede_id', sedeId)} valoresFijos={{ sede_id: sedeId }} deps={[sedeId]}
      puedeEditar={puede('gastos.registrar')} select="*, categorias(nombre)"
      campos={[
        { clave: 'descripcion', etiqueta: 'Descripción', requerido: true, ancho: 'sm:col-span-2' },
        { clave: 'categoria_id', etiqueta: 'Categoría', tipo: 'select', opciones: cats.map((c) => ({ valor: c.id, texto: c.nombre })) },
        { clave: 'valor', etiqueta: 'Valor', tipo: 'numero', requerido: true },
        { clave: 'frecuencia', etiqueta: 'Frecuencia', tipo: 'select', requerido: true, defecto: 'mensual', opciones: [{ valor: 'semanal', texto: 'Semanal' }, { valor: 'quincenal', texto: 'Quincenal' }, { valor: 'mensual', texto: 'Mensual' }] },
        { clave: 'proxima_fecha', etiqueta: 'Próximo pago', tipo: 'fecha', requerido: true },
        { clave: 'beneficiario', etiqueta: 'Beneficiario' },
      ]}
      columnas={[
        { clave: 'descripcion', titulo: 'Gasto' }, { clave: 'categoria', titulo: 'Categoría', render: (f) => f.categorias?.nombre },
        { clave: 'frecuencia', titulo: 'Frecuencia' }, { clave: 'proxima_fecha', titulo: 'Próximo pago', tipo: 'fecha' }, { clave: 'valor', titulo: 'Valor', tipo: 'moneda' },
      ]} />
  );
}

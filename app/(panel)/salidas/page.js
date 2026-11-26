'use client';
import { useState } from 'react';
import { Plus, Ban, Paperclip, CalendarClock } from 'lucide-react';
import { useSesion, Requiere } from '@/components/sesion';
import { Encabezado, TablaDatos, Kpi, Chip, Alerta, useAviso, useConfirmar, useCarga } from '@/components/ui';
import FormGasto from '@/components/FormGasto';
import { q, rpc } from '@/lib/supabase';
import { abrirSoporte } from '@/lib/archivos';
import { moneda, fecha, hoyISO } from '@/lib/formato';

export default function Pagina() { return <Requiere permisos={['gastos.registrar']}><Salidas /></Requiere>; }

function Salidas() {
  const { sedeId, puede } = useSesion();
  const aviso = useAviso();
  const confirmar = useConfirmar();
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [form, setForm] = useState(null);
  const { datos, cargando, recargar } = useCarga(() => q((sb) => sb.from('gastos').select('*, categorias(nombre), metodos_pago(nombre), perfiles!gastos_usuario_id_fkey(nombre)')
    .eq('sede_id', sedeId).gte('fecha', desde).lte('fecha', hasta).order('creado_en', { ascending: false })), [sedeId, desde, hasta]);
  const { datos: pendientes, recargar: recargarRec } = useCarga(() => (puede('gastos.ver')
    ? q((sb) => sb.from('gastos_recurrentes').select('*, categorias(nombre)').eq('sede_id', sedeId).eq('activo', true).lte('proxima_fecha', hoyISO(5)).order('proxima_fecha'))
    : Promise.resolve([])), [sedeId]);
  async function anular(g) {
    const r = await confirmar({ titulo: `Anular salida #${g.numero}`, mensaje: g.origen === 'caja' ? 'Si la caja sigue abierta, el dinero se reintegra a la caja automáticamente.' : null, pedirMotivo: true, peligro: true, textoBoton: 'Anular' });
    if (!r.ok) return;
    try { await rpc('anular_gasto', { p_id: g.id, p_motivo: r.motivo }); recargar(); aviso.ok('Salida anulada.'); } catch (e) { aviso.error(e); }
  }
  const activos = (datos || []).filter((g) => !g.anulado);
  return (
    <div>
      <Encabezado titulo="Salidas de dinero" subtitulo="Cada salida queda numerada, documentada y auditada">
        <button className="btn-primario" onClick={() => setForm({})}><Plus size={16} /> Registrar salida</button>
      </Encabezado>
      {pendientes?.length > 0 && (
        <Alerta>
          <p className="mb-2 font-semibold">Gastos recurrentes por pagar</p>
          <div className="flex flex-wrap gap-2">
            {pendientes.map((r) => (
              <button key={r.id} className="btn-secundario btn-sm" onClick={() => setForm({ recurrente_id: r.id, categoria_id: r.categoria_id || '', descripcion: r.descripcion, valor: r.valor, beneficiario: r.beneficiario || '', origen: 'banco' })}>
                <CalendarClock size={13} /> {r.descripcion} · {moneda(r.valor)} · {fecha(r.proxima_fecha)}
              </button>
            ))}
          </div>
        </Alerta>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi titulo="Total salidas" valor={moneda(activos.reduce((s, g) => s + Number(g.valor), 0))} tono="rojo" />
        <Kpi titulo="Desde caja" valor={moneda(activos.filter((g) => g.origen === 'caja').reduce((s, g) => s + Number(g.valor), 0))} tono="dorado" />
        <Kpi titulo="Desde banco u otros" valor={moneda(activos.filter((g) => g.origen !== 'caja').reduce((s, g) => s + Number(g.valor), 0))} tono="cafe" />
      </div>
      <div className="mb-3 flex gap-2">
        <input type="date" className="input w-auto" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input type="date" className="input w-auto" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </div>
      <TablaDatos cargando={cargando} filas={datos || []} exportar="Salidas de dinero" subtitulo={`${desde} a ${hasta}`} columnas={[
        { clave: 'numero', titulo: 'N.º' }, { clave: 'creado_en', titulo: 'Fecha y hora', tipo: 'fechahora' },
        { clave: 'categoria', titulo: 'Categoría', render: (f) => f.categorias?.nombre, exportar: (f) => f.categorias?.nombre },
        { clave: 'descripcion', titulo: 'Descripción', render: (f) => <span className={f.anulado ? 'line-through text-cafe-300' : ''}>{f.descripcion}{f.anulado && <span className="block text-xs text-red-700 no-underline">Anulada: {f.motivo_anulacion}</span>}</span> },
        { clave: 'beneficiario', titulo: 'Beneficiario' },
        { clave: 'origen', titulo: 'Origen', render: (f) => <Chip color={f.origen === 'caja' ? 'amarillo' : 'azul'}>{f.origen === 'caja' ? 'Caja' : f.metodos_pago?.nombre || 'Banco'}</Chip>, exportar: (f) => f.origen },
        { clave: 'usuario', titulo: 'Usuario', render: (f) => f.perfiles?.nombre, exportar: (f) => f.perfiles?.nombre },
        { clave: 'valor', titulo: 'Valor', tipo: 'moneda' },
      ]} acciones={(f) => (
        <div className="flex justify-end gap-1">
          {f.adjunto_url && <button className="btn-secundario btn-sm" onClick={() => abrirSoporte(f.adjunto_url).catch(aviso.error)}><Paperclip size={13} /></button>}
          {!f.anulado && puede('gastos.anular') && <button className="btn-secundario btn-sm text-red-700" onClick={() => anular(f)} title="Anular"><Ban size={13} /></button>}
        </div>
      )} />
      {form && <FormGasto sedeId={sedeId} inicial={form} onCerrar={() => setForm(null)} onListo={() => { setForm(null); recargar(); recargarRec(); }} />}
    </div>
  );
}

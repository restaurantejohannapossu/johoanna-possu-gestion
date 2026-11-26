'use client';
import { useEffect, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { Modal, Campo, useAviso } from './ui';
import { q, rpc } from '@/lib/supabase';
import { subirArchivo } from '@/lib/archivos';
import { hoyISO } from '@/lib/formato';

export default function FormGasto({ sedeId, inicial, onCerrar, onListo }) {
  const aviso = useAviso();
  const [aux, setAux] = useState({ categorias: [], metodos: [], proveedores: [] });
  const [g, setG] = useState({ fecha: hoyISO(), categoria_id: '', descripcion: '', valor: '', origen: 'caja', metodo_id: '', beneficiario: '', proveedor_id: '', adjunto_url: '', observaciones: '', ...inicial });
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    Promise.all([
      q((sb) => sb.from('categorias').select('id,nombre').eq('tipo', 'gasto').eq('activa', true).order('orden')),
      q((sb) => sb.from('metodos_pago').select('*').eq('activo', true).order('orden')),
      q((sb) => sb.from('proveedores').select('id,nombre').eq('activo', true).order('nombre')).catch(() => []),
    ]).then(([categorias, metodos, proveedores]) => setAux({ categorias, metodos, proveedores }));
  }, []);
  async function guardar() {
    setEnviando(true);
    try {
      await rpc('registrar_gasto', { p: { ...g, sede_id: sedeId, valor: Number(g.valor), metodo_id: g.origen === 'caja' ? null : g.metodo_id || null } });
      aviso.ok(g.origen === 'caja' ? 'Salida registrada y descontada de tu caja.' : 'Salida registrada.'); onListo();
    } catch (e) { aviso.error(e); } finally { setEnviando(false); }
  }
  async function adjuntar(f) { try { setG({ ...g, adjunto_url: await subirArchivo('soportes', f, 'gastos') }); } catch (e) { aviso.error(e); } }
  const S = (k) => ({ value: g[k] ?? '', onChange: (e) => setG({ ...g, [k]: e.target.value }) });
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Registrar salida de dinero" ancho="max-w-2xl"
      pie={<><button className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={enviando || !(Number(g.valor) > 0) || !g.descripcion.trim()} onClick={guardar}>Registrar salida</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Valor *"><input type="number" className="input text-lg font-bold" autoFocus {...S('valor')} /></Campo>
        <Campo etiqueta="Fecha"><input type="date" className="input" {...S('fecha')} /></Campo>
        <Campo etiqueta="Categoría"><select className="input" {...S('categoria_id')}><option value="">—</option>{aux.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
        <Campo etiqueta="Sale de *"><select className="input" {...S('origen')}>
          <option value="caja">Mi caja (efectivo)</option><option value="banco">Banco / transferencia (no afecta caja)</option><option value="otro">Otro (no afecta caja)</option></select></Campo>
        {g.origen !== 'caja' && <Campo etiqueta="Medio de pago"><select className="input" {...S('metodo_id')}><option value="">—</option>{aux.metodos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></Campo>}
        <Campo etiqueta="Descripción *" className="sm:col-span-2"><input className="input" placeholder="Ej.: pipeta de gas, pago de luz, transporte al mercado" {...S('descripcion')} /></Campo>
        <Campo etiqueta="Beneficiario (a quién se le pagó)"><input className="input" {...S('beneficiario')} /></Campo>
        <Campo etiqueta="Proveedor (si aplica)"><select className="input" {...S('proveedor_id')}><option value="">—</option>{aux.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>
        <Campo etiqueta="Observaciones" className="sm:col-span-2"><input className="input" {...S('observaciones')} /></Campo>
      </div>
      <label className="btn-secundario mt-3 cursor-pointer"><Paperclip size={15} /> {g.adjunto_url ? 'Soporte adjuntado ✓' : 'Adjuntar soporte (foto o PDF)'}
        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files[0] && adjuntar(e.target.files[0])} /></label>
    </Modal>
  );
}

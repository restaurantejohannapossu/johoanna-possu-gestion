'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Download, FileText, Printer, Loader2, Inbox, CheckCircle2, AlertTriangle } from 'lucide-react';
import { mensajeError } from '@/lib/errores';
import { exportarCSV, exportarExcel, exportarPDF, imprimirTabla } from '@/lib/exportar';
import { moneda, numero, fecha, fechaHora, etiqueta } from '@/lib/formato';

// ---------------------------------------------------------------- Avisos
const AvisoCtx = createContext(null);
export function useAviso() { return useContext(AvisoCtx); }

// ---------------------------------------------------------------- Confirmación
const ConfirmarCtx = createContext(null);
export function useConfirmar() { return useContext(ConfirmarCtx); }

export function ProveedorUI({ children }) {
  const [avisos, setAvisos] = useState([]);
  const [conf, setConf] = useState(null);
  const [motivo, setMotivo] = useState('');
  const resolver = useRef(null);

  const agregar = useCallback((tipo, texto) => {
    const id = Math.random().toString(36).slice(2);
    setAvisos((a) => [...a, { id, tipo, texto }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'error' ? 7000 : 3500);
  }, []);
  const aviso = useMemo(() => ({
    ok: (t) => agregar('ok', t),
    error: (e) => agregar('error', typeof e === 'string' ? e : mensajeError(e)),
  }), [agregar]);

  const confirmar = useCallback((opciones) => new Promise((res) => {
    resolver.current = res; setMotivo(''); setConf(opciones);
  }), []);
  const cerrarConf = (ok) => {
    if (ok && conf?.pedirMotivo && !motivo.trim()) return;
    resolver.current?.({ ok, motivo: motivo.trim() }); setConf(null);
  };

  return (
    <AvisoCtx.Provider value={aviso}>
      <ConfirmarCtx.Provider value={confirmar}>
        {children}
        <div className="no-imprimir fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2">
          {avisos.map((a) => (
            <div key={a.id} className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm shadow-lg ${a.tipo === 'error' ? 'bg-red-700 text-white' : 'bg-cafe-800 text-crema-100'}`}>
              {a.tipo === 'error' ? <AlertTriangle size={18} className="shrink-0" /> : <CheckCircle2 size={18} className="shrink-0 text-dorado-300" />}
              <span>{a.texto}</span>
            </div>
          ))}
        </div>
        <Modal abierto={!!conf} onCerrar={() => cerrarConf(false)} titulo={conf?.titulo || 'Confirmar'}
          pie={<>
            <button className="btn-secundario" onClick={() => cerrarConf(false)}>Volver</button>
            <button className={conf?.peligro ? 'btn-peligro' : 'btn-primario'} disabled={conf?.pedirMotivo && !motivo.trim()} onClick={() => cerrarConf(true)}>
              {conf?.textoBoton || 'Confirmar'}
            </button>
          </>}>
          {conf?.mensaje && <p className="text-sm text-cafe-600">{conf.mensaje}</p>}
          {conf?.pedirMotivo && (
            <Campo etiqueta={conf.etiquetaMotivo || 'Motivo (obligatorio)'} className="mt-3">
              <textarea className="input" rows={3} value={motivo} autoFocus onChange={(e) => setMotivo(e.target.value)} />
            </Campo>
          )}
        </Modal>
      </ConfirmarCtx.Provider>
    </AvisoCtx.Provider>
  );
}

// ---------------------------------------------------------------- Básicos
export function Modal({ abierto, onCerrar, titulo, children, pie, ancho = 'max-w-lg' }) {
  useEffect(() => {
    if (!abierto) return;
    const f = (e) => e.key === 'Escape' && onCerrar?.();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [abierto, onCerrar]);
  if (!abierto) return null;
  return (
    <div className="no-imprimir fixed inset-0 z-50 flex items-end justify-center bg-cafe-900/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onCerrar?.()}>
      <div className={`flex max-h-[94vh] w-full ${ancho} flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`}>
        <div className="flex items-center justify-between border-b border-crema-200 px-5 py-3">
          <h3 className="text-lg font-bold">{titulo}</h3>
          <button className="btn-fantasma btn-sm" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {pie && <div className="flex flex-wrap justify-end gap-2 border-t border-crema-200 px-5 py-3">{pie}</div>}
      </div>
    </div>
  );
}

export function Campo({ etiqueta: et, children, ayuda, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {et && <span className="etiqueta">{et}</span>}
      {children}
      {ayuda && <span className="mt-1 block text-xs text-cafe-400">{ayuda}</span>}
    </label>
  );
}

export function Cargando({ texto = 'Cargando…' }) {
  return <div className="flex items-center justify-center gap-2 py-10 text-cafe-400"><Loader2 className="animate-spin" size={20} /> {texto}</div>;
}

export function Vacio({ texto = 'No hay registros todavía.', children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-cafe-400">
      <Inbox size={32} /> <p className="text-sm">{texto}</p>{children}
    </div>
  );
}

const COLORES = {
  verde: 'bg-emerald-100 text-emerald-800', rojo: 'bg-red-100 text-red-800', amarillo: 'bg-dorado-100 text-dorado-700',
  azul: 'bg-sky-100 text-sky-800', gris: 'bg-crema-200 text-cafe-600', vino: 'bg-vino-100 text-vino-800', morado: 'bg-violet-100 text-violet-800',
};
const COLOR_ESTADO = {
  pendiente: 'amarillo', en_preparacion: 'azul', listo: 'verde', entregado: 'gris', cancelado: 'rojo',
  abierto: 'amarillo', parcial: 'morado', pagado: 'verde', anulado: 'rojo', recibido: 'amarillo', en_camino: 'azul',
  libre: 'verde', ocupada: 'vino', reservada: 'amarillo', solicitud: 'amarillo', aprobada: 'azul', despachada: 'morado',
  recibida: 'verde', rechazada: 'rojo', cancelada: 'rojo', pagada: 'verde', borrador: 'amarillo', aplicado: 'verde',
  abierta: 'verde', cerrada: 'gris', activo: 'verde', inactivo: 'gris',
};
export function Chip({ color = 'gris', children }) { return <span className={`chip ${COLORES[color] || COLORES.gris}`}>{children}</span>; }
export function Estado({ valor }) { return <Chip color={COLOR_ESTADO[valor] || 'gris'}>{etiqueta(valor)}</Chip>; }

export function Encabezado({ titulo, subtitulo, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-cafe-400">{subtitulo}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Pestanas({ opciones, valor, onCambio }) {
  return (
    <div className="no-imprimir mb-4 flex gap-1 overflow-x-auto rounded-xl bg-crema-200 p-1">
      {opciones.filter(Boolean).map((o) => (
        <button key={o.id} onClick={() => onCambio(o.id)}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition ${valor === o.id ? 'bg-white text-vino-700 shadow' : 'text-cafe-500 hover:text-cafe-700'}`}>
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

export function Kpi({ titulo, valor, detalle, icono: Icono, tono = 'vino' }) {
  const tonos = { vino: 'bg-vino-50 text-vino-700', dorado: 'bg-dorado-50 text-dorado-600', cafe: 'bg-crema-200 text-cafe-600', rojo: 'bg-red-50 text-red-700', verde: 'bg-emerald-50 text-emerald-700' };
  return (
    <div className="tarjeta p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-cafe-400">{titulo}</p>
        {Icono && <span className={`rounded-lg p-1.5 ${tonos[tono]}`}><Icono size={16} /></span>}
      </div>
      <p className="mt-2 font-titulo text-2xl font-bold text-cafe-800">{valor}</p>
      {detalle && <p className="mt-1 text-xs text-cafe-400">{detalle}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Valores formateados
export function formatear(v, tipo) {
  if (v === null || v === undefined || v === '') return '—';
  switch (tipo) {
    case 'moneda': return moneda(v);
    case 'numero': return numero(v);
    case 'porcentaje': return `${numero(v, 1)} %`;
    case 'fecha': return fecha(v);
    case 'fechahora': return fechaHora(v);
    case 'etiqueta': return etiqueta(v);
    case 'booleano': return v ? 'Sí' : 'No';
    default: return String(v);
  }
}

// ---------------------------------------------------------------- Tabla de datos
export function TablaDatos({ columnas, filas, cargando, buscar = true, exportar, subtitulo, acciones, vacio, onFila, pie, claveFila = 'id' }) {
  const [texto, setTexto] = useState('');
  const visibles = useMemo(() => {
    if (!texto.trim()) return filas || [];
    const t = texto.toLowerCase();
    return (filas || []).filter((f) => columnas.some((c) => String(c.valorBusqueda ? c.valorBusqueda(f) : f[c.clave] ?? '').toLowerCase().includes(t)));
  }, [filas, texto, columnas]);
  const colsExport = columnas.filter((c) => !c.sinExportar).map((c) => ({ clave: c.clave, titulo: c.titulo, tipo: c.tipo === 'fechahora' ? 'texto' : c.tipo }));
  const filasExport = visibles.map((f) => Object.fromEntries(columnas.map((c) => [c.clave, c.exportar ? c.exportar(f) : c.tipo === 'fechahora' ? fechaHora(f[c.clave]) : c.tipo === 'etiqueta' ? etiqueta(f[c.clave]) : f[c.clave]])));
  return (
    <div className="tarjeta overflow-hidden">
      {(buscar || exportar) && (
        <div className="no-imprimir flex flex-wrap items-center gap-2 border-b border-crema-200 p-3">
          {buscar && (
            <div className="relative min-w-[200px] flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cafe-300" />
              <input className="input pl-9" placeholder="Buscar…" value={texto} onChange={(e) => setTexto(e.target.value)} />
            </div>
          )}
          {exportar && (
            <div className="flex flex-wrap gap-1">
              <button className="btn-secundario btn-sm" onClick={() => exportarExcel(exportar, colsExport, filasExport)}><Download size={14} /> Excel</button>
              <button className="btn-secundario btn-sm" onClick={() => exportarCSV(exportar, colsExport, filasExport)}><Download size={14} /> CSV</button>
              <button className="btn-secundario btn-sm" onClick={() => exportarPDF(exportar, colsExport, filasExport, { subtitulo })}><FileText size={14} /> PDF</button>
              <button className="btn-secundario btn-sm" onClick={() => imprimirTabla(exportar, colsExport, filasExport, { subtitulo })}><Printer size={14} /> Imprimir</button>
            </div>
          )}
        </div>
      )}
      {cargando ? <Cargando /> : visibles.length === 0 ? <Vacio texto={vacio} /> : (
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead><tr>
              {columnas.map((c) => <th key={c.clave} className={['moneda', 'numero', 'porcentaje'].includes(c.tipo) ? 'text-right' : ''}>{c.titulo}</th>)}
              {acciones && <th className="no-imprimir text-right">Acciones</th>}
            </tr></thead>
            <tbody>
              {visibles.map((f, i) => (
                <tr key={f[claveFila] ?? i} className={onFila ? 'cursor-pointer' : ''} onClick={onFila ? () => onFila(f) : undefined}>
                  {columnas.map((c) => (
                    <td key={c.clave} className={`${['moneda', 'numero', 'porcentaje'].includes(c.tipo) ? 'whitespace-nowrap text-right tabular-nums' : ''} ${c.className || ''}`}>
                      {c.render ? c.render(f) : c.tipo === 'estado' ? <Estado valor={f[c.clave]} /> : formatear(f[c.clave], c.tipo)}
                    </td>
                  ))}
                  {acciones && <td className="no-imprimir whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>{acciones(f)}</td>}
                </tr>
              ))}
            </tbody>
            {pie}
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Hook de carga
export function useCarga(fn, deps = []) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const ref = useRef(fn); ref.current = fn;
  const recargar = useCallback(async () => {
    setCargando(true); setError(null);
    try { setDatos(await ref.current()); } catch (e) { setError(mensajeError(e)); } finally { setCargando(false); }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { recargar(); }, deps);
  return { datos, cargando, error, recargar, setDatos };
}

export function Alerta({ children, tono = 'amarillo' }) {
  const t = { amarillo: 'border-dorado-200 bg-dorado-50 text-dorado-700', rojo: 'border-red-200 bg-red-50 text-red-800', azul: 'border-sky-200 bg-sky-50 text-sky-800' };
  return <div className={`mb-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${t[tono]}`}><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div>{children}</div></div>;
}

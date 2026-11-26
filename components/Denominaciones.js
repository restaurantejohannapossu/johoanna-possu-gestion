'use client';
import { moneda } from '@/lib/formato';

export const DENOMINACIONES = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50];
export const totalDenominaciones = (d) => Object.entries(d || {}).reduce((s, [k, v]) => s + Number(k) * Number(v || 0), 0);

/** Conteo de dinero por billetes y monedas */
export default function Denominaciones({ valor, onCambio }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {DENOMINACIONES.map((d) => (
          <label key={d} className="flex items-center gap-2 rounded-lg border border-crema-200 px-2 py-1.5">
            <span className={`w-16 text-xs font-semibold ${d >= 2000 ? 'text-emerald-700' : 'text-dorado-700'}`}>{moneda(d)}</span>
            <span className="text-xs text-cafe-300">×</span>
            <input type="number" min="0" inputMode="numeric" className="w-full rounded border border-crema-200 px-2 py-1 text-right text-sm"
              value={valor?.[d] ?? ''} onChange={(e) => onCambio({ ...valor, [d]: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })} />
          </label>
        ))}
      </div>
      <p className="mt-2 text-right text-sm">Total contado: <b className="font-titulo text-lg">{moneda(totalDenominaciones(valor))}</b></p>
    </div>
  );
}

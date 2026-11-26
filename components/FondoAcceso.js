'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function FondoAcceso({ titulo, children }) {
  const [empresa, setEmpresa] = useState(null);
  const [negocios, setNegocios] = useState([]);
  useEffect(() => {
    document.documentElement.dataset.tema = 'restaurante';
    try {
      supabase().from('config_empresa').select('nombre,eslogan,logo_url').eq('id', 1).single().then(({ data }) => setEmpresa(data));
      supabase().from('negocios').select('id,nombre,logo_url').eq('activo', true).order('orden').then(({ data }) => setNegocios(data || []));
    } catch { /* */ }
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-vino-800 via-vino-700 to-cafe-800 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          {empresa?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={empresa.logo_url} alt="" className="mx-auto h-20 w-20 rounded-full bg-white object-contain p-1 shadow-lg" />
          ) : (
            <div className="flex justify-center -space-x-4">
              {(negocios.length ? negocios : [{ id: 'r', logo_url: '/logos/restaurante.jpg' }]).map((n) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={n.id} src={n.logo_url || '/logos/restaurante.jpg'} alt={n.nombre || ''} title={n.nombre} className="h-20 w-20 rounded-full bg-white object-contain p-0.5 shadow-lg ring-4 ring-vino-800" />
              ))}
            </div>
          )}
          <p className="mt-4 font-titulo text-2xl font-bold text-white">{empresa?.nombre || 'Negocios Johoanna Possu'}</p>
          {empresa?.eslogan && <p className="text-sm text-dorado-200">{empresa.eslogan}</p>}
        </div>
        <div className="rounded-2xl border border-dorado-400/30 bg-crema-50 p-7 shadow-2xl">
          <h1 className="mb-1 text-2xl font-bold text-vino-700">{titulo}</h1>
          <div className="mb-5 h-1 w-12 rounded bg-dorado-400" />
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-white/70">Villa Rica, Cauca</p>
        <p className="mt-1 text-center text-[11px] text-white/50">Desarrollado por Bryan Possu</p>
      </div>
    </div>
  );
}

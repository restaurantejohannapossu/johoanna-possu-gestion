'use client';
import { useEffect, useState } from 'react';
import { Marca } from './AppShell';
import { supabase } from '@/lib/supabase';

export default function FondoAcceso({ titulo, children }) {
  const [empresa, setEmpresa] = useState(null);
  useEffect(() => {
    try { supabase().from('config_empresa').select('nombre,eslogan,logo_url,direccion').eq('id', 1).single().then(({ data }) => setEmpresa(data)); } catch { /* */ }
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-vino-800 via-vino-700 to-cafe-800 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><Marca empresa={empresa} claro /></div>
        <div className="rounded-2xl border border-dorado-400/30 bg-crema-50 p-7 shadow-2xl">
          <h1 className="mb-1 text-2xl font-bold text-vino-700">{titulo}</h1>
          <div className="mb-5 h-1 w-12 rounded bg-dorado-400" />
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-crema-200/80">{empresa?.direccion || 'Villa Rica, Cauca — Referencia: Bomba Texaco'}</p>
        <p className="mt-1 text-center text-[11px] text-crema-200/60">Desarrollado por Bryan Possu</p>
      </div>
    </div>
  );
}

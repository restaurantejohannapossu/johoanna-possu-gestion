'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const SesionCtx = createContext(null);
export function useSesion() { return useContext(SesionCtx); }

export function ProveedorSesion({ children }) {
  const router = useRouter();
  const [perfil, setPerfil] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [sedeId, setSedeId] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const sb = supabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const [{ data: p, error: e1 }, { data: emp }] = await Promise.all([
        sb.rpc('mi_sesion'),
        sb.from('config_empresa').select('*').eq('id', 1).single(),
      ]);
      if (e1) throw e1;
      if (!p || !p.activo) {
        await sb.auth.signOut();
        router.replace('/login?motivo=sin-perfil');
        return;
      }
      setPerfil(p); setEmpresa(emp);
      const guardada = typeof window !== 'undefined' ? localStorage.getItem('sede_activa') : null;
      const ids = (p.sedes || []).map((s) => s.id);
      setSedeId(ids.includes(guardada) ? guardada : (ids.includes(p.sede_principal_id) ? p.sede_principal_id : ids[0] || null));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setCargando(false);
    }
  }, [router]);

  useEffect(() => {
    cargar();
    let sub;
    try {
      sub = supabase().auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT') router.replace('/login'); }).data.subscription;
    } catch { /* sin configuración */ }
    return () => sub?.unsubscribe();
  }, [cargar, router]);

  const valor = useMemo(() => {
    const permisos = new Set(perfil?.permisos || []);
    const puede = (...lista) => perfil?.superadmin || lista.some((p) => permisos.has(p));
    return {
      perfil, empresa, cargando, error, puede,
      sedes: perfil?.sedes || [],
      sedeId,
      sede: (perfil?.sedes || []).find((s) => s.id === sedeId) || null,
      cambiarSede: (id) => { setSedeId(id); try { localStorage.setItem('sede_activa', id); } catch { /* */ } },
      recargarEmpresa: async () => { const { data } = await supabase().from('config_empresa').select('*').eq('id', 1).single(); setEmpresa(data); },
      recargarPerfil: cargar,
      salir: async () => {
        try { await supabase().rpc('registrar_cierre_sesion'); } catch { /* */ }
        await supabase().auth.signOut();
        router.replace('/login');
      },
    };
  }, [perfil, empresa, cargando, error, sedeId, cargar, router]);

  return <SesionCtx.Provider value={valor}>{children}</SesionCtx.Provider>;
}

/** Bloquea una página si el usuario no tiene alguno de los permisos indicados. */
export function Requiere({ permisos, children }) {
  const { puede, cargando } = useSesion();
  if (cargando) return null;
  if (!puede(...permisos)) {
    return (
      <div className="tarjeta mx-auto mt-10 max-w-md p-8 text-center">
        <h2 className="text-xl font-bold">Acceso restringido</h2>
        <p className="mt-2 text-sm text-cafe-400">Tu usuario no tiene permiso para ver este módulo. Pide acceso al administrador.</p>
      </div>
    );
  }
  return children;
}

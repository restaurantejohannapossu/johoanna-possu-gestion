'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, negocioGuardado, cambiarNegocio } from '@/lib/supabase';
import { fijarNombreReportes } from '@/lib/exportar';

const SesionCtx = createContext(null);
export function useSesion() { return useContext(SesionCtx); }

export function ProveedorSesion({ children }) {
  const router = useRouter();
  const [perfil, setPerfil] = useState(null);
  const [empresa, setEmpresa] = useState(null);   // configuración general (grupo de negocios)
  const [negocioId, setNegocioId] = useState(null);
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
      const negocios = p.negocios || [];
      let neg = negocioGuardado();
      if (neg && !negocios.some((n) => n.id === neg)) { cambiarNegocio(null, '/'); return; }
      // Quien solo tiene un negocio entra directo a él
      if (!neg && negocios.length === 1) { cambiarNegocio(negocios[0].id, '/dashboard'); return; }
      setPerfil(p); setEmpresa(emp); setNegocioId(neg);
      const ids = (p.sedes || []).filter((s) => s.negocio_id === neg).map((s) => s.id);
      const guardada = typeof window !== 'undefined' ? localStorage.getItem('sede_activa') : null;
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

  const negocio = (perfil?.negocios || []).find((n) => n.id === negocioId) || null;

  // Tema de colores del negocio activo
  useEffect(() => {
    document.documentElement.dataset.tema = negocio?.tema || 'restaurante';
    fijarNombreReportes(negocio?.nombre || empresa?.nombre);
  }, [negocio?.tema, negocio?.nombre, empresa?.nombre]);

  const valor = useMemo(() => {
    const permisos = new Set(perfil?.permisos || []);
    const puede = (...lista) => perfil?.superadmin || lista.some((p) => permisos.has(p));
    const sedes = (perfil?.sedes || []).filter((s) => s.negocio_id === negocioId);
    return {
      perfil, empresa, negocio, negocioId, cargando, error, puede,
      negocios: perfil?.negocios || [],
      modoGeneral: !negocioId,
      /** ¿El negocio activo usa este módulo? (mesas, cocina, recetas, domicilios, variantes, presentaciones, cuentas) */
      usaModulo: (m) => !!negocio && negocio.modulos?.[m] !== false,
      sedes,
      sedeId,
      sede: sedes.find((s) => s.id === sedeId) || null,
      cambiarSede: (id) => { setSedeId(id); try { localStorage.setItem('sede_activa', id); } catch { /* */ } },
      entrarNegocio: (id, destino = '/dashboard') => cambiarNegocio(id, destino),
      irPanelGeneral: () => cambiarNegocio(null, '/'),
      recargarEmpresa: cargar,
      recargarPerfil: cargar,
      salir: async () => {
        try { await supabase().rpc('registrar_cierre_sesion'); } catch { /* */ }
        try { localStorage.removeItem('negocio_activo'); localStorage.removeItem('sede_activa'); } catch { /* */ }
        await supabase().auth.signOut();
        window.location.href = '/login';
      },
    };
  }, [perfil, empresa, negocio, negocioId, cargando, error, sedeId, cargar]);

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

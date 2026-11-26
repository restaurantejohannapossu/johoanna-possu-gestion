'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, User, Loader2 } from 'lucide-react';
import FondoAcceso from '@/components/FondoAcceso';
import { supabase } from '@/lib/supabase';
import { mensajeError } from '@/lib/errores';

export default function Login() {
  const router = useRouter();
  const [id, setId] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('motivo') === 'sin-perfil') {
      setError('Tu cuenta no tiene acceso activo al sistema. Contacta al administrador.');
    }
  }, []);

  async function entrar(e) {
    e.preventDefault();
    setError(''); setEnviando(true);
    const sb = supabase();
    try {
      const { data: correo, error: e1 } = await sb.rpc('email_para_login', { p_identificador: id.trim() });
      if (e1) throw e1;
      if (!correo) throw new Error('Usuario o contraseña incorrectos.');
      const { error: e2 } = await sb.auth.signInWithPassword({ email: correo, password: clave });
      if (e2) {
        await sb.rpc('registrar_intento_fallido', { p_identificador: id.trim() });
        throw e2;
      }
      const { error: e3 } = await sb.rpc('registrar_inicio_sesion');
      if (e3) { await sb.auth.signOut(); throw e3; }
      try { localStorage.removeItem('negocio_activo'); localStorage.removeItem('sede_activa'); } catch { /* */ }
      window.location.href = '/';
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <FondoAcceso titulo="Iniciar sesión">
      <form onSubmit={entrar} className="space-y-4">
        <label className="block">
          <span className="etiqueta">Usuario o correo electrónico</span>
          <div className="relative">
            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cafe-300" />
            <input className="input pl-9" autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} required autoFocus />
          </div>
        </label>
        <label className="block">
          <span className="etiqueta">Contraseña</span>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cafe-300" />
            <input className="input pl-9" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} required />
          </div>
        </label>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button className="btn-primario w-full py-2.5" disabled={enviando}>
          {enviando && <Loader2 size={16} className="animate-spin" />} Entrar
        </button>
        <p className="text-center text-sm"><Link href="/recuperar" className="text-vino-600 hover:underline">¿Olvidaste tu contraseña?</Link></p>
      </form>
    </FondoAcceso>
  );
}

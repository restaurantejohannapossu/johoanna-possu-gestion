'use client';
import { useState } from 'react';
import Link from 'next/link';
import FondoAcceso from '@/components/FondoAcceso';
import { supabase } from '@/lib/supabase';
import { mensajeError } from '@/lib/errores';

export default function Recuperar() {
  const [correo, setCorreo] = useState('');
  const [estado, setEstado] = useState({ ok: false, error: '', enviando: false });
  async function enviar(e) {
    e.preventDefault();
    setEstado({ ok: false, error: '', enviando: true });
    const { error } = await supabase().auth.resetPasswordForEmail(correo.trim(), { redirectTo: `${window.location.origin}/restablecer` });
    setEstado({ ok: !error, error: error ? mensajeError(error) : '', enviando: false });
  }
  return (
    <FondoAcceso titulo="Recuperar contraseña">
      {estado.ok ? (
        <p className="text-sm text-cafe-600">Si el correo está registrado, recibirás un enlace para crear una nueva contraseña. Revisa también la carpeta de spam.</p>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          <p className="text-sm text-cafe-500">Escribe el correo de tu usuario. Si tu usuario no tiene correo, pide al administrador que restablezca tu contraseña.</p>
          <input className="input" type="email" placeholder="correo@ejemplo.com" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
          {estado.error && <p className="text-sm text-red-700">{estado.error}</p>}
          <button className="btn-primario w-full" disabled={estado.enviando}>Enviar enlace</button>
        </form>
      )}
      <p className="mt-4 text-center text-sm"><Link href="/login" className="text-vino-600 hover:underline">Volver a iniciar sesión</Link></p>
    </FondoAcceso>
  );
}

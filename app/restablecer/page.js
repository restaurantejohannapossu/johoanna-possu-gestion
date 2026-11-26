'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import FondoAcceso from '@/components/FondoAcceso';
import { supabase } from '@/lib/supabase';
import { mensajeError } from '@/lib/errores';

export default function Restablecer() {
  const router = useRouter();
  const [clave, setClave] = useState('');
  const [clave2, setClave2] = useState('');
  const [error, setError] = useState('');
  async function guardar(e) {
    e.preventDefault();
    if (clave.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (clave !== clave2) return setError('Las contraseñas no coinciden.');
    const { error: err } = await supabase().auth.updateUser({ password: clave });
    if (err) return setError(mensajeError(err));
    router.replace('/');
  }
  return (
    <FondoAcceso titulo="Nueva contraseña">
      <form onSubmit={guardar} className="space-y-4">
        <input className="input" type="password" placeholder="Nueva contraseña (mínimo 8 caracteres)" value={clave} onChange={(e) => setClave(e.target.value)} required />
        <input className="input" type="password" placeholder="Repite la contraseña" value={clave2} onChange={(e) => setClave2(e.target.value)} required />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className="btn-primario w-full">Guardar contraseña</button>
      </form>
    </FondoAcceso>
  );
}

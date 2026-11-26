'use client';
import { createBrowserClient } from '@supabase/ssr';

let cliente = null;

/** Cliente de Supabase para el navegador (solo llamar dentro de efectos o eventos). */
export function supabase() {
  if (!cliente) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const llave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !llave) throw new Error('Faltan las variables NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    cliente = createBrowserClient(url, llave);
  }
  return cliente;
}

/** Ejecuta una función RPC y lanza un error legible si falla. */
export async function rpc(nombre, parametros = {}) {
  const { data, error } = await supabase().rpc(nombre, parametros);
  if (error) throw error;
  return data;
}

/** Consulta con manejo de error. Uso: await q(sb => sb.from('x').select('*')) */
export async function q(fn) {
  const { data, error, count } = await fn(supabase());
  if (error) throw error;
  return count !== undefined && count !== null ? { data, count } : data;
}

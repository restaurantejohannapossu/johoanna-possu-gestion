'use client';
import { createBrowserClient } from '@supabase/ssr';

let cliente = null;

/** Negocio en el que se está trabajando (null = panel general) */
export function negocioGuardado() {
  try { return localStorage.getItem('negocio_activo') || null; } catch { return null; }
}

/** Cambia de negocio (o vuelve al panel general con null) y recarga la aplicación */
export function cambiarNegocio(id, destino = '/') {
  try {
    if (id) localStorage.setItem('negocio_activo', id); else localStorage.removeItem('negocio_activo');
    localStorage.removeItem('sede_activa');
  } catch { /* */ }
  window.location.href = destino;
}

/** Cliente de Supabase para el navegador (solo llamar dentro de efectos o eventos).
 *  Envía el negocio activo en el encabezado x-negocio: la base de datos solo
 *  muestra los datos de ese negocio. */
export function supabase() {
  if (!cliente) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const llave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !llave) throw new Error('Faltan las variables NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    const negocio = negocioGuardado();
    cliente = createBrowserClient(url, llave, negocio ? { global: { headers: { 'x-negocio': negocio } } } : undefined);
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

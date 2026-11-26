'use client';
import { supabase } from './supabase';

export function mensajeError(e) {
  if (!e) return 'Ocurrió un error inesperado.';
  const m = e.message || e.error_description || String(e);
  if (m.includes('Invalid login credentials')) return 'Usuario o contraseña incorrectos.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'Sin conexión con el servidor. Revisa tu internet.';
  if (m.includes('duplicate key')) return 'Ya existe un registro con ese código o nombre.';
  if (m.includes('violates foreign key')) return 'No se puede completar: el registro está siendo usado en otra parte del sistema.';
  if (m.includes('row-level security') || e.code === '42501') return m.startsWith('No ') ? m : 'No tienes permiso para realizar esta acción.';
  if (m.includes('JWT expired')) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  return m;
}

export async function registrarError(ruta, e) {
  try {
    await supabase().rpc('registrar_error', { p_ruta: ruta, p_mensaje: mensajeError(e), p_detalle: { codigo: e?.code || null, detalle: e?.details || null } });
  } catch { /* sin conexión: se ignora */ }
}

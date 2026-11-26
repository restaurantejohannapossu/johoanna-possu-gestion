'use client';
import { supabase } from './supabase';

/** Sube un archivo. Bucket "imagenes" devuelve URL pública; "soportes" devuelve la ruta interna (privada). */
export async function subirArchivo(bucket, archivo, carpeta = 'general') {
  if (archivo.size > 8 * 1024 * 1024) throw new Error('El archivo supera 8 MB.');
  const ext = (archivo.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ruta = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase().storage.from(bucket).upload(ruta, archivo, { upsert: false, contentType: archivo.type });
  if (error) throw error;
  if (bucket === 'imagenes') return supabase().storage.from(bucket).getPublicUrl(ruta).data.publicUrl;
  return `${bucket}/${ruta}`;
}

/** Abre un soporte privado con un enlace temporal */
export async function abrirSoporte(rutaCompleta) {
  if (!rutaCompleta) return;
  if (rutaCompleta.startsWith('http')) return window.open(rutaCompleta, '_blank');
  const [bucket, ...resto] = rutaCompleta.split('/');
  const { data, error } = await supabase().storage.from(bucket).createSignedUrl(resto.join('/'), 300);
  if (error) throw error;
  window.open(data.signedUrl, '_blank');
}

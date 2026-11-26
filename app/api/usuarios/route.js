import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Operaciones que requieren la clave de servicio (solo en el servidor):
// crear usuarios de acceso, cambiar contraseñas y bloquear/desbloquear el acceso.
// Cada acción valida primero los permisos de quien la pide usando SU propia sesión.

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY;

const error = (mensaje, estado = 400) => NextResponse.json({ error: mensaje }, { status: estado });

export async function POST(req) {
  if (!URL_SB || !ANON || !SERVICIO) return error('Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.', 500);
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  if (!token) return error('Sesión no válida.', 401);

  const comoUsuario = createClient(URL_SB, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const admin = createClient(URL_SB, SERVICIO, { auth: { persistSession: false } });
  const { data: { user }, error: eUser } = await comoUsuario.auth.getUser(token);
  if (eUser || !user) return error('Sesión no válida.', 401);

  let cuerpo;
  try { cuerpo = await req.json(); } catch { return error('Solicitud inválida.'); }
  const { accion } = cuerpo;

  // Permite gestionar a un usuario existente solo si la base de datos lo autoriza
  async function validarObjetivo(id) {
    const { error: e } = await comoUsuario.rpc('puede_gestionar_usuario', { p_id: id });
    if (e) throw new Error(e.message);
  }

  try {
    if (accion === 'crear') {
      const { nombre, usuario, correo, telefono, contrasena, rol_id, sedes, sede_principal_id } = cuerpo;
      if (!nombre?.trim() || !usuario?.trim()) return error('Nombre y usuario son obligatorios.');
      if (!contrasena || contrasena.length < 8) return error('La contraseña debe tener al menos 8 caracteres.');
      if (!/^[a-z0-9._-]{3,30}$/i.test(usuario.trim())) return error('El usuario solo puede tener letras, números, punto, guion y guion bajo (3 a 30).');
      const { error: eVal } = await comoUsuario.rpc('validar_gestion_usuario', { p_rol: rol_id, p_sedes: sedes || [] });
      if (eVal) return error(eVal.message, 403);
      const email = (correo?.trim() || `${usuario.trim().toLowerCase()}@usuarios.johoanna-possu.local`).toLowerCase();
      const { data: creado, error: eCrear } = await admin.auth.admin.createUser({ email, password: contrasena, email_confirm: true, user_metadata: { nombre } });
      if (eCrear) return error(eCrear.message.includes('already') ? 'Ya existe un usuario con ese correo.' : eCrear.message);
      const { error: ePerfil } = await comoUsuario.rpc('crear_perfil_usuario', {
        p_id: creado.user.id, p_nombre: nombre.trim(), p_usuario: usuario.trim(), p_correo: email, p_telefono: telefono || null,
        p_rol: rol_id, p_sedes: sedes || [], p_sede_principal: sede_principal_id || null,
      });
      if (ePerfil) {
        await admin.auth.admin.deleteUser(creado.user.id);
        return error(ePerfil.message.includes('duplicate') ? 'Ese nombre de usuario ya existe.' : ePerfil.message);
      }
      return NextResponse.json({ ok: true, id: creado.user.id, email });
    }

    if (accion === 'contrasena') {
      if (!cuerpo.contrasena || cuerpo.contrasena.length < 8) return error('La contraseña debe tener al menos 8 caracteres.');
      await validarObjetivo(cuerpo.id);
      const { error: e } = await admin.auth.admin.updateUserById(cuerpo.id, { password: cuerpo.contrasena });
      if (e) return error(e.message);
      return NextResponse.json({ ok: true });
    }

    if (accion === 'acceso') {
      // Bloquea o restablece el acceso en Supabase Auth (además de desactivar el perfil)
      if (cuerpo.id === user.id) return error('No puedes bloquear tu propio acceso.');
      await validarObjetivo(cuerpo.id);
      const { error: e } = await admin.auth.admin.updateUserById(cuerpo.id, { ban_duration: cuerpo.activo ? 'none' : '876000h' });
      if (e) return error(e.message);
      return NextResponse.json({ ok: true });
    }
    return error('Acción no reconocida.');
  } catch (e) {
    return error(e.message || 'Error inesperado.', 403);
  }
}

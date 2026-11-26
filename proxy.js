import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Mantiene la sesión de Supabase y protege las rutas del panel.
export async function proxy(request) {
  let respuesta = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !llave) return respuesta;

  const sb = createServerClient(url, llave, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        respuesta = NextResponse.next({ request });
        lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await sb.auth.getUser();
  const ruta = request.nextUrl.pathname;
  const publica = ['/login', '/recuperar', '/restablecer'].some((r) => ruta.startsWith(r));
  if (!user && !publica) {
    const destino = request.nextUrl.clone();
    destino.pathname = '/login';
    destino.search = '';
    return NextResponse.redirect(destino);
  }
  return respuesta;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)'],
};

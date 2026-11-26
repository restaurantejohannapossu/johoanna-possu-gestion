'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, ShoppingCart, ClipboardList, Armchair, ChefHat, Package, BookOpen, Boxes, Truck, Users, UserCircle,
  Bike, Wallet, ArrowDownCircle, Receipt, FileText, ArrowLeftRight, BarChart3, Shield, Building2, History, Settings, LogOut, Menu, X, MapPin,
  LayoutGrid, SlidersHorizontal, ChevronLeft, ArrowRight,
} from 'lucide-react';
import { useSesion } from './sesion';
import { Cargando } from './ui';

// modulo: solo aparece si el negocio activo usa ese módulo
export const MENU = [
  { ruta: '/dashboard', texto: 'Dashboard', icono: LayoutDashboard, permisos: ['dashboard.ver'] },
  { ruta: '/pos', texto: 'Punto de venta', icono: ShoppingCart, permisos: ['pos.vender'] },
  { ruta: '/pedidos', texto: 'Ventas y pedidos', icono: ClipboardList, permisos: ['pedidos.ver'] },
  { ruta: '/mesas', texto: 'Mesas', icono: Armchair, permisos: ['mesas.gestionar', 'pos.vender', 'mesas.configurar'], modulo: 'mesas' },
  { ruta: '/cocina', texto: 'Cocina', icono: ChefHat, permisos: ['cocina.ver'], modulo: 'cocina' },
  { ruta: '/productos', texto: 'Productos', icono: Package, permisos: ['productos.ver', 'productos.gestionar'] },
  { ruta: '/recetas', texto: 'Recetas', icono: BookOpen, permisos: ['recetas.ver'], modulo: 'recetas' },
  { ruta: '/inventario', texto: 'Inventario', icono: Boxes, permisos: ['inventario.ver'] },
  { ruta: '/compras', texto: 'Compras', icono: Truck, permisos: ['compras.ver'] },
  { ruta: '/proveedores', texto: 'Proveedores', icono: Users, permisos: ['proveedores.ver'] },
  { ruta: '/clientes', texto: 'Clientes', icono: UserCircle, permisos: ['clientes.ver'] },
  { ruta: '/domicilios', texto: 'Domicilios', icono: Bike, permisos: ['domicilios.ver'], modulo: 'domicilios' },
  { ruta: '/caja', texto: 'Caja', icono: Wallet, permisos: ['caja.operar', 'caja.ver_todas'] },
  { ruta: '/salidas', texto: 'Salidas de dinero', icono: ArrowDownCircle, permisos: ['gastos.registrar'] },
  { ruta: '/gastos', texto: 'Gastos', icono: Receipt, permisos: ['gastos.ver'] },
  { ruta: '/facturacion', texto: 'Facturación', icono: FileText, permisos: ['facturacion.ver'] },
  { ruta: '/transferencias', texto: 'Transferencias', icono: ArrowLeftRight, permisos: ['transferencias.ver'] },
  { ruta: '/reportes', texto: 'Reportes', icono: BarChart3, permisos: ['reportes.ventas', 'reportes.inventario', 'reportes.gastos', 'reportes.financieros'] },
  { ruta: '/sedes', texto: 'Sedes', icono: Building2, permisos: ['sedes.gestionar'] },
  { ruta: '/auditoria', texto: 'Auditoría', icono: History, permisos: ['auditoria.ver'] },
  { ruta: '/configuracion', texto: 'Configuración del negocio', icono: Settings, permisos: ['configuracion.gestionar', 'facturacion.configurar'] },
];

const MENU_GENERAL = [
  { ruta: '/', texto: 'Panel general', icono: LayoutGrid, permisos: ['dashboard.ver'] },
  { ruta: '/general', texto: 'Configuración general', icono: SlidersHorizontal, permisos: ['configuracion.gestionar'] },
  { ruta: '/usuarios', texto: 'Usuarios y permisos', icono: Shield, permisos: ['usuarios.ver', 'roles.gestionar'] },
  { ruta: '/auditoria', texto: 'Auditoría general', icono: History, permisos: ['auditoria.ver'] },
];
const RUTAS_GENERALES = ['/', '/general', '/usuarios', '/auditoria'];

/** Logo + nombre. datos = negocio (nombre, eslogan, logo_url) o la configuración general */
export function Marca({ datos, negocios, claro = false, compacta = false }) {
  return (
    <div className="flex items-center gap-3">
      {datos?.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={datos.logo_url} alt="Logo" className="h-11 w-11 shrink-0 rounded-full bg-white object-contain p-0.5 shadow" />
      ) : negocios?.length ? (
        <div className="flex shrink-0 -space-x-3">
          {negocios.slice(0, 3).map((n) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={n.id} src={n.logo_url || '/logos/restaurante.jpg'} alt="" className="h-9 w-9 rounded-full bg-white object-contain ring-2 ring-white" />
          ))}
        </div>
      ) : (
        <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0" aria-hidden="true">
          <circle cx="20" cy="20" r="19" fill="currentColor" className="text-vino-700" stroke="#e0a92a" strokeWidth="2" />
          <path d="M11 22h18a9 9 0 0 1-18 0z" fill="#e0a92a" />
        </svg>
      )}
      {!compacta && (
        <div className="min-w-0 leading-tight">
          <p className={`truncate font-titulo text-[15px] font-bold ${claro ? 'text-white' : 'text-vino-700'}`}>{datos?.nombre || 'Negocios Johoanna Possu'}</p>
          <p className={`truncate text-[11px] ${claro ? 'text-dorado-200' : 'text-dorado-600'}`}>{datos?.eslogan || ''}</p>
        </div>
      )}
    </div>
  );
}

export default function AppShell({ children }) {
  const { perfil, empresa, negocio, negocios, modoGeneral, cargando, error, puede, usaModulo, sedes, sedeId, cambiarSede, salir, irPanelGeneral, entrarNegocio } = useSesion();
  const ruta = usePathname();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const items = modoGeneral
    ? MENU_GENERAL.filter((m) => puede(...m.permisos))
    : MENU.filter((m) => puede(...m.permisos) && (!m.modulo || usaModulo(m.modulo)));

  useEffect(() => { setAbierto(false); }, [ruta]);
  useEffect(() => {
    if (cargando || !perfil || modoGeneral) return;
    if ((ruta === '/' || ruta === '/dashboard') && !puede('dashboard.ver') && items[0]) router.replace(items[0].ruta);
  }, [cargando, perfil, ruta, puede, items, router, modoGeneral]);

  if (error) return <div className="p-10 text-center text-red-700">No se pudo conectar: {error}</div>;
  if (cargando || !perfil) return <div className="min-h-screen bg-crema-100"><Cargando texto="Preparando el sistema…" /></div>;

  const activo = (r) => (r === '/' ? ruta === '/' : ruta.startsWith(r));
  const marcaDatos = modoGeneral ? empresa : negocio;
  const nav = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
      {!modoGeneral && negocios.length > 1 && (
        <button onClick={irPanelGeneral} className="mb-2 flex w-full items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white/90 hover:bg-white/10">
          <ChevronLeft size={16} /> Panel general
        </button>
      )}
      {items.map(({ ruta: r, texto, icono: I }) => (
        <Link key={r} href={r}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${activo(r) ? 'bg-dorado-400 text-cafe-900 shadow' : 'text-white/85 hover:bg-white/10 hover:text-white'}`}>
          <I size={18} /> {texto}
        </Link>
      ))}
      {modoGeneral && negocios.length > 0 && (
        <div className="pt-4">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">Entrar a un negocio</p>
          {negocios.map((n) => (
            <button key={n.id} onClick={() => entrarNegocio(n.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-white/85 hover:bg-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={n.logo_url || '/logos/restaurante.jpg'} alt="" className="h-6 w-6 rounded-full bg-white object-contain" />
              <span className="flex-1 truncate">{n.nombre}</span><ArrowRight size={14} />
            </button>
          ))}
        </div>
      )}
    </nav>
  );
  const pieMenu = (
    <div className="border-t border-white/15 p-3 text-xs text-white/70">
      <p className="font-semibold text-white">{perfil.nombre}</p>
      <p>{perfil.rol}</p>
      <button onClick={salir} className="mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-white/80 hover:bg-white/10"><LogOut size={15} /> Cerrar sesión</button>
      <p className="mt-3 text-[10px] text-white/45">Desarrollado por Bryan Possu</p>
    </div>
  );
  const fondo = 'bg-gradient-to-b from-vino-700 to-vino-900';
  const pideNegocio = modoGeneral && !RUTAS_GENERALES.includes(ruta);

  return (
    <div className="flex min-h-screen">
      <aside className={`no-imprimir sticky top-0 hidden h-screen w-64 shrink-0 flex-col lg:flex ${fondo}`}>
        <div className="border-b border-white/15 p-4"><Marca datos={marcaDatos} negocios={modoGeneral ? negocios : null} claro /></div>
        {nav}{pieMenu}
      </aside>
      {abierto && (
        <div className="no-imprimir fixed inset-0 z-40 lg:hidden" onClick={() => setAbierto(false)}>
          <div className="absolute inset-0 bg-cafe-900/50" />
          <aside className={`absolute left-0 top-0 flex h-full w-72 flex-col ${fondo}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/15 p-4">
              <Marca datos={marcaDatos} negocios={modoGeneral ? negocios : null} claro />
              <button className="text-white" onClick={() => setAbierto(false)}><X /></button>
            </div>
            {nav}{pieMenu}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-imprimir sticky top-0 z-30 flex items-center gap-3 border-b border-crema-200 bg-crema-50/95 px-4 py-2.5 backdrop-blur">
          <button className="btn-fantasma btn-sm lg:hidden" onClick={() => setAbierto(true)} aria-label="Menú"><Menu size={20} /></button>
          <div className="lg:hidden"><Marca datos={marcaDatos} negocios={modoGeneral ? negocios : null} compacta /></div>
          {modoGeneral ? (
            <span className="ml-auto chip bg-vino-100 text-vino-800">Panel general · todos los negocios</span>
          ) : (
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-sm font-semibold text-cafe-500 sm:inline">{negocio?.nombre}</span>
              <MapPin size={16} className="text-vino-600" />
              {sedes.length > 0 ? (
                <select className="input w-auto py-1.5 pr-8 font-semibold" value={sedeId || ''} onChange={(e) => cambiarSede(e.target.value)}>
                  {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              ) : <span className="text-sm text-red-700">Sin sede asignada</span>}
            </div>
          )}
        </header>
        <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6">
          {pideNegocio ? (
            <div className="tarjeta mx-auto mt-10 max-w-lg p-8 text-center">
              <h2 className="text-xl font-bold">Elige un negocio</h2>
              <p className="mt-2 text-sm text-cafe-400">Este módulo trabaja dentro de un negocio. ¿A cuál quieres entrar?</p>
              <div className="mt-5 grid gap-2">
                {negocios.map((n) => (
                  <button key={n.id} className="btn-secundario justify-start" onClick={() => entrarNegocio(n.id, ruta)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={n.logo_url || '/logos/restaurante.jpg'} alt="" className="h-7 w-7 rounded-full object-contain" /> {n.nombre}
                  </button>
                ))}
              </div>
            </div>
          ) : children}
        </main>
      </div>
    </div>
  );
}

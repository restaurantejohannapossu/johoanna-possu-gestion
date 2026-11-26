'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, ShoppingCart, ClipboardList, Armchair, ChefHat, Package, BookOpen, Boxes, Truck, Users, UserCircle,
  Bike, Wallet, ArrowDownCircle, Receipt, FileText, ArrowLeftRight, BarChart3, Shield, Building2, History, Settings, LogOut, Menu, X, MapPin,
} from 'lucide-react';
import { useSesion } from './sesion';
import { Cargando } from './ui';

export const MENU = [
  { ruta: '/', texto: 'Dashboard', icono: LayoutDashboard, permisos: ['dashboard.ver'] },
  { ruta: '/pos', texto: 'Punto de venta', icono: ShoppingCart, permisos: ['pos.vender'] },
  { ruta: '/pedidos', texto: 'Pedidos', icono: ClipboardList, permisos: ['pedidos.ver'] },
  { ruta: '/mesas', texto: 'Mesas', icono: Armchair, permisos: ['mesas.gestionar', 'pos.vender', 'mesas.configurar'] },
  { ruta: '/cocina', texto: 'Cocina', icono: ChefHat, permisos: ['cocina.ver'] },
  { ruta: '/productos', texto: 'Productos', icono: Package, permisos: ['productos.ver', 'productos.gestionar'] },
  { ruta: '/recetas', texto: 'Recetas', icono: BookOpen, permisos: ['recetas.ver'] },
  { ruta: '/inventario', texto: 'Inventario', icono: Boxes, permisos: ['inventario.ver'] },
  { ruta: '/compras', texto: 'Compras', icono: Truck, permisos: ['compras.ver'] },
  { ruta: '/proveedores', texto: 'Proveedores', icono: Users, permisos: ['proveedores.ver'] },
  { ruta: '/clientes', texto: 'Clientes', icono: UserCircle, permisos: ['clientes.ver'] },
  { ruta: '/domicilios', texto: 'Domicilios', icono: Bike, permisos: ['domicilios.ver'] },
  { ruta: '/caja', texto: 'Caja', icono: Wallet, permisos: ['caja.operar', 'caja.ver_todas'] },
  { ruta: '/salidas', texto: 'Salidas de dinero', icono: ArrowDownCircle, permisos: ['gastos.registrar'] },
  { ruta: '/gastos', texto: 'Gastos', icono: Receipt, permisos: ['gastos.ver'] },
  { ruta: '/facturacion', texto: 'Facturación', icono: FileText, permisos: ['facturacion.ver'] },
  { ruta: '/transferencias', texto: 'Transferencias', icono: ArrowLeftRight, permisos: ['transferencias.ver'] },
  { ruta: '/reportes', texto: 'Reportes', icono: BarChart3, permisos: ['reportes.ventas', 'reportes.inventario', 'reportes.gastos', 'reportes.financieros'] },
  { ruta: '/usuarios', texto: 'Usuarios', icono: Shield, permisos: ['usuarios.ver', 'roles.gestionar'] },
  { ruta: '/sedes', texto: 'Sedes', icono: Building2, permisos: ['sedes.gestionar'] },
  { ruta: '/auditoria', texto: 'Auditoría', icono: History, permisos: ['auditoria.ver'] },
  { ruta: '/configuracion', texto: 'Configuración', icono: Settings, permisos: ['configuracion.gestionar', 'facturacion.configurar'] },
];

export function Marca({ empresa, claro = false, compacta = false }) {
  return (
    <div className="flex items-center gap-3">
      {empresa?.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={empresa.logo_url} alt="Logo" className="h-10 w-10 rounded-full bg-white object-contain p-0.5" />
      ) : (
        <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0" aria-hidden="true">
          <circle cx="20" cy="20" r="19" fill="#6b1e2e" stroke="#e0a92a" strokeWidth="2" />
          <path d="M11 22h18a9 9 0 0 1-18 0z" fill="#e0a92a" />
          <path d="M15 17c0-2 2-2 2-4M20 17c0-2 2-2 2-4M25 17c0-2 2-2 2-4" stroke="#fbf5e9" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      )}
      {!compacta && (
        <div className="leading-tight">
          <p className={`font-titulo text-[15px] font-bold ${claro ? 'text-crema-100' : 'text-vino-700'}`}>{empresa?.nombre || 'Restaurante Johoanna Possu'}</p>
          <p className={`text-[11px] ${claro ? 'text-dorado-300' : 'text-dorado-600'}`}>{empresa?.eslogan || 'Sabor casero y tradicional'}</p>
        </div>
      )}
    </div>
  );
}

export default function AppShell({ children }) {
  const { perfil, empresa, cargando, error, puede, sedes, sedeId, cambiarSede, salir } = useSesion();
  const ruta = usePathname();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const items = MENU.filter((m) => puede(...m.permisos));

  useEffect(() => { setAbierto(false); }, [ruta]);
  useEffect(() => {
    if (!cargando && perfil && ruta === '/' && !puede('dashboard.ver') && items[0]) router.replace(items[0].ruta);
  }, [cargando, perfil, ruta, puede, items, router]);

  if (error) return <div className="p-10 text-center text-red-700">No se pudo conectar: {error}</div>;
  if (cargando || !perfil) return <div className="min-h-screen bg-crema-100"><Cargando texto="Preparando el sistema…" /></div>;

  const activo = (r) => (r === '/' ? ruta === '/' : ruta.startsWith(r));
  const nav = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
      {items.map(({ ruta: r, texto, icono: I }) => (
        <Link key={r} href={r}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${activo(r) ? 'bg-dorado-400 text-cafe-900 shadow' : 'text-crema-200 hover:bg-vino-600/60 hover:text-white'}`}>
          <I size={18} /> {texto}
        </Link>
      ))}
    </nav>
  );
  const pieMenu = (
    <div className="border-t border-vino-600/60 p-3 text-xs text-crema-300">
      <p className="font-semibold text-crema-100">{perfil.nombre}</p>
      <p>{perfil.rol}</p>
      <button onClick={salir} className="mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-crema-200 hover:bg-vino-600/60"><LogOut size={15} /> Cerrar sesión</button>
      <p className="mt-3 text-[10px] text-crema-300/70">Desarrollado por Bryan Possu</p>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="no-imprimir sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-gradient-to-b from-vino-700 to-vino-900 lg:flex">
        <div className="border-b border-vino-600/60 p-4"><Marca empresa={empresa} claro /></div>
        {nav}{pieMenu}
      </aside>
      {abierto && (
        <div className="no-imprimir fixed inset-0 z-40 lg:hidden" onClick={() => setAbierto(false)}>
          <div className="absolute inset-0 bg-cafe-900/50" />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-gradient-to-b from-vino-700 to-vino-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-vino-600/60 p-4">
              <Marca empresa={empresa} claro />
              <button className="text-crema-100" onClick={() => setAbierto(false)}><X /></button>
            </div>
            {nav}{pieMenu}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-imprimir sticky top-0 z-30 flex items-center gap-3 border-b border-crema-200 bg-crema-50/95 px-4 py-2.5 backdrop-blur">
          <button className="btn-fantasma btn-sm lg:hidden" onClick={() => setAbierto(true)} aria-label="Menú"><Menu size={20} /></button>
          <div className="lg:hidden"><Marca empresa={empresa} compacta /></div>
          <div className="ml-auto flex items-center gap-2">
            <MapPin size={16} className="text-vino-600" />
            {sedes.length > 0 ? (
              <select className="input w-auto py-1.5 pr-8 font-semibold" value={sedeId || ''} onChange={(e) => cambiarSede(e.target.value)}>
                {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            ) : <span className="text-sm text-red-700">Sin sede asignada</span>}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

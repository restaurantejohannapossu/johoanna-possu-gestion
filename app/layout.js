import './globals.css';
import { ProveedorUI } from '@/components/ui';

export const metadata = {
  title: 'Negocios Johoanna Possu · Gestión',
  description: 'Sistema de gestión: Restaurante Johoanna Possu, Variedades Johanna y Tienda — Villa Rica, Cauca',
};
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#6b1e2e' };

export default function RootLayout({ children }) {
  return (
    <html lang="es-CO">
      <body><ProveedorUI>{children}</ProveedorUI></body>
    </html>
  );
}

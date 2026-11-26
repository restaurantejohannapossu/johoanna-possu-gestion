'use client';
import AppShell from '@/components/AppShell';
import { ProveedorSesion } from '@/components/sesion';

export default function PanelLayout({ children }) {
  return <ProveedorSesion><AppShell>{children}</AppShell></ProveedorSesion>;
}

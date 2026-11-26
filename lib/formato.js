const ZONA = 'America/Bogota';
const fmtMoneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });

export const moneda = (n) => fmtMoneda.format(Number(n || 0));
export const numero = (n, dec = 3) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: dec }).format(Number(n || 0));
export const entero = (n) => fmtNum.format(Math.round(Number(n || 0)));

export function fecha(v) {
  if (!v) return '—';
  const d = typeof v === 'string' && v.length === 10 ? new Date(v + 'T12:00:00') : new Date(v);
  return d.toLocaleDateString('es-CO', { timeZone: ZONA, day: '2-digit', month: 'short', year: 'numeric' });
}
export function fechaHora(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString('es-CO', { timeZone: ZONA, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function hora(v) {
  if (!v) return '—';
  return new Date(v).toLocaleTimeString('es-CO', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' });
}
/** Fecha de hoy en Colombia como AAAA-MM-DD */
export function hoyISO(desplazarDias = 0) {
  const d = new Date(Date.now() + desplazarDias * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: ZONA });
}
export function inicioMesISO() { return hoyISO().slice(0, 8) + '01'; }
export function minutosDesde(v) { return Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 60000)); }

export const ETIQUETAS = {
  mesa: 'Mesa', llevar: 'Para llevar', recoger: 'Para recoger', domicilio: 'Domicilio', mostrador: 'Mostrador',
  pendiente: 'Pendiente', en_preparacion: 'En preparación', listo: 'Listo', entregado: 'Entregado', cancelado: 'Cancelado',
  abierto: 'Abierto', parcial: 'Pago parcial', pagado: 'Pagado', anulado: 'Anulado',
  recibido: 'Recibido', en_camino: 'En camino', libre: 'Libre', ocupada: 'Ocupada', reservada: 'Reservada',
  solicitud: 'Solicitud', aprobada: 'Aprobada', despachada: 'Despachada', recibida: 'Recibida', rechazada: 'Rechazada', cancelada: 'Cancelada',
  pagada: 'Pagada', borrador: 'Borrador', aplicado: 'Aplicado', abierta: 'Abierta', cerrada: 'Cerrada',
  inicial: 'Inventario inicial', compra: 'Compra', venta: 'Venta', desperdicio: 'Desperdicio', consumo_interno: 'Consumo interno',
  ajuste: 'Ajuste', devolucion: 'Devolución', transferencia_salida: 'Transferencia (salida)', transferencia_entrada: 'Transferencia (entrada)',
  produccion_consumo: 'Producción (consumo)', produccion_entrada: 'Producción (entrada)', vencimiento: 'Vencimiento',
  conteo_fisico: 'Inventario físico', anulacion: 'Anulación', caja: 'Caja', banco: 'Banco', otro: 'Otro',
  ingreso: 'Ingreso', gasto: 'Gasto', retiro: 'Retiro', pago_proveedor: 'Pago a proveedor', transferencia: 'Transferencia',
  contado: 'Contado', credito: 'Crédito',
};
export const etiqueta = (v) => ETIQUETAS[v] || v || '—';

import type { PostGaraje } from './types';

export const MEDIOS_PAGO = ['Efectivo', 'Nequi', 'Daviplata', 'Transferencia', 'Tarjeta'];
export const MAX_ARTICULOS = 30;

export const inicioMs = (p: PostGaraje) => new Date(p.inicio).getTime();
export const finMs = (p: PostGaraje) => new Date(p.fin).getTime();

export type MomentoVenta = 'proxima' | 'abierta' | 'terminada';

export function momentoVenta(p: PostGaraje, ahora = Date.now()): MomentoVenta {
  if (ahora >= finMs(p)) return 'terminada';
  if (ahora >= inicioMs(p)) return 'abierta';
  return 'proxima';
}

/** "Sáb 9 nov · 8:00 a. m. – 2:00 p. m." (o con ambas fechas si dura varios días) */
export function horarioVenta(p: PostGaraje): string {
  const i = new Date(p.inicio);
  const f = new Date(p.fin);
  const dia = (d: Date) => d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
  const hora = (d: Date) => d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  return i.toDateString() === f.toDateString()
    ? `${dia(i)} · ${hora(i)} – ${hora(f)}`
    : `${dia(i)} ${hora(i)} – ${dia(f)} ${hora(f)}`;
}

export function resumenArticulos(p: PostGaraje) {
  const disponibles = p.articulos.filter((a) => a.estado === 'disponible');
  const precios = disponibles.map((a) => a.precio).filter((x) => x > 0);
  return {
    total: p.articulos.length,
    disponibles: disponibles.length,
    desde: precios.length ? Math.min(...precios) : 0,
    vendido: p.articulos.filter((a) => a.estado === 'vendido').reduce((t, a) => t + a.precio, 0),
  };
}

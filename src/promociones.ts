import type { Categoria, PlanPromocionId, Post, Promocion } from './types';
import { PASARELA } from './servicios';

/**
 * Promociones: la ÚNICA forma pagada de ganar visibilidad. Reglas para no romper
 * el principio de "feed sin algoritmo":
 * - Siempre marcadas como "Promocionado".
 * - Máximo 2 espacios en el feed (arriba y después de 5 publicaciones normales).
 * - Solo se muestran a vecinos dentro del alcance pagado (siempre local).
 * - Las alertas de seguridad NO se pueden promocionar.
 */
export interface PlanPromocion {
  id: PlanPromocionId;
  nombre: string;
  icono: string;
  dias: number;
  alcanceKm: number;
  /** ⚠️ Precios sugeridos de lanzamiento: ajustar según la respuesta del mercado. */
  precio: number;
}

export const PLANES: PlanPromocion[] = [
  { id: 'cuadra', nombre: 'Cuadra', icono: '🏠', dias: 3, alcanceKm: 1, precio: 5000 },
  { id: 'barrio', nombre: 'Barrio', icono: '🏘️', dias: 7, alcanceKm: 2, precio: 15000 },
  { id: 'localidad', nombre: 'Localidad', icono: '🏙️', dias: 14, alcanceKm: 5, precio: 40000 },
];

export const PLAN: Record<PlanPromocionId, PlanPromocion> = Object.fromEntries(PLANES.map((p) => [p.id, p])) as Record<PlanPromocionId, PlanPromocion>;

export const ESPACIOS_PROMO = 2;
/** El segundo espacio aparece después de esta cantidad de publicaciones normales. */
export const POSICION_SEGUNDO_ESPACIO = 5;

export const PROMOCIONABLES: Categoria[] = ['evento', 'garaje', 'oferta', 'servicio', 'trueque'];

export function costoPromocion(precio: number) {
  const pasarela = Math.round(precio * PASARELA.porcentaje + PASARELA.fijo);
  return { precio, pasarela, total: precio + pasarela };
}

export const promoActiva = (p: Promocion, ahora = Date.now()) => p.estado === 'activa' && ahora >= p.inicio && ahora < p.fin;

/** ¿Se puede promocionar? Devuelve el motivo si no. */
export function motivoNoPromocionable(post: Post): string | null {
  if (!PROMOCIONABLES.includes(post.categoria)) return 'Las alertas de seguridad no se pueden promocionar: la seguridad del barrio no se vende.';
  if (post.oculta) return 'Esta publicación está oculta por reportes.';
  if (post.categoria === 'evento' && new Date(post.fecha).getTime() <= Date.now()) return 'El evento ya pasó.';
  if (post.categoria === 'garaje' && new Date(post.fin).getTime() <= Date.now()) return 'La venta de garaje ya terminó.';
  if (post.categoria === 'servicio' && post.modo === 'necesito' && post.estado !== 'abierta') return 'Este servicio ya fue asignado.';
  return null;
}

/** Fecha de fin: la del plan, o antes si el evento empieza o la venta de garaje termina antes. */
export function finPromocion(post: Post, plan: PlanPromocion, inicio: number): number {
  const fin = inicio + plan.dias * 24 * 3600_000;
  if (post.categoria === 'evento') return Math.min(fin, new Date(post.fecha).getTime());
  if (post.categoria === 'garaje') return Math.min(fin, new Date(post.fin).getTime());
  return fin;
}

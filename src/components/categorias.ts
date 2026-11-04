import type { Categoria } from '../types';

export const CATEGORIAS: Record<Categoria, { nombre: string; icono: string; color: string }> = {
  servicio: { nombre: 'Servicios', icono: '🧰', color: '#15803d' },
  garaje: { nombre: 'Ventas de garaje', icono: '📦', color: '#be185d' },
  trueque: { nombre: 'Trueque', icono: '🔄', color: '#7c3aed' },
  seguridad: { nombre: 'Seguridad', icono: '🛡️', color: '#7f1d1d' },
  oferta: { nombre: 'Ofertas', icono: '🏷️', color: '#d97706' },
  evento: { nombre: 'Eventos', icono: '📅', color: '#0284c7' },
};

export const NIVELES = {
  info: { nombre: 'Informativo', clase: 'nivel-info' },
  precaucion: { nombre: 'Precaución', clase: 'nivel-precaucion' },
  urgente: { nombre: 'Urgente', clase: 'nivel-urgente' },
} as const;

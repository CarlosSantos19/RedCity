import type { EstadoServicio, Frecuencia, TipoDocumento, Usuario } from './types';

/**
 * Comisión de la plataforma sobre cada servicio pagado por la app.
 * Se descuenta del valor que recibe el proveedor: el cliente paga $100.000,
 * el proveedor recibe $98.000 y RedCity se queda con $2.000.
 */
export const COMISION = 0.02;

/**
 * Costo de la pasarela de pagos (PSE / Nequi / tarjeta), cobrado al CLIENTE aparte del valor
 * del servicio, para que el 2 % de la plataforma no se lo coma la pasarela.
 * ⚠️ VALORES ESTIMADOS DE REFERENCIA: reemplazar por la tarifa real contratada
 * (cada pasarela cobra distinto según el medio de pago, más IVA).
 */
export const PASARELA = { porcentaje: 0.03, fijo: 800 };

export type GrupoId = 'hogar' | 'comercio' | 'profesional';

export const GRUPOS: Record<GrupoId, string> = {
  hogar: 'Oficios y hogar',
  comercio: 'Comercios del barrio',
  profesional: 'Profesionales',
};

export interface Rubro { id: string; nombre: string; icono: string; grupo: GrupoId }

const r = (grupo: GrupoId, id: string, nombre: string, icono: string): Rubro => ({ id, nombre, icono, grupo });

export const RUBROS: Rubro[] = [
  r('hogar', 'servicios-generales', 'Servicios generales / aseo', '🧹'),
  r('hogar', 'cerrajeria', 'Cerrajería', '🔑'),
  r('hogar', 'plomeria', 'Plomería', '🔧'),
  r('hogar', 'electricista', 'Electricista', '💡'),
  r('hogar', 'pintura', 'Pintura y mantenimiento', '🎨'),
  r('hogar', 'jardineria', 'Jardinería', '🌿'),
  r('hogar', 'cuidado-mascotas', 'Paseo y cuidado de mascotas', '🐕'),
  r('hogar', 'lavado-carros', 'Lavado de carros', '🚗'),
  r('hogar', 'ninera', 'Cuidado de niños', '🧸'),
  r('hogar', 'adulto-mayor', 'Cuidado de adulto mayor', '🧓'),
  r('hogar', 'modisteria', 'Modistería y arreglos', '🧵'),
  r('hogar', 'satelite', 'Satélite de confección', '🪡'),
  r('hogar', 'trasteos', 'Trasteos y acarreos', '📦'),
  r('comercio', 'panaderia', 'Panadería', '🥖'),
  r('comercio', 'miscelanea', 'Miscelánea', '🛍️'),
  r('comercio', 'ferreteria', 'Ferretería', '🔩'),
  r('comercio', 'drogueria', 'Droguería', '💊'),
  r('comercio', 'tienda', 'Tienda de barrio', '🏪'),
  r('comercio', 'papeleria', 'Papelería', '✏️'),
  r('comercio', 'restaurante', 'Restaurante / comidas', '🍲'),
  r('comercio', 'peluqueria', 'Peluquería y belleza', '💇'),
  r('profesional', 'contador', 'Contador', '📊'),
  r('profesional', 'abogado', 'Abogado', '⚖️'),
  r('profesional', 'ingeniero', 'Ingeniero', '📐'),
  r('profesional', 'arquitecto', 'Arquitecto', '🏗️'),
  r('profesional', 'psicologo', 'Psicólogo', '🧠'),
  r('profesional', 'tutor', 'Profesor / tutorías', '📚'),
  r('profesional', 'sistemas', 'Técnico de sistemas', '💻'),
  r('profesional', 'veterinario', 'Veterinario', '🩺'),
];

export const RUBRO: Record<string, Rubro> = Object.fromEntries(RUBROS.map((x) => [x.id, x]));

export const FRECUENCIAS: Record<Frecuencia, string> = {
  'una-vez': 'Una sola vez',
  semanal: 'Cada semana',
  quincenal: 'Cada 15 días',
  mensual: 'Cada mes',
};

export const UNIDADES = ['por servicio', 'por día', 'por hora', 'por visita', 'por mes'];

export const ESTADOS: Record<EstadoServicio, string> = {
  abierta: 'Recibiendo propuestas',
  asignada: 'Proveedor elegido',
  pagada: 'Pago retenido',
  completada: 'Completado',
  cancelada: 'Cancelado',
};

/** Rubros donde un trabajo fijo y recurrente puede configurar relación laboral de servicio doméstico. */
export const RUBROS_DOMESTICOS = ['servicios-generales', 'ninera', 'adulto-mayor'];

export function desglose(valor: number) {
  const comision = Math.round(valor * COMISION);
  const pasarela = valor > 0 ? Math.round(valor * PASARELA.porcentaje + PASARELA.fijo) : 0;
  return { valor, pasarela, total: valor + pasarela, comision, neto: valor - comision };
}

/**
 * Verificaciones exigidas para OFRECER o POSTULARSE a servicios de mayor riesgo
 * (entrar a una casa, cuidar niños o adultos mayores).
 */
export const REQUISITOS: Partial<Record<string, TipoDocumento[]>> = {
  ninera: ['cedula', 'antecedentes'],
  'adulto-mayor': ['cedula', 'antecedentes'],
  'servicios-generales': ['cedula'],
  cerrajeria: ['cedula'],
  electricista: ['cedula'],
  plomeria: ['cedula'],
};

export const NOMBRE_DOCUMENTO: Record<TipoDocumento, string> = {
  cedula: 'Identidad (cédula)',
  antecedentes: 'Antecedentes (Policía y Procuraduría)',
};

/** Los servicios con requisitos de verificación también exigen foto de perfil real. */
export const requiereFoto = (rubro: string) => !!REQUISITOS[rubro];

/** Documentos que le faltan a un usuario para el rubro indicado. */
export function documentosFaltantes(u: Usuario, rubro: string): TipoDocumento[] {
  return (REQUISITOS[rubro] ?? []).filter((d) => u.documentos?.[d] !== 'verificado');
}

const formato = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const cop = (n: number) => formato.format(n);

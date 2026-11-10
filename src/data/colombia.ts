import type { Barrio } from '../types';
import { distanciaKm } from '../geo';
import { CENTROS_LOCALIDADES } from './bogota';

/** Municipio de Colombia según la codificación DIVIPOLA del DANE. */
export interface Municipio {
  /** Código DIVIPOLA, p. ej. "05001" */
  c: string;
  /** Nombre del municipio */
  m: string;
  /** Departamento */
  d: string;
  la: number;
  lo: number;
}

let cache: Promise<Municipio[]> | null = null;

/**
 * Los 1.122 municipios (public/municipios.json, generado desde DIVIPOLA del DANE en datos.gov.co).
 * Se descarga solo cuando hace falta (al registrarse), para no hacer pesada la app.
 */
export function cargarMunicipios(): Promise<Municipio[]> {
  cache ??= fetch(`${import.meta.env.BASE_URL}municipios.json`)
    .then((r) => { if (!r.ok) throw new Error('No se pudo cargar la lista de municipios'); return r.json() as Promise<Municipio[]>; })
    .catch((e) => { cache = null; throw e; });
  return cache;
}

/** Caja que contiene a Colombia continental + San Andrés y Providencia. */
export function estaEnColombia(lat: number, lng: number): boolean {
  return lat > -4.3 && lat < 13.6 && lng > -82 && lng < -66.8;
}

/** Municipio cuya cabecera está más cerca del punto (aproximación sin mapas oficiales de límites). */
export function municipioCercano(municipios: Municipio[], lat: number, lng: number): Municipio | undefined {
  let mejor: Municipio | undefined;
  let d = Infinity;
  for (const m of municipios) {
    // Bogotá es enorme: se mide contra el centro de cada localidad, no solo contra la Plaza de Bolívar
    const x = m.c === CODIGO_BOGOTA ? distanciaKm(lat, lng, ...centroLocalidadCercana(lat, lng)[1]) : distanciaKm(lat, lng, m.la, m.lo);
    if (x < d) { d = x; mejor = m; }
  }
  return mejor;
}

export const CODIGO_BOGOTA = '11001';

/** Localidad de Bogotá cuyo centro está más cerca del punto, con ese centro. */
function centroLocalidadCercana(lat: number, lng: number): [string, [number, number]] {
  let mejor: [string, [number, number]] = ['', [lat, lng]];
  let d = Infinity;
  for (const [nombre, c] of Object.entries(CENTROS_LOCALIDADES)) {
    const x = distanciaKm(lat, lng, c.lat, c.lng);
    if (x < d) { d = x; mejor = [nombre, [c.lat, c.lng]]; }
  }
  return mejor;
}

export function localidadCercana(lat: number, lng: number): string {
  return centroLocalidadCercana(lat, lng)[0];
}

/** "Chapinero Alto, Chapinero · Bogotá" o "El Poblado · Medellín" */
export function lugarDeBarrio(b?: Barrio): string {
  if (!b) return '';
  return `${b.localidad ? `${b.localidad}, ` : ''}${b.ciudad}`;
}

export const DEPARTAMENTO_BOGOTA = 'Bogotá D.C.';

/** Departamento del barrio (los barrios semilla de Bogotá no lo traen guardado). */
export function departamentoDe(b: Barrio): string {
  return b.departamento ?? (b.ciudad === 'Bogotá' ? DEPARTAMENTO_BOGOTA : '');
}

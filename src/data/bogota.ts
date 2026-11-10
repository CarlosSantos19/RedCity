import type { Barrio } from '../types';

export const CIUDAD = 'Bogotá';
export const CENTRO_BOGOTA = { lat: 4.6533, lng: -74.0836 };

/** Límites aproximados del área urbana de Bogotá (para validar que el usuario esté en la ciudad). */
export const LIMITES_BOGOTA = { latMin: 4.45, latMax: 4.84, lngMin: -74.23, lngMax: -73.99 };

export function estaEnBogota(lat: number, lng: number): boolean {
  const l = LIMITES_BOGOTA;
  return lat >= l.latMin && lat <= l.latMax && lng >= l.lngMin && lng <= l.lngMax;
}

export const LOCALIDADES = [
  'Usaquén', 'Chapinero', 'Santa Fe', 'San Cristóbal', 'Usme', 'Tunjuelito', 'Bosa',
  'Kennedy', 'Fontibón', 'Engativá', 'Suba', 'Barrios Unidos', 'Teusaquillo',
  'Los Mártires', 'Antonio Nariño', 'Puente Aranda', 'La Candelaria',
  'Rafael Uribe Uribe', 'Ciudad Bolívar', 'Sumapaz',
];

/**
 * Centro aproximado de la zona habitada de cada localidad. Sirve para dos cosas: que el GPS en los bordes
 * de Bogotá no la confunda con un municipio vecino (Chipaque, Soacha…) y para ubicar un barrio nuevo
 * cuando el GPS del celular no responde.
 */
export const CENTROS_LOCALIDADES: Record<string, { lat: number; lng: number }> = {
  'Usaquén': { lat: 4.7200, lng: -74.0380 },
  'Chapinero': { lat: 4.6480, lng: -74.0620 },
  'Santa Fe': { lat: 4.6100, lng: -74.0700 },
  'San Cristóbal': { lat: 4.5700, lng: -74.0850 },
  'Usme': { lat: 4.5050, lng: -74.1100 },
  'Tunjuelito': { lat: 4.5750, lng: -74.1350 },
  'Bosa': { lat: 4.6150, lng: -74.1900 },
  'Kennedy': { lat: 4.6300, lng: -74.1550 },
  'Fontibón': { lat: 4.6750, lng: -74.1450 },
  'Engativá': { lat: 4.7050, lng: -74.1100 },
  'Suba': { lat: 4.7400, lng: -74.0850 },
  'Barrios Unidos': { lat: 4.6650, lng: -74.0750 },
  'Teusaquillo': { lat: 4.6400, lng: -74.0850 },
  'Los Mártires': { lat: 4.6050, lng: -74.0900 },
  'Antonio Nariño': { lat: 4.5900, lng: -74.1000 },
  'Puente Aranda': { lat: 4.6150, lng: -74.1150 },
  'La Candelaria': { lat: 4.5970, lng: -74.0730 },
  'Rafael Uribe Uribe': { lat: 4.5600, lng: -74.1150 },
  'Ciudad Bolívar': { lat: 4.5550, lng: -74.1500 },
  'Sumapaz': { lat: 4.1500, lng: -74.2500 },
};

const b = (id: string, nombre: string, localidad: string, lat: number, lng: number): Barrio =>
  ({ id: `bog-${id}`, nombre, localidad, ciudad: CIUDAD, lat, lng });

/**
 * Barrios semilla para el modo demo (coordenadas aproximadas del centro).
 * En producción se cargan los polígonos oficiales de barrios/sectores catastrales
 * desde IDECA (Infraestructura de Datos Espaciales de Bogotá) a la tabla `barrios`.
 */
export const BARRIOS_SEMILLA: Barrio[] = [
  b('santa-barbara', 'Santa Bárbara', 'Usaquén', 4.6960, -74.0330),
  b('cedritos', 'Cedritos', 'Usaquén', 4.7230, -74.0440),
  b('chapinero-alto', 'Chapinero Alto', 'Chapinero', 4.6486, -74.0577),
  b('chico', 'El Chicó', 'Chapinero', 4.6750, -74.0480),
  b('la-macarena', 'La Macarena', 'Santa Fe', 4.6130, -74.0660),
  b('20-de-julio', '20 de Julio', 'San Cristóbal', 4.5720, -74.0950),
  b('usme-centro', 'Usme Centro', 'Usme', 4.4760, -74.1260),
  b('venecia', 'Venecia', 'Tunjuelito', 4.5880, -74.1390),
  b('bosa-centro', 'Bosa Centro', 'Bosa', 4.6190, -74.1880),
  b('kennedy-central', 'Kennedy Central', 'Kennedy', 4.6283, -74.1517),
  b('castilla', 'Castilla', 'Kennedy', 4.6420, -74.1430),
  b('fontibon-centro', 'Fontibón Centro', 'Fontibón', 4.6730, -74.1460),
  b('normandia', 'Normandía', 'Engativá', 4.6640, -74.1050),
  b('suba-centro', 'Suba Centro', 'Suba', 4.7409, -74.0836),
  b('niza', 'Niza', 'Suba', 4.7170, -74.0700),
  b('doce-de-octubre', 'Doce de Octubre', 'Barrios Unidos', 4.6700, -74.0790),
  b('galerias', 'Galerías', 'Teusaquillo', 4.6430, -74.0760),
  b('la-soledad', 'La Soledad', 'Teusaquillo', 4.6340, -74.0730),
  b('santa-isabel', 'Santa Isabel', 'Los Mártires', 4.6050, -74.0960),
  b('restrepo', 'Restrepo', 'Antonio Nariño', 4.5900, -74.1030),
  b('ciudad-montes', 'Ciudad Montes', 'Puente Aranda', 4.6090, -74.1170),
  b('la-candelaria', 'La Candelaria', 'La Candelaria', 4.5970, -74.0730),
  b('quiroga', 'Quiroga', 'Rafael Uribe Uribe', 4.5780, -74.1140),
  b('lucero', 'Lucero', 'Ciudad Bolívar', 4.5520, -74.1510),
];

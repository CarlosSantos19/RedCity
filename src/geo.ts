/** Distancia en km entre dos coordenadas (fórmula de Haversine). */
export function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Desplaza un punto al azar hasta `metros` para no exponer la ubicación exacta de una casa. */
export function difuminar(lat: number, lng: number, metros = 150): { lat: number; lng: number } {
  const r = (Math.sqrt(Math.random()) * metros) / 111_320;
  const t = Math.random() * 2 * Math.PI;
  return { lat: lat + r * Math.cos(t), lng: lng + (r * Math.sin(t)) / Math.cos((lat * Math.PI) / 180) };
}

export function formatoDistancia(km: number): string {
  return km < 1 ? `${Math.round(km * 1000 / 50) * 50 || 50} m` : `${km.toFixed(1)} km`;
}

export function hace(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

function pedirPosicion(opciones: PositionOptions): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), reject, opciones);
  });
}

/**
 * Primero intenta el GPS preciso; si no responde (pasa mucho dentro de las casas), usa la ubicación
 * aproximada por wifi o antenas, que igual sirve para ubicar el barrio.
 */
export async function obtenerUbicacion(): Promise<{ lat: number; lng: number }> {
  if (!navigator.geolocation) throw new Error('Este dispositivo no permite ubicación');
  try {
    return await pedirPosicion({ enableHighAccuracy: true, timeout: 12000, maximumAge: 60_000 });
  } catch (e) {
    if ((e as GeolocationPositionError).code === 1) {
      throw new Error('No diste permiso de ubicación. Actívalo en Ajustes del celular → Aplicaciones → RedCity (o tu navegador) → Permisos → Ubicación, y vuelve a intentarlo');
    }
  }
  try {
    return await pedirPosicion({ enableHighAccuracy: false, timeout: 20000, maximumAge: 5 * 60_000 });
  } catch (e) {
    if ((e as GeolocationPositionError).code === 1) throw new Error('No diste permiso de ubicación. Actívalo en los ajustes del celular y vuelve a intentarlo');
    throw new Error('No pudimos encontrar tu ubicación. Revisa que la ubicación (GPS) del celular esté encendida, acércate a una ventana y vuelve a intentarlo');
  }
}

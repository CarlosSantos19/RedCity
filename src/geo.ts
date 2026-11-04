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

export function obtenerUbicacion(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Este dispositivo no permite geolocalización'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new Error(e.code === 1 ? 'Permiso de ubicación denegado' : 'No se pudo obtener la ubicación')),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

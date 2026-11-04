import { useEffect, useState } from 'react';
import { generarId } from './auth';

/**
 * Fotos en MODO DEMO: se comprimen en el navegador y se guardan en IndexedDB
 * (localStorage solo admite ~5 MB). En producción se suben a Supabase Storage
 * y aquí solo cambia la implementación de guardarFoto/leerFoto.
 */
const DB = 'vecindario-fotos';
const STORE = 'fotos';
export const MAX_FOTOS = 4;
const LADO_MAX = 1024;
const CALIDAD = 0.72;

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, modo).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Reduce la foto a máx. 1024 px y la convierte a JPEG (~100-200 KB). */
async function comprimir(archivo: File): Promise<Blob> {
  const img = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto'))), 'image/jpeg', CALIDAD));
}

/** Guarda una imagen ya procesada (p. ej. la foto de perfil recortada). */
export async function guardarBlob(blob: Blob): Promise<string> {
  const id = generarId();
  await tx('readwrite', (s) => s.put(blob, id));
  return id;
}

export async function guardarFoto(archivo: File): Promise<string> {
  if (!archivo.type.startsWith('image/')) throw new Error('El archivo no es una imagen');
  const blob = await comprimir(archivo);
  const id = generarId();
  await tx('readwrite', (s) => s.put(blob, id));
  return id;
}

export const DURACION_MAX_VIDEO_S = 60;
export const TAMANO_MAX_VIDEO_MB = 40;

/** Lee la duración de un video sin subirlo. */
function duracionVideo(archivo: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(archivo);
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer el video. Prueba con un MP4.')); };
    v.src = url;
  });
}

/** Valida y guarda un video corto. En producción se sube a Storage y se transcodifica. */
export async function guardarVideo(archivo: File): Promise<string> {
  if (!archivo.type.startsWith('video/')) throw new Error('El archivo no es un video.');
  if (archivo.size > TAMANO_MAX_VIDEO_MB * 1024 * 1024) throw new Error(`El video pesa más de ${TAMANO_MAX_VIDEO_MB} MB.`);
  const dur = await duracionVideo(archivo);
  if (dur > DURACION_MAX_VIDEO_S + 0.5) throw new Error(`El video dura ${Math.round(dur)} s. El máximo es ${DURACION_MAX_VIDEO_S} s.`);
  const id = generarId();
  await tx('readwrite', (s) => s.put(archivo, id));
  return id;
}

export async function borrarFoto(id: string): Promise<void> {
  if (esUrl(id)) return; // las fotos en la nube las borra su dueño desde el servidor
  await tx('readwrite', (s) => s.delete(id));
}

/** Las fotos ya subidas a la nube se guardan como dirección https; las locales como id de IndexedDB. */
export const esUrl = (id: string) => /^https?:\/\//.test(id);

/** Lee el archivo guardado en el dispositivo (para subirlo a la nube). */
export async function leerBlob(id: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>('readonly', (s) => s.get(id));
}

const cache = new Map<string, string>();

/** Devuelve una URL lista para <img src> o <video src>, o null mientras carga / si no existe. */
export function useFoto(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(id ? (esUrl(id) ? id : cache.get(id) ?? null) : null);
  useEffect(() => {
    if (!id) return setUrl(null);
    if (esUrl(id)) return setUrl(id);
    if (cache.has(id)) return setUrl(cache.get(id)!);
    let vivo = true;
    tx<Blob | undefined>('readonly', (s) => s.get(id))
      .then((blob) => {
        if (!blob || !vivo) return;
        const u = URL.createObjectURL(blob);
        cache.set(id, u);
        setUrl(u);
      })
      .catch(() => { /* foto no disponible en este dispositivo */ });
    return () => { vivo = false; };
  }, [id]);
  return url;
}

import { useEffect, useState } from 'react';

/** Evento que Chrome/Android dispara cuando la app se puede instalar en la pantalla de inicio. */
interface EventoInstalar extends Event { prompt: () => Promise<void> }

let pendiente: EventoInstalar | null = null;
const listeners = new Set<() => void>();

export function registrarPWA() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pendiente = e as EventoInstalar;
    listeners.forEach((l) => l());
  });
  // El service worker solo funciona en HTTPS o localhost; en desarrollo no se registra
  // para no servir archivos viejos mientras se programa.
  if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* sin modo offline */ });
  }
}

export function useInstalar(): (() => void) | null {
  const [, refrescar] = useState(0);
  useEffect(() => {
    const l = () => refrescar((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  if (!pendiente) return null;
  return () => { pendiente?.prompt(); pendiente = null; listeners.forEach((l) => l()); };
}

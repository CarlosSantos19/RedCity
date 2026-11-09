import { VAPID_PUBLICA } from './config';
import { supabase } from './sincronizar';

export type EstadoPush = 'no-disponible' | 'bloqueado' | 'apagado' | 'activo';

const disponible = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function bytesDeClave(b64: string) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** Espera el service worker, sin colgarse donde no existe (por ejemplo, en desarrollo). */
async function registro() {
  const r = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((ok) => setTimeout(() => ok(null), 4000))]);
  return r;
}

async function guardar(s: PushSubscription) {
  const j = s.toJSON();
  const { error } = await supabase.rpc('guardar_suscripcion_push', { p_endpoint: s.endpoint, p_p256dh: j.keys!.p256dh, p_auth: j.keys!.auth });
  if (error) throw error;
}

export async function estadoNotificaciones(): Promise<EstadoPush> {
  if (!disponible()) return 'no-disponible';
  if (Notification.permission === 'denied') return 'bloqueado';
  const r = await registro();
  if (!r) return 'no-disponible';
  return (await r.pushManager.getSubscription()) && Notification.permission === 'granted' ? 'activo' : 'apagado';
}

export async function activarNotificaciones(): Promise<EstadoPush> {
  if (!disponible()) return 'no-disponible';
  const permiso = await Notification.requestPermission();
  if (permiso === 'denied') return 'bloqueado';
  if (permiso !== 'granted') return 'apagado';
  const r = await registro();
  if (!r) return 'no-disponible';
  const s = (await r.pushManager.getSubscription()) ?? await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDeClave(VAPID_PUBLICA) });
  await guardar(s);
  return 'activo';
}

export async function desactivarNotificaciones(): Promise<EstadoPush> {
  const r = await registro();
  const s = await r?.pushManager.getSubscription();
  if (s) {
    await supabase.rpc('quitar_suscripcion_push', { p_endpoint: s.endpoint });
    await s.unsubscribe();
  }
  return 'apagado';
}

/** Al cerrar sesión: este celular deja de recibir los avisos de esa cuenta. */
export async function quitarDeEstaCuenta() {
  if (!disponible()) return;
  const s = await (await registro())?.pushManager.getSubscription();
  if (s) await supabase.rpc('quitar_suscripcion_push', { p_endpoint: s.endpoint });
}

/** Al entrar: si este celular ya tenía avisos, quedan a nombre de la cuenta que entró. */
export async function reafirmarSuscripcion() {
  if (!disponible() || Notification.permission !== 'granted') return;
  const s = await (await registro())?.pushManager.getSubscription();
  if (s) await guardar(s);
}

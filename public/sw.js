// Service worker de RedCity: permite abrir la app sin conexión.
// - Páginas: primero la red; si no hay internet, la última versión guardada.
// - Archivos de la app (JS, CSS, íconos): de la caché, actualizándose en segundo plano.
// - Mapas y otros dominios: no se guardan.
// Funciona igual en la raíz (localhost) que en una subcarpeta (GitHub Pages: /RedCity/).
const CACHE = 'redcity-v1';
const BASE = new URL(self.registration.scope).pathname; // p. ej. "/RedCity/"

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([BASE, `${BASE}manifest.webmanifest`, `${BASE}icono-192.png`])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { caches.open(CACHE).then((c) => c.put(BASE, res.clone())); return res; })
        .catch(() => caches.match(BASE)),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((guardado) => {
      const red = fetch(req).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      });
      return guardado || red;
    }),
  );
});

// ---------- Notificaciones (SOS y mensajes privados) ----------
self.addEventListener('push', (e) => {
  let a = {};
  try { a = e.data ? e.data.json() : {}; } catch { /* aviso sin datos */ }
  e.waitUntil(self.registration.showNotification(a.titulo || 'RedCity', {
    body: a.cuerpo || 'Tienes novedades en tu barrio.',
    icon: `${BASE}icono-192.png`,
    badge: `${BASE}icono-192.png`,
    tag: a.etiqueta,
    renotify: !!a.etiqueta,
    requireInteraction: !!a.urgente,
    vibrate: a.urgente ? [400, 150, 400, 150, 400] : [120],
    data: { url: a.url ? `${BASE}${a.url}` : BASE },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = (e.notification.data && e.notification.data.url) || BASE;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((vs) => {
    const v = vs.find((c) => new URL(c.url).pathname.startsWith(BASE));
    if (!v) return self.clients.openWindow(destino);
    // La app ya está abierta: le avisa qué publicación abrir
    if (destino !== BASE) v.postMessage({ tipo: 'abrir', url: destino });
    return v.focus();
  }));
});

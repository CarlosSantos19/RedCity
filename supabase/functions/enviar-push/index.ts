// RedCity · función "enviar-push"
// La llama la base de datos cuando entra un SOS, un mensaje privado o un aviso de la campanita, y envía la notificación
// a los celulares suscritos. Sin librerías: Web Push (RFC 8291 y RFC 8292) con WebCrypto.
// El aviso no incluye el texto del mensaje ni la ubicación: esos solo se ven dentro de la app.

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const texto = (s: string) => new TextEncoder().encode(s);
function unir(...partes: Uint8Array[]) {
  const r = new Uint8Array(partes.reduce((t, p) => t + p.length, 0));
  let i = 0;
  for (const p of partes) { r.set(p, i); i += p.length; }
  return r;
}

async function hkdf(sal: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const clave = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sal, info }, clave, bytes * 8));
}

/** Cifra el mensaje para un celular (aes128gcm, RFC 8291). */
export async function cifrar(contenido: Uint8Array, p256dh: string, auth: string) {
  const uaPublica = deB64url(p256dh);
  const secretoAuth = deB64url(auth);
  const efimera = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPublica = new Uint8Array(await crypto.subtle.exportKey('raw', efimera.publicKey));
  const clavePublicaUa = await crypto.subtle.importKey('raw', uaPublica, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clavePublicaUa }, efimera.privateKey, 256));
  const ikm = await hkdf(secretoAuth, compartido, unir(texto('WebPush: info\0'), uaPublica, asPublica), 32);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, texto('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, texto('Content-Encoding: nonce\0'), 12);
  const claveAes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, claveAes, unir(contenido, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 0x10, 0]);
  return unir(sal, rs, new Uint8Array([asPublica.length]), asPublica, cifrado);
}

/** Cabecera de autorización VAPID (RFC 8292). */
export async function cabeceraVapid(endpoint: string, publica: string, privada: string, ahora = Math.floor(Date.now() / 1000)) {
  const pub = deB64url(publica);
  const jwk = { kty: 'EC', crv: 'P-256', d: privada, x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), ext: true };
  const clave = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const cuerpo = (o: unknown) => b64url(texto(JSON.stringify(o)));
  const firmar = `${cuerpo({ typ: 'JWT', alg: 'ES256' })}.${cuerpo({ aud: new URL(endpoint).origin, exp: ahora + 12 * 3600, sub: 'mailto:redcity.soporte@gmail.com' })}`;
  const firma = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, clave, texto(firmar)));
  return `vapid t=${firmar}.${b64url(firma)}, k=${publica}`;
}

interface Suscripcion { endpoint: string; p256dh: string; auth: string }
interface Aviso { titulo: string; cuerpo: string; etiqueta: string; urgente: boolean; url?: string }

// ---------- Acceso a la base de datos, con los permisos del servidor ----------
const env = (k: string) => (globalThis as unknown as { Deno: { env: { get(k: string): string } } }).Deno.env.get(k);
const rest = (ruta: string, init: RequestInit = {}) => fetch(`${env('SUPABASE_URL')}/rest/v1/${ruta}`, {
  ...init, headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`, ...init.headers },
});
const leer = async <T,>(ruta: string): Promise<T[]> => {
  const r = await rest(ruta);
  if (!r.ok) throw new Error(`${ruta.split('?')[0]}: ${r.status}`);
  return r.json();
};
const lista = (ids: string[]) => `(${ids.map(encodeURIComponent).join(',')})`;

async function nombreDe(id: string) {
  return (await leer<{ nombre: string }>(`perfiles?id=eq.${id}&select=nombre`))[0]?.nombre ?? 'Un vecino';
}

async function prepararSos(id: string): Promise<{ para: string[]; aviso: Aviso } | null> {
  const [m] = await leer<{ red_id: string; autor_id: string }>(`mensajes_red?id=eq.${id}&select=red_id,autor_id`);
  if (!m) return null;
  const [red] = await leer<{ nombre: string }>(`redes?id=eq.${m.red_id}&select=nombre`);
  const miembros = await leer<{ perfil_id: string }>(`miembros_red?red_id=eq.${m.red_id}&perfil_id=neq.${m.autor_id}&select=perfil_id`);
  return {
    para: miembros.map((x) => x.perfil_id),
    aviso: { titulo: `🆘 SOS en ${red?.nombre ?? 'tu red'}`, cuerpo: `${await nombreDe(m.autor_id)} necesita ayuda. Abre RedCity para ver dónde.`, etiqueta: `sos-${id}`, urgente: true },
  };
}

async function prepararChat(id: string): Promise<{ para: string[]; aviso: Aviso } | null> {
  const [m] = await leer<{ conversacion_id: string; autor_id: string }>(`mensajes_privados?id=eq.${id}&select=conversacion_id,autor_id`);
  if (!m) return null;
  const [c] = await leer<{ perfil_a: string; perfil_b: string }>(`conversaciones?id=eq.${m.conversacion_id}&select=perfil_a,perfil_b`);
  if (!c) return null;
  const otro = c.perfil_a === m.autor_id ? c.perfil_b : c.perfil_a;
  return { para: [otro], aviso: { titulo: '💬 Mensaje nuevo', cuerpo: `${await nombreDe(m.autor_id)} te escribió en RedCity.`, etiqueta: `chat-${m.conversacion_id}`, urgente: false } };
}

/** Avisos de la campanita (comentarios, propuestas, alertas de seguridad): el texto ya lo armó la base de datos. */
async function prepararAviso(id: string): Promise<{ para: string[]; aviso: Aviso } | null> {
  const [a] = await leer<{ perfil_id: string; tipo: string; titulo: string; cuerpo: string; publicacion_id: string | null }>(
    `avisos?id=eq.${id}&select=perfil_id,tipo,titulo,cuerpo,publicacion_id`);
  if (!a) return null;
  return {
    para: [a.perfil_id],
    aviso: {
      titulo: a.titulo, cuerpo: a.cuerpo || 'Abre RedCity para verlo.',
      etiqueta: `aviso-${a.publicacion_id ?? id}`, urgente: a.tipo === 'seguridad',
      ...(a.publicacion_id ? { url: `?post=${a.publicacion_id}` } : {}),
    },
  };
}

async function enviar(s: Suscripcion, aviso: Aviso, publica: string, privada: string) {
  const r = await fetch(s.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await cabeceraVapid(s.endpoint, publica, privada),
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
      TTL: aviso.urgente ? '3600' : '86400', Urgency: aviso.urgente ? 'high' : 'normal',
    },
    body: await cifrar(texto(JSON.stringify(aviso)), s.p256dh, s.auth),
  });
  await r.body?.cancel();
  // El celular ya no existe o canceló el permiso: se borra para no insistir
  if (r.status === 404 || r.status === 410) await rest(`suscripciones_push?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' });
  return r.status;
}

function igual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function atender(req: Request): Promise<Response> {
  try {
    const ajustes = Object.fromEntries((await leer<{ clave: string; valor: string }>('ajustes_internos?select=clave,valor')).map((a) => [a.clave, a.valor]));
    if (!ajustes.secreto_push || !igual(req.headers.get('x-redcity-secreto') ?? '', ajustes.secreto_push)) return new Response('No autorizado', { status: 401 });
    const { tipo, id } = await req.json();
    if (!/^[0-9a-f-]{36}$/i.test(String(id)) || !['sos', 'chat', 'aviso'].includes(tipo)) return new Response('Datos no válidos', { status: 400 });
    if (!ajustes.vapid_publica || !ajustes.vapid_privada) return new Response('Falta configurar VAPID', { status: 500 });
    const envio = await (tipo === 'sos' ? prepararSos(id) : tipo === 'chat' ? prepararChat(id) : prepararAviso(id));
    if (!envio || envio.para.length === 0) return Response.json({ enviados: 0 });
    const subs = await leer<Suscripcion>(`suscripciones_push?perfil_id=in.${lista(envio.para)}&select=endpoint,p256dh,auth`);
    const estados = await Promise.allSettled(subs.map((s) => enviar(s, envio.aviso, ajustes.vapid_publica, ajustes.vapid_privada)));
    return Response.json({ enviados: estados.filter((e) => e.status === 'fulfilled' && e.value < 300).length, total: subs.length });
  } catch (e) {
    console.error('enviar-push', e);
    return new Response('Error interno', { status: 500 });
  }
}

const D = (globalThis as unknown as { Deno?: { serve(h: (r: Request) => Promise<Response>): void } }).Deno;
if (D) D.serve(atender);

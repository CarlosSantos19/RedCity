import { createClient, type Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { SUPABASE_KEY, SUPABASE_URL } from './config';
import { actualizarEstado, leerEstado, registrarGanchosNube } from '../store';
import type { Barrio, Cuenta, MotivoReporte, Post, Respuesta } from '../types';
import { esUrl, leerBlob } from '../fotos';
import { URL_APP } from '../marca';
import { errorClave, errorCorreo, normalizarCorreo } from '../auth';

/**
 * Sincronización con Supabase (Etapa 1): cuentas, perfil, barrios, publicaciones, comentarios,
 * me gusta, compartidos, reportes y fotos. El resto de módulos sigue en el dispositivo por ahora.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// ---------- Estado de la conexión (para la interfaz) ----------
interface EstadoNube {
  /** true mientras se revisa si hay una sesión guardada */
  iniciando: boolean;
  /** El vecino abrió el enlace de "recuperar contraseña" y debe escribir una nueva */
  recuperandoClave: boolean;
  /** Último error al hablar con el servidor (se muestra en un aviso) */
  error: string | null;
}
let en: EstadoNube = { iniciando: true, recuperandoClave: false, error: null };
const oyentes = new Set<() => void>();
const fijar = (c: Partial<EstadoNube>) => { en = { ...en, ...c }; oyentes.forEach((l) => l()); };
export const useNube = () => useSyncExternalStore((cb) => { oyentes.add(cb); return () => oyentes.delete(cb); }, () => en);
export const cerrarErrorNube = () => fijar({ error: null });

/** Barrio de la app (slug) ↔ id real en la base de datos */
const uuidBarrio = new Map<string, string>();
const slugBarrio = new Map<string, string>();

let uid: string | null = null;
let correo = '';

function mostrarError(contexto: string, e: unknown) {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  console.error(`[RedCity nube] ${contexto}:`, e);
  fijar({ error: `${contexto}. ${traducir(msg)}` });
}

/** Mensajes de Supabase en español. */
export function traducir(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Primero confirma tu correo: te enviamos un enlace al registrarte.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Ya existe una cuenta con este correo. Inicia sesión.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Se alcanzó el límite de intentos o de correos por hora. Espera unos minutos.';
  if (m.includes('password should be')) return 'La contraseña es muy corta.';
  if (m.includes('database error saving new user')) return 'No se pudo crear tu perfil. Revisa que elegiste tu barrio y aceptaste el tratamiento de datos.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sin conexión a internet.';
  if (m.includes('jwt') || m.includes('not authenticated')) return 'Tu sesión venció. Vuelve a iniciar sesión.';
  return msg;
}

// ---------- Barrios ----------
export async function cargarBarrios() {
  const { data, error } = await supabase.rpc('listar_barrios');
  if (error) return mostrarError('No se pudieron cargar los barrios', error);
  const barrios: Barrio[] = (data as { id: string; slug: string; nombre: string; localidad: string; ciudad: string; lat: number; lng: number }[])
    .map((b) => {
      uuidBarrio.set(b.slug, b.id);
      slugBarrio.set(b.id, b.slug);
      return { id: b.slug, nombre: b.nombre, localidad: b.localidad, ciudad: b.ciudad, lat: b.lat, lng: b.lng };
    });
  if (barrios.length) actualizarEstado((s) => ({ ...s, barrios }));
}

// ---------- Cuentas ----------
export interface DatosRegistroNube {
  nombre: string;
  correo: string;
  clave: string;
  /** slug del barrio elegido, o vacío si crea uno nuevo */
  barrio: string;
  barrioNuevo?: string;
  localidad: string;
  gps?: { lat: number; lng: number };
}

/** Devuelve error, o confirmarCorreo=true si debe abrir el enlace que le llegó al correo. */
export async function registrarEnNube(d: DatosRegistroNube): Promise<{ error?: string; confirmarCorreo?: boolean }> {
  const c = normalizarCorreo(d.correo);
  const err = errorCorreo(c) ?? errorClave(d.clave);
  if (err) return { error: err };
  const { data, error } = await supabase.auth.signUp({
    email: c,
    password: d.clave,
    options: {
      emailRedirectTo: URL_APP,
      // El servidor crea el perfil con estos datos y calcula él mismo si queda verificado
      data: {
        nombre: d.nombre.trim(), barrio: d.barrio, barrio_nuevo: d.barrioNuevo ?? '', localidad: d.localidad,
        habeas: true, gps: !!d.gps, ...(d.gps ? { lat: d.gps.lat, lng: d.gps.lng } : {}),
      },
    },
  });
  if (error) return { error: traducir(error.message) };
  // Supabase no revela si el correo ya existía: en ese caso devuelve un usuario sin identidades
  if (data.user && data.user.identities?.length === 0) return { error: 'Ya existe una cuenta con este correo. Inicia sesión.' };
  if (!data.session) return { confirmarCorreo: true };
  return {};
}

export async function iniciarSesionEnNube(correoTexto: string, clave: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email: normalizarCorreo(correoTexto), password: clave });
  return error ? traducir(error.message) : null;
}

export async function recuperarClave(correoTexto: string): Promise<string | null> {
  const c = normalizarCorreo(correoTexto);
  if (errorCorreo(c)) return 'Escribe el correo con el que te registraste.';
  const { error } = await supabase.auth.resetPasswordForEmail(c, { redirectTo: URL_APP });
  return error ? traducir(error.message) : null;
}

export async function guardarNuevaClave(clave: string): Promise<string | null> {
  const err = errorClave(clave);
  if (err) return err;
  const { error } = await supabase.auth.updateUser({ password: clave });
  if (error) return traducir(error.message);
  fijar({ recuperandoClave: false });
  return null;
}

interface FilaPerfil {
  id: string; nombre: string; barrio_slug: string; lat: number; lng: number; verificado: boolean; radio_m: number;
  bio: string | null; redes: Record<string, string> | null; oficios: string[] | null; visibilidad_foto: string; creado_en: string;
}

/** Con una sesión activa: carga mi perfil del servidor y lo pone como usuario de la app. */
async function entrar(sesion: Session) {
  uid = sesion.user.id;
  correo = sesion.user.email ?? '';
  const { data, error } = await supabase.rpc('mi_perfil');
  const p = (data as FilaPerfil[] | null)?.[0];
  if (error || !p) {
    mostrarError('No se encontró tu perfil', error ?? new Error('Perfil inexistente'));
    return;
  }
  const local = leerEstado().cuentas.find((c) => c.id === p.id);
  const cuenta: Cuenta = {
    // Lo que aún no está en la nube (foto, documentos, guardados…) se conserva del dispositivo
    ...local,
    id: p.id, nombre: p.nombre, correo, barrioId: p.barrio_slug, lat: p.lat, lng: p.lng, verificado: p.verificado,
    radioKm: local?.radioKm ?? Math.min(2, Math.max(0.5, p.radio_m / 1000)),
    bio: p.bio ?? local?.bio, oficios: p.oficios?.length ? p.oficios : local?.oficios,
    hashClave: '', sal: '', creado: Date.parse(p.creado_en),
  };
  actualizarEstado((s) => ({ ...s, cuentas: [...s.cuentas.filter((c) => c.id !== p.id), cuenta], sesionId: p.id }));
  await cargarFeed();
}

function salir() {
  uid = null;
  actualizarEstado((s) => ({ ...s, sesionId: null }));
}

// ---------- Publicaciones ----------
interface FilaFeed {
  id: string; categoria: Post['categoria']; titulo: string; descripcion: string; datos: Record<string, unknown>; fotos: string[];
  empresa_id: string | null; autor_id: string; autor: string; autor_verificado: boolean; barrio_slug: string;
  lat: number; lng: number; creado_en: string; compartidos: number; oculta: boolean; me_gusta: string[]; respuestas: Respuesta[];
}

/** Campos que cambian por las interacciones que AÚN viven en el dispositivo (Etapa 2): se conservan al refrescar. */
const CAMPOS_LOCALES: Partial<Record<Post['categoria'], string[]>> = {
  servicio: ['estado', 'postulaciones', 'asignadoId', 'realizados'],
  seguridad: ['confirmaciones'],
  evento: ['asistentes'],
  garaje: ['asistentes', 'articulos'],
  trueque: ['estado'],
};

function fusionar(nueva: Post, local?: Post): Post {
  if (!local) return nueva;
  const r: Record<string, unknown> = { ...nueva };
  for (const campo of CAMPOS_LOCALES[nueva.categoria] ?? []) r[campo] = (local as unknown as Record<string, unknown>)[campo];
  return r as unknown as Post;
}

let cargandoFeed = false;
export async function cargarFeed() {
  if (!uid || cargandoFeed) return;
  cargandoFeed = true;
  try {
    const { data, error } = await supabase.rpc('feed_cercano', { p_radio_m: 5000, p_limite: 300 });
    if (error) return mostrarError('No se pudieron cargar las publicaciones', error);
    const anteriores = new Map(leerEstado().posts.map((p) => [p.id, p]));
    const deLaNube: Post[] = (data as FilaFeed[]).map((f) => fusionar({
      ...(f.datos as object),
      id: f.id, categoria: f.categoria, titulo: f.titulo, descripcion: f.descripcion, fotos: f.fotos ?? [],
      empresaId: f.empresa_id ?? undefined, autorId: f.autor_id, autor: f.autor, autorVerificado: f.autor_verificado,
      barrioId: f.barrio_slug, lat: f.lat, lng: f.lng, creado: Date.parse(f.creado_en),
      compartidos: f.compartidos, oculta: f.oculta, meGusta: f.me_gusta ?? [],
      respuestas: (f.respuestas ?? []).map((r) => ({ ...r, creado: Number(r.creado) })),
    } as Post, anteriores.get(f.id)));
    const ids = new Set(deLaNube.map((p) => p.id));
    // Se conservan: lo que es solo del dispositivo y lo que se está publicando en este momento
    const pendientes = leerEstado().posts.filter((p) => p.local || (enVuelo.has(p.id) && !ids.has(p.id)));
    actualizarEstado((s) => ({ ...s, posts: [...pendientes, ...deLaNube] }));
  } finally {
    cargandoFeed = false;
  }
}

/** Publicaciones que se están subiendo (para que un refresco no las haga "desaparecer"). */
const enVuelo = new Set<string>();

/** Sube a Storage las fotos que estén guardadas en el dispositivo y devuelve sus direcciones públicas. */
async function subirFotos(ids: string[]): Promise<string[]> {
  const urls: string[] = [];
  for (const id of ids) {
    if (esUrl(id)) { urls.push(id); continue; }
    const blob = await leerBlob(id);
    if (!blob) continue;
    const ruta = `${uid}/${crypto.getRandomValues(new Uint32Array(2)).join('')}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('publicaciones').upload(ruta, blob, { contentType: blob.type || 'image/jpeg' });
    if (error) throw error;
    urls.push(supabase.storage.from('publicaciones').getPublicUrl(ruta).data.publicUrl);
  }
  return urls;
}

/** Campos comunes que van en columnas propias; el resto (lo de cada categoría) va en "datos". */
const BASE = new Set(['id', 'categoria', 'titulo', 'descripcion', 'autorId', 'autor', 'autorVerificado', 'barrioId', 'lat', 'lng',
  'creado', 'respuestas', 'fotos', 'oculta', 'meGusta', 'compartidos', 'empresaId', 'local']);

/** Fecha en que la publicación deja de mostrarse (eventos, ventas de garaje, ofertas). */
function expira(p: Post): string | null {
  if (p.categoria === 'garaje') return new Date(p.fin).toISOString();
  if (p.categoria === 'evento') return new Date(new Date(p.fecha).getTime() + 12 * 3600_000).toISOString();
  if (p.categoria === 'oferta' && p.vence) return new Date(`${p.vence}T23:59:59`).toISOString();
  return null;
}

async function publicar(post: Post) {
  enVuelo.add(post.id);
  try {
    const fotos = await subirFotos(post.fotos ?? []);
    const datos = Object.fromEntries(Object.entries(post).filter(([k]) => !BASE.has(k)));
    const barrio = uuidBarrio.get(post.barrioId);
    if (!barrio) throw new Error('Tu barrio no está en el servidor.');
    const { error } = await supabase.from('publicaciones').insert({
      id: post.id, autor_id: uid, barrio_id: barrio, categoria: post.categoria,
      titulo: post.titulo, descripcion: post.descripcion, datos, fotos,
      ubicacion: `SRID=4326;POINT(${post.lng} ${post.lat})`, expira_en: expira(post),
    });
    if (error) throw error;
    actualizarEstado((s) => ({ ...s, posts: s.posts.map((p) => (p.id === post.id ? { ...p, fotos } : p)) }));
  } catch (e) {
    mostrarError('No se pudo publicar', e);
    actualizarEstado((s) => ({ ...s, posts: s.posts.filter((p) => p.id !== post.id) }));
  } finally {
    enVuelo.delete(post.id);
    void cargarFeed();
  }
}

async function intentar(contexto: string, op: PromiseLike<{ error: unknown }>) {
  const { error } = await op;
  if (error) { mostrarError(contexto, error); void cargarFeed(); }
}

// ---------- Arranque ----------
let iniciado = false;
export async function iniciarNube() {
  if (iniciado) return;
  iniciado = true;

  registrarGanchosNube({
    publicar: (p) => void publicar(p),
    eliminar: (id) => void intentar('No se pudo eliminar', supabase.from('publicaciones').delete().eq('id', id)),
    responder: (id, texto) => void intentar('No se pudo comentar',
      supabase.from('respuestas').insert({ publicacion_id: id, autor_id: uid, texto }).then((r) => { void cargarFeed(); return r; })),
    meGusta: (id, activo) => void intentar('No se pudo guardar el me gusta', activo
      ? supabase.from('me_gusta').insert({ publicacion_id: id, perfil_id: uid })
      : supabase.from('me_gusta').delete().eq('publicacion_id', id).eq('perfil_id', uid!)),
    compartido: (id) => void intentar('No se pudo contar el compartido', supabase.rpc('sumar_compartido', { p_id: id })),
    reportar: (id, motivo: MotivoReporte) => void intentar('No se pudo enviar el reporte',
      supabase.from('reportes').insert({ publicacion_id: id, reportado_por: uid, motivo }).then((r) => { void cargarFeed(); return r; })),
    actualizarNombre: (nombre) => void intentar('No se pudo cambiar el nombre', supabase.from('perfiles').update({ nombre }).eq('id', uid!)),
    cerrarSesion: () => { void supabase.auth.signOut(); uid = null; },
  });

  supabase.auth.onAuthStateChange((evento, sesion) => {
    if (evento === 'PASSWORD_RECOVERY') fijar({ recuperandoClave: true });
    if (evento === 'SIGNED_OUT') salir();
    // Se difiere para no llamar a Supabase dentro de su propio aviso (recomendación de la librería)
    if ((evento === 'SIGNED_IN' || evento === 'INITIAL_SESSION') && sesion && sesion.user.id !== uid) setTimeout(() => void entrar(sesion), 0);
    if (evento === 'INITIAL_SESSION' && !sesion) salir();
  });

  await cargarBarrios();
  const { data } = await supabase.auth.getSession();
  if (data.session) await entrar(data.session);
  fijar({ iniciando: false });

  // Refresco periódico del feed (cada 20 s con la app visible) y al volver a la pestaña
  setInterval(() => { if (document.visibilityState === 'visible') void cargarFeed(); }, 20_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void cargarFeed(); });
}

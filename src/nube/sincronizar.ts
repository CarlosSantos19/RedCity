import { createClient, type Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { SUPABASE_KEY, SUPABASE_URL } from './config';
import { actualizarEstado, leerEstado, registrarGanchosNube } from '../store';
import type { Barrio, Calificacion, Conversacion, Cuenta, MensajePrivado, MensajeRed, MotivoReporte, Pago, Post, Postulacion, Red, Respuesta } from '../types';
import { leerUI, nav } from '../ui';
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
  if (m.includes('database error saving new user')) return 'No se pudo crear tu perfil. Revisa que elegiste tu barrio y aceptaste el tratamiento de datos. Si escribiste un barrio nuevo, puede que ya exista: búscalo en la lista.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sin conexión a internet.';
  if (m.includes('jwt') || m.includes('not authenticated')) return 'Tu sesión venció. Vuelve a iniciar sesión.';
  return msg;
}

// ---------- Barrios ----------
export async function cargarBarrios() {
  const { data, error } = await supabase.rpc('listar_barrios');
  if (error) return mostrarError('No se pudieron cargar los barrios', error);
  const barrios: Barrio[] = (data as { id: string; slug: string; nombre: string; localidad: string; ciudad: string; departamento: string; lat: number; lng: number }[])
    .map((b) => {
      uuidBarrio.set(b.slug, b.id);
      slugBarrio.set(b.id, b.slug);
      return { id: b.slug, nombre: b.nombre, localidad: b.localidad, ciudad: b.ciudad, departamento: b.departamento, lat: b.lat, lng: b.lng };
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
  /** Localidad/comuna del barrio nuevo (opcional) */
  localidad: string;
  /** Municipio y departamento del barrio nuevo */
  ciudad?: string;
  departamento?: string;
  codigoMunicipio?: string;
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
        ciudad: d.ciudad ?? '', departamento: d.departamento ?? '', codigo_municipio: d.codigoMunicipio ?? '',
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
  await Promise.all([cargarBloqueos(), cargarFeed(), cargarRedes(), cargarChats()]);
  await cargarServicios();
  escucharTiempoReal();
}

function salir() {
  dejarDeEscuchar();
  uid = null;
  actualizarEstado((s) => ({ ...s, sesionId: null, bloqueos: [], reportesUsuario: [] }));
}

// ---------- Publicaciones ----------
interface FilaFeed {
  id: string; categoria: Post['categoria']; titulo: string; descripcion: string; datos: Record<string, unknown>; fotos: string[];
  empresa_id: string | null; autor_id: string; autor: string; autor_verificado: boolean; barrio_slug: string;
  lat: number; lng: number; creado_en: string; compartidos: number; oculta: boolean; me_gusta: string[]; respuestas: Respuesta[];
}

/** Campos que cambian por las interacciones que AÚN viven en el dispositivo (Etapa 2): se conservan al refrescar. */
const CAMPOS_LOCALES: Partial<Record<Post['categoria'], string[]>> = {
  servicio: ['postulaciones'], // el estado lo decide el servidor; las propuestas se recargan en cargarServicios()
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

/** Igual que intentar(), pero siempre refresca las redes (el servidor puede cambiar coordinadores, etc.). */
async function intentarRedes(contexto: string, op: PromiseLike<{ error: unknown }>) {
  const { error } = await op;
  if (error) mostrarError(contexto, error);
  await cargarRedes();
}

// ---------- Bloqueos y reportes de vecinos ----------
export async function cargarBloqueos() {
  const yo = uid;
  if (!yo) return;
  const [bloqueos, reportes] = await Promise.all([
    supabase.rpc('mis_bloqueos'),
    supabase.from('reportes_usuario').select('id, reportado_id, motivo, creado_en'),
  ]);
  if (bloqueos.error || reportes.error) return; // sin esto la app sigue funcionando; el servidor igual hace cumplir los bloqueos
  actualizarEstado((s) => ({
    ...s,
    bloqueos: (bloqueos.data as { bloqueado: string; nombre: string }[]).map((b) => ({ de: yo, a: b.bloqueado, nombre: b.nombre })),
    reportesUsuario: (reportes.data as { id: string; reportado_id: string; motivo: MotivoReporte; creado_en: string }[]).map((r) => ({
      id: r.id, reportadoId: r.reportado_id, porId: yo, motivo: r.motivo, detalle: '', creado: Date.parse(r.creado_en),
    })),
  }));
}

/** Tras bloquear o desbloquear, el servidor es quien decide qué se ve. */
const refrescarTrasBloqueo = () => { void cargarBloqueos(); void cargarFeed(); void cargarChats(); };

// ---------- Etapa 2b: servicios (propuestas, pagos, calificaciones) ----------
interface FilaPostulacion { id: string; publicacion_id: string; proveedor_id: string; proveedor: string; verificado: boolean; precio: number; mensaje: string; creado_en: string }
interface FilaPago { id: string; publicacion_id: string; titulo: string; cliente_id: string; proveedor_id: string; proveedor: string; valor: number; pasarela: number; total: number; comision: number; neto: number; estado: Pago['estado']; creado_en: string }
interface FilaCalificacion { pago_id: string; de_id: string; de_nombre: string; para_id: string; estrellas: number; comentario: string; creado_en: string }

let cargandoServicios = false;
export async function cargarServicios() {
  if (!uid || cargandoServicios) return;
  cargandoServicios = true;
  try {
    const posts = leerEstado().posts;
    const servicios = posts.filter((p) => p.categoria === 'servicio' && p.modo === 'necesito' && !p.local).map((p) => p.id);
    const [props, pagosR] = await Promise.all([
      servicios.length ? supabase.rpc('postulaciones_visibles', { p_ids: servicios }) : Promise.resolve({ data: [], error: null }),
      supabase.rpc('mis_pagos'),
    ]);
    if (props.error) return mostrarError('No se pudieron cargar las propuestas', props.error);
    if (pagosR.error) return mostrarError('No se pudieron cargar los pagos', pagosR.error);

    const porPost = new Map<string, Postulacion[]>();
    for (const p of (props.data ?? []) as FilaPostulacion[]) {
      const lista = porPost.get(p.publicacion_id) ?? [];
      lista.push({ id: p.id, proveedorId: p.proveedor_id, proveedor: p.proveedor, verificado: p.verificado, precio: Number(p.precio), mensaje: p.mensaje, creado: Date.parse(p.creado_en) });
      porPost.set(p.publicacion_id, lista);
    }
    const pagos: Pago[] = ((pagosR.data ?? []) as FilaPago[]).map((p) => ({
      id: p.id, postId: p.publicacion_id, titulo: p.titulo, clienteId: p.cliente_id, proveedorId: p.proveedor_id, proveedor: p.proveedor,
      valor: Number(p.valor), pasarela: Number(p.pasarela), total: Number(p.total), comision: Number(p.comision), neto: Number(p.neto),
      estado: p.estado, creado: Date.parse(p.creado_en),
    }));

    // Reputación: autores del feed, proveedores que se postularon y yo
    const personas = new Set<string>([uid, ...posts.map((p) => p.autorId)]);
    for (const l of porPost.values()) for (const p of l) personas.add(p.proveedorId);
    const cal = await supabase.rpc('calificaciones_de', { p_ids: [...personas] });
    if (cal.error) return mostrarError('No se pudieron cargar las calificaciones', cal.error);
    const calificaciones: Calificacion[] = ((cal.data ?? []) as FilaCalificacion[]).map((c) => ({
      id: c.pago_id + '-' + c.de_id, pagoId: c.pago_id, deId: c.de_id, deNombre: c.de_nombre, paraId: c.para_id,
      estrellas: c.estrellas, comentario: c.comentario, creado: Date.parse(c.creado_en),
    }));

    actualizarEstado((s) => ({
      ...s, pagos, calificaciones,
      posts: s.posts.map((p) => (p.categoria === 'servicio' && p.modo === 'necesito' && !p.local ? { ...p, postulaciones: porPost.get(p.id) ?? [] } : p)),
    }));
  } finally {
    cargandoServicios = false;
  }
}

/**
 * Las acciones de servicios van al servidor EN FILA, en el orden en que el vecino tocó los botones.
 * Sin esto, "Pagar" y luego "Confirmar" tocados rápido podían llegar al revés al servidor
 * (la app muestra el pago al instante, pero el servidor aún lo estaba procesando).
 */
let filaServicios: Promise<void> = Promise.resolve();
function servicio(contexto: string, crear: () => PromiseLike<{ error: unknown }>): Promise<void> {
  const tarea = async () => {
    const { error } = await crear();
    if (error) mostrarError(contexto, error);
  };
  filaServicios = filaServicios.then(tarea, tarea);
  const hecha = filaServicios;
  // Al terminar todo lo pendiente, se recarga el estado real desde el servidor
  void hecha.then(async () => { if (filaServicios === hecha) { await cargarFeed(); await cargarServicios(); } });
  return hecha;
}

// ---------- Etapa 2: redes de seguridad y apoyo ----------
interface RedNube {
  id: string; nombre: string; tipo: Red['tipo']; descripcion: string; barrio: string; privada: boolean; codigo: string | null;
  creador: string; creado: number; total: number; miembros: Red['miembros'];
  mensajes: (Omit<MensajeRed, 'lat' | 'lng'> & { lat: number | null; lng: number | null })[];
}
/** Redes que se están creando (para que un refresco no las haga desaparecer). */
const redesEnVuelo = new Set<string>();

let cargandoRedes = false;
export async function cargarRedes() {
  if (!uid || cargandoRedes) return;
  cargandoRedes = true;
  try {
    const { data, error } = await supabase.rpc('redes_visibles');
    if (error) return mostrarError('No se pudieron cargar las redes', error);
    const redes: Red[] = ((data ?? []) as RedNube[]).map((r) => ({
      id: r.id, nombre: r.nombre, tipo: r.tipo, descripcion: r.descripcion, barrioId: r.barrio, privada: r.privada,
      codigo: r.codigo ?? '', creadorId: r.creador, creado: Number(r.creado), totalMiembros: Number(r.total),
      miembros: r.miembros.map((m) => ({ ...m, unido: Number(m.unido) })),
      mensajes: r.mensajes.map((m) => ({
        ...m, creado: Number(m.creado), lat: m.lat ?? undefined, lng: m.lng ?? undefined,
        respuestas: m.respuestas.map((x) => ({ ...x, creado: Number(x.creado) })),
      })),
    }));
    const ids = new Set(redes.map((r) => r.id));
    const pendientes = leerEstado().redes.filter((r) => redesEnVuelo.has(r.id) && !ids.has(r.id));
    actualizarEstado((s) => ({ ...s, redes: [...pendientes, ...redes] }));
  } finally {
    cargandoRedes = false;
  }
}

/** Unirse a una red (incluso privada) con su código. Devuelve el id de la red o un error. */
export async function unirsePorCodigoNube(codigo: string): Promise<{ redId?: string; error?: string }> {
  const { data, error } = await supabase.rpc('unirse_por_codigo', { p_codigo: codigo.trim() });
  if (error) return { error: traducir(error.message) };
  if (!data) return { error: 'No encontramos una red con ese código. Revisa que esté bien escrito.' };
  await cargarRedes();
  return { redId: data as string };
}

const punto = (lat: number, lng: number) => `SRID=4326;POINT(${lng} ${lat})`;

// ---------- Etapa 2: chat privado ----------
/** Conversación local → promesa con su id real en el servidor (puede cambiar si ya existía). */
const convPendientes = new Map<string, Promise<string>>();
const mensajesEnVuelo = new Set<string>();

let cargandoChats = false;
export async function cargarChats() {
  if (!uid || cargandoChats) return;
  cargandoChats = true;
  try {
    const { data: convs, error } = await supabase.rpc('mis_conversaciones');
    if (error) return mostrarError('No se pudieron cargar los mensajes', error);
    const filas = (convs ?? []) as { id: string; otro: string; otro_nombre: string; publicacion_id: string | null; publicacion_titulo: string | null; mi_lectura: string | null }[];
    const ids = filas.map((c) => c.id);
    let msgs: { id: string; conversacion_id: string; autor_id: string; texto: string; foto_path: string | null; creado_en: string }[] = [];
    if (ids.length) {
      const r = await supabase.from('mensajes_privados').select('id, conversacion_id, autor_id, texto, foto_path, creado_en')
        .in('conversacion_id', ids).order('creado_en').limit(2000);
      if (r.error) return mostrarError('No se pudieron cargar los mensajes', r.error);
      msgs = r.data ?? [];
    }
    // Las fotos del chat son privadas: se entregan con enlaces firmados de 1 hora
    const rutas = msgs.map((m) => m.foto_path).filter((x): x is string => !!x);
    const firmadas = new Map<string, string>();
    if (rutas.length) {
      const { data } = await supabase.storage.from('chat').createSignedUrls(rutas, 3600);
      for (const f of data ?? []) if (f.path && f.signedUrl) firmadas.set(f.path, f.signedUrl);
    }
    const miNombre = leerEstado().usuario?.nombre ?? '';
    const anteriores = new Map(leerEstado().conversaciones.map((c) => [c.id, c]));
    const conversaciones: Conversacion[] = filas.map((c) => {
      const deNube = msgs.filter((m) => m.conversacion_id === c.id).map((m) => ({
        id: m.id, autorId: m.autor_id, texto: m.texto, creado: Date.parse(m.creado_en),
        foto: m.foto_path ? firmadas.get(m.foto_path) : undefined,
      }));
      const vistos = new Set(deNube.map((m) => m.id));
      const enviando = (anteriores.get(c.id)?.mensajes ?? []).filter((m) => mensajesEnVuelo.has(m.id) && !vistos.has(m.id));
      return {
        id: c.id, participantes: [uid!, c.otro], nombres: { [uid!]: miNombre, [c.otro]: c.otro_nombre },
        postId: c.publicacion_id ?? undefined, postTitulo: c.publicacion_titulo ?? undefined,
        mensajes: [...deNube, ...enviando], leido: { [uid!]: c.mi_lectura ? Date.parse(c.mi_lectura) : 0 },
      };
    });
    const vivas = new Set(conversaciones.map((c) => c.id));
    const nuevasLocales = leerEstado().conversaciones.filter((c) => convPendientes.has(c.id) && !vivas.has(c.id));
    actualizarEstado((s) => ({ ...s, conversaciones: [...nuevasLocales, ...conversaciones] }));
  } finally {
    cargandoChats = false;
  }
}

async function abrirConversacion(convId: string, otroId: string, postId?: string) {
  const promesa = (async () => {
    const { data, error } = await supabase.rpc('abrir_conversacion', {
      p_id: convId, p_otro: otroId, p_publicacion: postId && /^[0-9a-f-]{36}$/.test(postId) ? postId : null,
    });
    if (error) throw error;
    const real = data as string;
    if (real !== convId) {
      // Ya existía una conversación con ese vecino: se usa la del servidor
      actualizarEstado((s) => ({ ...s, conversaciones: s.conversaciones.filter((c) => c.id !== convId) }));
      if (leerUI().chatId === convId) nav.chat(real);
    }
    return real;
  })();
  convPendientes.set(convId, promesa);
  try { await promesa; } catch (e) { mostrarError('No se pudo abrir la conversación', e); }
  finally { await cargarChats(); convPendientes.delete(convId); }
}

async function enviarPrivado(convId: string, m: MensajePrivado) {
  mensajesEnVuelo.add(m.id);
  try {
    const real = await (convPendientes.get(convId) ?? Promise.resolve(convId));
    let foto_path: string | null = null;
    if (m.foto && !esUrl(m.foto)) {
      const blob = await leerBlob(m.foto);
      if (blob) {
        foto_path = `${real}/${uid}-${Date.now()}.jpg`;
        const { error } = await supabase.storage.from('chat').upload(foto_path, blob, { contentType: blob.type || 'image/jpeg' });
        if (error) throw error;
      }
    }
    const { error } = await supabase.from('mensajes_privados').insert({ id: m.id, conversacion_id: real, autor_id: uid, texto: m.texto, foto_path });
    if (error) throw error;
  } catch (e) {
    mostrarError('No se pudo enviar el mensaje', e);
  } finally {
    mensajesEnVuelo.delete(m.id);
    void cargarChats();
  }
}

// ---------- Tiempo real ----------
// Supabase avisa al instante de SOS, respuestas, miembros y mensajes nuevos (respetando RLS).
let canal: ReturnType<typeof supabase.channel> | null = null;
const temporizadores: Record<string, ReturnType<typeof setTimeout>> = {};
function programar(que: 'redes' | 'chats' | 'feed' | 'servicios') {
  clearTimeout(temporizadores[que]);
  temporizadores[que] = setTimeout(() => void (que === 'redes' ? cargarRedes() : que === 'chats' ? cargarChats() : que === 'servicios' ? cargarFeed().then(cargarServicios) : cargarFeed()), 250);
}
function escucharTiempoReal() {
  if (canal) return;
  canal = supabase.channel('redcity-cambios')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes_red' }, () => programar('redes'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'respuestas_alerta' }, () => programar('redes'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'miembros_red' }, () => programar('redes'))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_privados' }, () => programar('chats'))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversaciones' }, () => programar('chats'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'postulaciones' }, () => programar('servicios'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos' }, () => programar('servicios'))
    .subscribe();
}
function dejarDeEscuchar() {
  if (canal) void supabase.removeChannel(canal);
  canal = null;
}

// ---------- Eliminar mi cuenta (exigido por Google Play y la Ley 1581) ----------
/** Borra mis archivos de Storage y luego mi cuenta con todos mis datos. Devuelve error o null. */
export async function eliminarCuentaNube(): Promise<string | null> {
  if (!uid) return 'Inicia sesión para eliminar tu cuenta.';
  try {
    // 1) Archivos: solo se pueden borrar por la API de Storage (no desde SQL)
    for (const bucket of ['publicaciones', 'avatares']) {
      const { data } = await supabase.storage.from(bucket).list(uid, { limit: 1000 });
      const rutas = (data ?? []).map((f) => `${uid}/${f.name}`);
      if (rutas.length) await supabase.storage.from(bucket).remove(rutas);
    }
    const { data: fotosChat } = await supabase.from('mensajes_privados').select('foto_path').eq('autor_id', uid).not('foto_path', 'is', null);
    const rutasChat = (fotosChat ?? []).map((m) => m.foto_path as string);
    if (rutasChat.length) await supabase.storage.from('chat').remove(rutasChat);
    // 2) La cuenta y, en cascada, todos los datos personales (los pagos quedan anónimos para la contabilidad)
    const { error } = await supabase.rpc('eliminar_mi_cuenta');
    if (error) return traducir(error.message);
  } catch (e) {
    return traducir(e instanceof Error ? e.message : String(e));
  }
  dejarDeEscuchar();
  await supabase.auth.signOut().catch(() => { /* la sesión ya no existe */ });
  uid = null;
  try { localStorage.removeItem('redcity_nube_v1'); } catch { /* sin almacenamiento */ }
  actualizarEstado((s) => ({ ...s, sesionId: null, cuentas: [], posts: [], redes: [], conversaciones: [], pagos: [], calificaciones: [] }));
  return null;
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
    cerrarSesion: () => { dejarDeEscuchar(); void supabase.auth.signOut(); uid = null; },

    // Etapa 2: redes
    crearRed: (red) => {
      redesEnVuelo.add(red.id);
      void (async () => {
        const barrio = uuidBarrio.get(red.barrioId);
        const { error } = await supabase.from('redes').insert({
          id: red.id, nombre: red.nombre, tipo: red.tipo, descripcion: red.descripcion, privada: red.privada,
          barrio_id: barrio, creado_por: uid,
        });
        if (error) mostrarError('No se pudo crear la red', error);
        redesEnVuelo.delete(red.id);
        await cargarRedes(); // trae el código de invitación que genera el servidor
      })();
    },
    unirseRed: (id) => void intentarRedes('No se pudo unir a la red', supabase.from('miembros_red').insert({ red_id: id, perfil_id: uid, rol: 'miembro' })),
    salirRed: (id) => void intentarRedes('No se pudo salir de la red', supabase.from('miembros_red').delete().eq('red_id', id).eq('perfil_id', uid!)),
    quitarMiembro: (id, quien) => void intentarRedes('No se pudo quitar al miembro', supabase.from('miembros_red').delete().eq('red_id', id).eq('perfil_id', quien)),
    mensajeRed: (redId, m) => void intentarRedes(m.tipo === 'sos' ? '⚠️ NO SE PUDO ENVIAR EL SOS. Llama al 123' : 'No se pudo enviar el mensaje',
      supabase.from('mensajes_red').insert({
        id: m.id, red_id: redId, autor_id: uid, tipo: m.tipo, texto: m.texto,
        ubicacion: m.tipo === 'sos' && m.lat !== undefined && m.lng !== undefined ? punto(m.lat, m.lng) : null,
      })),
    responderAlerta: (mid, accion, activo) => void intentarRedes('No se pudo enviar tu respuesta', activo
      ? supabase.from('respuestas_alerta').insert({ mensaje_id: mid, perfil_id: uid, accion })
      : supabase.from('respuestas_alerta').delete().eq('mensaje_id', mid).eq('perfil_id', uid!).eq('accion', accion)),
    resolverAlerta: (mid) => void intentarRedes('No se pudo marcar como resuelta', supabase.from('mensajes_red').update({ resuelta: true }).eq('id', mid)),

    // Etapa 2b: servicios (el servidor valida todo y maneja el dinero)
    postular: (id, precio, mensaje) => void servicio('No se pudo enviar tu propuesta', () => supabase.rpc('postular', { p_publicacion: id, p_precio: precio, p_mensaje: mensaje })),
    contratar: (postulacionId) => void servicio('No se pudo contratar', () => supabase.rpc('contratar', { p_postulacion: postulacionId })),
    contratarOferta: (ofertaId, contratoId) => {
      enVuelo.add(contratoId);
      void servicio('No se pudo contratar', () => supabase.rpc('contratar_oferta', { p_oferta: ofertaId, p_id: contratoId })).finally(() => enVuelo.delete(contratoId));
    },
    pagar: (id) => void servicio('No se pudo procesar el pago', () => supabase.rpc('pagar_servicio', { p_publicacion: id })),
    confirmarServicio: (id) => void servicio('No se pudo confirmar el servicio', () => supabase.rpc('confirmar_servicio', { p_publicacion: id })),
    registrarServicio: (id) => void servicio('No se pudo confirmar el servicio', () => supabase.rpc('registrar_servicio', { p_publicacion: id })),
    cancelarServicio: (id) => void servicio('No se pudo cancelar', () => supabase.rpc('cancelar_servicio', { p_publicacion: id })),
    calificar: (pagoId, estrellas, comentario) => void servicio('No se pudo guardar tu calificación', () => supabase.rpc('calificar', { p_pago: pagoId, p_estrellas: estrellas, p_comentario: comentario })),

    // Bloquear y reportar vecinos
    bloquear: (otroId) => void intentar('No se pudo bloquear a este vecino',
      supabase.from('bloqueos').insert({ bloqueador: uid, bloqueado: otroId }).then((r) => { refrescarTrasBloqueo(); return r; })),
    desbloquear: (otroId) => void intentar('No se pudo desbloquear a este vecino',
      supabase.from('bloqueos').delete().match({ bloqueador: uid, bloqueado: otroId }).then((r) => { refrescarTrasBloqueo(); return r; })),
    reportarUsuario: (otroId, motivo, detalle, conversacionId) => void (async () => {
      const real = conversacionId ? await (convPendientes.get(conversacionId) ?? Promise.resolve(conversacionId)).catch(() => null) : null;
      await intentar('No se pudo enviar el reporte',
        supabase.from('reportes_usuario').insert({ reportado_id: otroId, reportado_por: uid, conversacion_id: real, motivo, detalle }));
    })(),

    // Etapa 2: chat
    abrirConversacion: (convId, otroId, postId) => void abrirConversacion(convId, otroId, postId),
    enviarPrivado: (convId, m) => void enviarPrivado(convId, m),
    marcarLeida: (convId) => void (async () => {
      const real = await (convPendientes.get(convId) ?? Promise.resolve(convId)).catch(() => convId);
      await supabase.from('lecturas').upsert({ conversacion_id: real, perfil_id: uid, leido_en: new Date().toISOString() });
    })(),
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
  // (el tiempo real avisa al instante; esto es por si se cae la conexión en tiempo real)
  const refrescarTodo = () => { void cargarFeed().then(cargarServicios); void cargarRedes(); void cargarChats(); };
  setInterval(() => { if (document.visibilityState === 'visible') refrescarTodo(); }, 20_000);
  // Las redes (SOS) se revisan más seguido: un SOS no puede depender solo del tiempo real
  setInterval(() => { if (document.visibilityState === 'visible') void cargarRedes(); }, 10_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refrescarTodo(); });
}

import { useSyncExternalStore } from 'react';
import type {
  Barrio, Calificacion, Conversacion, Cuenta, Empresa, Historia, MensajePrivado, MensajeRed, MotivoReporte, Nota, Pago, PlanPromocionId, Post,
  PostServicio, Postulacion, Promocion, Red, Reel, Reporte, RespuestaAlerta, TipoDocumento, TipoRed, Usuario, VisibilidadFoto,
} from './types';
import { borrarFoto } from './fotos';
import { NUBE } from './nube/config';
import { PLAN, costoPromocion, finPromocion, motivoNoPromocionable, promoActiva } from './promociones';
import { BARRIOS_SEMILLA } from './data/bogota';
import { empresasSemilla, vincularPostsDemo } from './data/seed';
import { validarEnlaces, type RedSocial } from './redesSociales';
import { DIA_MS, garajeSemilla, calificacionesSemilla, generarCodigo, historiasSemilla, notasSemilla, postsSemilla, redesSemilla } from './data/seed';
import { desglose } from './servicios';
import { difuminar } from './geo';
import { aleatorioHex, errorClave, errorCorreo, generarId, hashClave, normalizarCorreo } from './auth';

/**
 * Almacén local (modo demo). Cada función de acción corresponde 1:1 a una llamada
 * que en producción irá contra la API/Supabase (ver supabase/schema.sql).
 */
export interface Estado {
  /** Todas las cuentas registradas en este dispositivo */
  cuentas: Cuenta[];
  /** Id de la cuenta con sesión iniciada */
  sesionId: string | null;
  /** Perfil público de la sesión actual (derivado de cuentas + sesionId, sin credenciales) */
  usuario: Usuario | null;
  barrios: Barrio[];
  posts: Post[];
  pagos: Pago[];
  redes: Red[];
  conversaciones: Conversacion[];
  calificaciones: Calificacion[];
  reportes: Reporte[];
  promociones: Promocion[];
  historias: Historia[];
  reels: Reel[];
  notas: Nota[];
  empresas: Empresa[];
}

/** Datos del formulario de negocio (los enlaces llegan sin validar). */
export interface DatosEmpresa {
  nombre: string;
  rubro: string;
  descripcion: string;
  logo?: string;
  portada?: string;
  direccion: string;
  telefono: string;
  horario: string;
  nit: string;
  redes: Partial<Record<RedSocial, string>>;
}

export const MAX_EMPRESAS_POR_USUARIO = 3;
export const REPORTES_PARA_RETIRAR_FOTO = 3;
export const MAX_OFICIOS = 8;

/** ¿Han tenido contacto real? Ambos escribieron en un chat, o hubo un servicio pagado entre ellos. */
export function sonContactos(s: Estado, a: string, b: string): boolean {
  const chat = s.conversaciones.some((c) => c.participantes.includes(a) && c.participantes.includes(b)
    && c.mensajes.some((m) => m.autorId === a) && c.mensajes.some((m) => m.autorId === b));
  return chat || s.pagos.some((p) => (p.clienteId === a && p.proveedorId === b) || (p.clienteId === b && p.proveedorId === a));
}

/** ¿Puede `viewerId` ver la foto de perfil de `duenoId`, según la privacidad que eligió el dueño? */
export function fotoVisible(s: Estado, duenoId: string, viewerId: string | undefined): boolean {
  const c = s.cuentas.find((x) => x.id === duenoId);
  if (!c?.foto || !viewerId) return false;
  if (duenoId === viewerId) return true;
  const vis = c.visibilidadFoto ?? 'todos';
  if (vis === 'todos') return true;
  if (sonContactos(s, duenoId, viewerId)) return true;
  return vis === 'redes' && s.redes.some((r) => esMiembro(r, duenoId) && esMiembro(r, viewerId));
}

export const vigente = (x: { expira: number }, ahora = Date.now()) => x.expira > ahora;

/** SOLO DEMO: promociona el evento de la JAC y la ferretería de cada barrio para ver cómo se ve. */
function promocionesSemilla(posts: Post[]): Promocion[] {
  const ahora = Date.now();
  return posts
    .filter((p) => (p.categoria === 'evento' && p.autor === 'Junta de Acción Comunal') || p.autor === 'Ferretería El Tornillo')
    .map((p) => {
      const plan = PLAN.barrio;
      const inicio = ahora - 24 * 3600_000;
      return {
        id: generarId(), postId: p.id, autorId: p.autorId, plan: plan.id, alcanceKm: plan.alcanceKm,
        inicio, fin: finPromocion(p, plan, inicio), ...costoPromocion(plan.precio),
        vistas: 40 + Math.floor(Math.random() * 80), clics: 5 + Math.floor(Math.random() * 15), estado: 'activa' as const,
      };
    });
}

/** Con 3 reportes de vecinos distintos una publicación se oculta hasta que un moderador la revise. */
export const REPORTES_PARA_OCULTAR = 3;

export function reputacion(calificaciones: Calificacion[], usuarioId: string) {
  const mias = calificaciones.filter((c) => c.paraId === usuarioId);
  const promedio = mias.length ? mias.reduce((t, c) => t + c.estrellas, 0) / mias.length : 0;
  return { n: mias.length, promedio };
}

export function noLeidos(c: Conversacion, usuarioId: string): number {
  const visto = c.leido[usuarioId] ?? 0;
  return c.mensajes.filter((m) => m.autorId !== usuarioId && m.creado > visto).length;
}

/** El otro participante de una conversación. */
export const otro = (c: Conversacion, usuarioId: string) => c.participantes.find((p) => p !== usuarioId)!;

/** Una alerta SOS o de ayuda se considera activa durante 2 horas si nadie la marca como resuelta. */
export const VIGENCIA_ALERTA_MS = 2 * 3600_000;

export function alertaActiva(m: MensajeRed): boolean {
  return (m.tipo === 'sos' || m.tipo === 'ayuda') && !m.resuelta && Date.now() - m.creado < VIGENCIA_ALERTA_MS;
}

export const esMiembro = (red: Red, usuarioId: string) => red.miembros.some((m) => m.usuarioId === usuarioId);

// En modo nube los datos locales se guardan aparte, para no mezclarlos con los del demo
const CLAVE = NUBE ? 'redcity_nube_v1' : 'microcomunidades_v4';
const listeners = new Set<() => void>();

/**
 * Ganchos hacia Supabase (los registra src/nube/sincronizar.ts al arrancar en modo nube).
 * Así el estado local no depende directamente de la nube y el modo demo sigue funcionando igual.
 */
export interface GanchosNube {
  publicar(post: Post): void;
  eliminar(postId: string): void;
  responder(postId: string, texto: string): void;
  meGusta(postId: string, activo: boolean): void;
  compartido(postId: string): void;
  reportar(postId: string, motivo: MotivoReporte): void;
  actualizarNombre(nombre: string): void;
  cerrarSesion(): void;
  // Etapa 2: redes y chat
  crearRed(red: Red): void;
  unirseRed(redId: string): void;
  salirRed(redId: string): void;
  quitarMiembro(redId: string, usuarioId: string): void;
  mensajeRed(redId: string, msg: MensajeRed): void;
  responderAlerta(mensajeId: string, accion: RespuestaAlerta['accion'], activo: boolean): void;
  resolverAlerta(mensajeId: string): void;
  abrirConversacion(convId: string, otroId: string, postId?: string): void;
  enviarPrivado(convId: string, mensaje: MensajePrivado): void;
  marcarLeida(convId: string): void;
  // Etapa 2b: servicios (el estado y el dinero los decide el servidor)
  postular(postId: string, precio: number, mensaje: string): void;
  contratar(postulacionId: string): void;
  contratarOferta(ofertaId: string, contratoId: string): void;
  pagar(postId: string): void;
  confirmarServicio(postId: string): void;
  registrarServicio(postId: string): void;
  cancelarServicio(postId: string): void;
  calificar(pagoId: string, estrellas: number, comentario: string): void;
}
let nube: GanchosNube | null = null;
export function registrarGanchosNube(g: GanchosNube) { nube = g; }

/** Para el módulo de sincronización: leer y modificar el estado. */
export const leerEstado = () => estado;
export function actualizarEstado(fn: (s: Estado) => Estado) { set(fn); }

/** Cuenta de prueba precargada (SOLO DEMO; eliminar al pasar a producción). */
export const CUENTA_DEMO = { nombre: 'Vecino de Prueba', correo: 'demo@redcity.co', clave: 'Vecino2026' };

function cuentaDemo(): Cuenta {
  const sal = 'demo-sal-fija';
  return {
    id: 'cuenta-demo', nombre: CUENTA_DEMO.nombre, correo: CUENTA_DEMO.correo,
    barrioId: 'bog-chapinero-alto', lat: 4.6486, lng: -74.0577, verificado: true, radioKm: 1,
    sal, hashClave: hashClave(CUENTA_DEMO.clave, sal), creado: Date.now(),
  };
}

function inicial(): Estado {
  // En modo nube las publicaciones son reales (vienen de Supabase): sin publicaciones ni cuenta de ejemplo
  const posts = NUBE ? [] : vincularPostsDemo([...postsSemilla(BARRIOS_SEMILLA), ...garajeSemilla(BARRIOS_SEMILLA)]);
  if (NUBE) {
    // Modo real: nada de ejemplo (negocios, redes, reseñas, historias falsas confundirían a los vecinos)
    return { cuentas: [], sesionId: null, usuario: null, barrios: BARRIOS_SEMILLA, posts: [], pagos: [], redes: [],
      conversaciones: [], calificaciones: [], reportes: [], promociones: [], historias: [], reels: [], notas: [], empresas: [] };
  }
  return { cuentas: [cuentaDemo()], sesionId: null, usuario: null, barrios: BARRIOS_SEMILLA, posts, pagos: [], redes: redesSemilla(BARRIOS_SEMILLA),
    conversaciones: [], calificaciones: calificacionesSemilla(), reportes: [], promociones: promocionesSemilla(posts),
    historias: historiasSemilla(BARRIOS_SEMILLA), reels: [], notas: notasSemilla(BARRIOS_SEMILLA),
    empresas: empresasSemilla(BARRIOS_SEMILLA),
  };
}

/** Quita las credenciales para que el resto de la app nunca las vea. */
function perfil(c: Cuenta): Usuario {
  const { hashClave: _h, sal: _s, creado: _c, ...publico } = c;
  return publico;
}

function conUsuario(s: Estado): Estado {
  const c = s.cuentas.find((x) => x.id === s.sesionId);
  return { ...s, usuario: c ? perfil(c) : null };
}

function cargar(): Estado {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (raw) {
      const s = JSON.parse(raw) as Estado;
      // Garantiza que la cuenta demo exista también en datos guardados antes de crearla
      if (!NUBE && !s.cuentas.some((c) => c.correo === CUENTA_DEMO.correo)) s.cuentas = [cuentaDemo(), ...s.cuentas];
      // Datos guardados antes de existir las redes: se agregan sin borrar cuentas
      if (!s.redes) s.redes = redesSemilla(s.barrios);
      s.conversaciones ??= [];
      s.calificaciones ??= calificacionesSemilla();
      s.reportes ??= [];
      s.promociones ??= promocionesSemilla(s.posts);
      // Datos guardados antes de existir las ventas de garaje
      if (!NUBE && !s.posts.some((p) => p.categoria === 'garaje')) s.posts = [...s.posts, ...garajeSemilla(s.barrios)];
      // Datos guardados antes de existir las páginas de negocio
      if (!s.empresas) {
        s.empresas = empresasSemilla(s.barrios);
        s.posts = vincularPostsDemo(s.posts);
      }
      s.historias ??= historiasSemilla(s.barrios);
      s.reels ??= [];
      s.notas ??= notasSemilla(s.barrios);
      // Las historias y notas vencidas se descartan al abrir la app
      s.historias = s.historias.filter((h) => vigente(h));
      s.notas = s.notas.filter((n) => vigente(n));
      // Pagos creados antes de incluir el costo de la pasarela
      s.pagos = s.pagos.map((p) => ({ ...p, pasarela: p.pasarela ?? 0, total: p.total ?? p.valor }));
      if (NUBE) {
        // Modo real: se descartan los datos de ejemplo que hubieran quedado guardados en este navegador
        const ejemplo = (id: string) => /^(seed-|demo-|emp-|red-)/.test(id);
        s.empresas = s.empresas.filter((e) => !ejemplo(e.id));
        s.redes = s.redes.filter((r) => !ejemplo(r.id));
        s.historias = s.historias.filter((h) => !ejemplo(h.autorId));
        s.notas = s.notas.filter((n) => !ejemplo(n.autorId));
        s.calificaciones = s.calificaciones.filter((c) => !ejemplo(c.deId));
        s.promociones = s.promociones.filter((p) => !ejemplo(p.autorId));
      }
      return conUsuario(s);
    }
  } catch { /* almacenamiento no disponible */ }
  return inicial();
}

function guardar(s: Estado) {
  const { usuario: _u, ...datos } = s;
  try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch { /* almacenamiento lleno o no disponible */ }
}

let estado: Estado = cargar();
guardar(estado); // persiste de una vez las migraciones de datos viejos

function set(fn: (s: Estado) => Estado) {
  estado = conUsuario(fn(estado));
  guardar(estado);
  listeners.forEach((l) => l());
}

export function useEstado(): Estado {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => estado,
  );
}

export const nuevoId = generarId;

/** Datos del formulario de registro (además de la ubicación ya resuelta). */
export interface DatosRegistro {
  nombre: string;
  correo: string;
  clave: string;
  barrioId: string;
  lat: number;
  lng: number;
  verificado: boolean;
}

function actualizarPost(postId: string, fn: (p: Post) => Post) {
  set((s) => ({ ...s, posts: s.posts.map((p) => (p.id === postId ? fn(p) : p)) }));
}

function actualizarServicio(postId: string, fn: (p: PostServicio) => PostServicio) {
  actualizarPost(postId, (p) => (p.categoria === 'servicio' ? fn(p) : p));
}

function actualizarRed(redId: string, fn: (r: Red) => Red) {
  set((s) => ({ ...s, redes: s.redes.map((r) => (r.id === redId ? fn(r) : r)) }));
}

function actualizarMensaje(redId: string, mensajeId: string, fn: (m: MensajeRed) => MensajeRed) {
  actualizarRed(redId, (r) => ({ ...r, mensajes: r.mensajes.map((m) => (m.id === mensajeId ? fn(m) : m)) }));
}

/** SOLO DEMO: un vecino ficticio de la red responde a la alerta para mostrar cómo funciona. */
function simularRespuestaRed(redId: string, msg: MensajeRed) {
  setTimeout(() => {
    const red = estado.redes.find((r) => r.id === redId);
    const vecino = red?.miembros.find((m) => m.usuarioId.startsWith('seed-'));
    if (!vecino) return;
    actualizarMensaje(redId, msg.id, (m) => m.resuelta ? m : {
      ...m,
      respuestas: [...m.respuestas, {
        usuarioId: vecino.usuarioId, nombre: vecino.nombre, accion: msg.tipo === 'sos' ? 'voy' : 'ayudo', creado: Date.now(),
      }],
    });
  }, 3000);
}

function actualizarEmpresa(empresaId: string, fn: (e: Empresa) => Empresa) {
  set((s) => ({ ...s, empresas: s.empresas.map((e) => (e.id === empresaId ? fn(e) : e)) }));
}

function limpiar(d: DatosEmpresa) {
  return {
    nombre: d.nombre.trim().slice(0, 60), rubro: d.rubro, descripcion: d.descripcion.trim().slice(0, 500),
    logo: d.logo, portada: d.portada, direccion: d.direccion.trim().slice(0, 120),
    telefono: d.telefono.replace(/[^\d+ ]/g, '').slice(0, 20), horario: d.horario.trim().slice(0, 120),
  };
}

function actualizarPromo(promoId: string, fn: (p: Promocion) => Promocion) {
  set((s) => ({ ...s, promociones: s.promociones.map((p) => (p.id === promoId ? fn(p) : p)) }));
}

function actualizarConversacion(convId: string, fn: (c: Conversacion) => Conversacion) {
  set((s) => ({ ...s, conversaciones: s.conversaciones.map((c) => (c.id === convId ? fn(c) : c)) }));
}

/** SOLO DEMO: los vecinos ficticios contestan los mensajes privados. */
const RESPUESTAS_DEMO = [
  '¡Hola, vecino! Sí, claro. ¿A qué hora te queda bien?',
  'Perfecto, quedamos así. Cualquier cosa me escribes por aquí.',
  '¡Gracias! Te confirmo apenas pueda.',
];
function simularRespuestaPrivada(convId: string, autorId: string) {
  const c = estado.conversaciones.find((x) => x.id === convId);
  const otroId = c && otro(c, autorId);
  if (!c || !otroId || !/^(seed|demo)-/.test(otroId)) return;
  setTimeout(() => {
    const actual = estado.conversaciones.find((x) => x.id === convId)!;
    const n = actual.mensajes.filter((m) => m.autorId === otroId).length;
    actualizarConversacion(convId, (x) => ({
      ...x, mensajes: [...x.mensajes, { id: nuevoId(), autorId: otroId, texto: RESPUESTAS_DEMO[n % RESPUESTAS_DEMO.length], creado: Date.now() }],
    }));
  }, 2500);
}

const alternar = (lista: string[], v: string) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

/** SOLO DEMO: simula vecinos que se postulan a una necesidad recién publicada. */
const PROVEEDORES_DEMO = [
  { nombre: 'Rosa M.', mensaje: 'Hola, vivo a 3 cuadras. Tengo experiencia y referencias de vecinos.', factor: 1 },
  { nombre: 'Wilson T.', mensaje: 'Puedo empezar esta misma semana. Llevo 5 años en esto.', factor: 0.9 },
];
function simularPostulaciones(post: PostServicio) {
  PROVEEDORES_DEMO.forEach((d, i) => {
    setTimeout(() => {
      actualizarServicio(post.id, (p) => p.estado !== 'abierta' ? p : {
        ...p,
        postulaciones: [...p.postulaciones, {
          id: nuevoId(), proveedorId: 'demo-' + i, proveedor: d.nombre, verificado: true,
          mensaje: d.mensaje, precio: Math.round((p.valor * d.factor) / 1000) * 1000, creado: Date.now(),
        }],
      });
    }, 2500 * (i + 1));
  });
}

export const acciones = {
  // ---------- Cuentas ----------
  /** Crea la cuenta e inicia sesión. Devuelve un mensaje de error o null si todo salió bien. */
  registrar(datos: DatosRegistro, barrioNuevo?: Barrio): string | null {
    const correo = normalizarCorreo(datos.correo);
    if (datos.nombre.trim().length < 2) return 'Escribe tu nombre.';
    const error = errorCorreo(correo) ?? errorClave(datos.clave);
    if (error) return error;
    if (estado.cuentas.some((c) => c.correo === correo)) return `Ya existe una cuenta con ${correo}. Inicia sesión.`;
    const sal = aleatorioHex(16);
    const cuenta: Cuenta = {
      id: nuevoId(), nombre: datos.nombre.trim(), correo,
      barrioId: datos.barrioId, lat: datos.lat, lng: datos.lng, verificado: datos.verificado, radioKm: 1,
      sal, hashClave: hashClave(datos.clave, sal), creado: Date.now(),
    };
    set((s) => ({
      ...s,
      cuentas: [...s.cuentas, cuenta],
      sesionId: cuenta.id,
      barrios: barrioNuevo ? [...s.barrios, barrioNuevo] : s.barrios,
      posts: barrioNuevo ? [...s.posts, ...postsSemilla([barrioNuevo]).slice(0, 3)] : s.posts,
    }));
    return null;
  },
  /** Devuelve un mensaje de error o null si la sesión se inició. */
  iniciarSesion(correoTexto: string, clave: string): string | null {
    const cuenta = estado.cuentas.find((c) => c.correo === normalizarCorreo(correoTexto));
    // Mismo mensaje en ambos casos para no revelar qué correos están registrados
    if (!cuenta || hashClave(clave, cuenta.sal) !== cuenta.hashClave) return 'Correo o contraseña incorrectos.';
    set((s) => ({ ...s, sesionId: cuenta.id }));
    return null;
  },
  /** Cierra la sesión sin borrar datos. */
  cerrarSesion() {
    nube?.cerrarSesion();
    set((s) => ({ ...s, sesionId: null }));
  },
  correoDisponible(correoTexto: string): boolean {
    const c = normalizarCorreo(correoTexto);
    return !estado.cuentas.some((x) => x.correo === c);
  },
  cambiarRadio(radioKm: number) {
    set((s) => ({ ...s, cuentas: s.cuentas.map((c) => (c.id === s.sesionId ? { ...c, radioKm } : c)) }));
  },
  publicar(post: Post) {
    set((s) => ({ ...s, posts: [post, ...s.posts] }));
    if (nube && !post.local) { nube.publicar(post); return; }
    // Solo en el demo: vecinos ficticios se postulan para mostrar el flujo
    if (post.categoria === 'servicio' && post.modo === 'necesito' && post.valor > 0) simularPostulaciones(post);
  },
  responder(postId: string, autor: string, texto: string) {
    actualizarPost(postId, (p) => ({
      ...p, respuestas: [...p.respuestas, { id: nuevoId(), autor, texto, creado: Date.now() }],
    }));
    nube?.responder(postId, texto);
  },
  confirmarAlerta(postId: string, usuarioId: string) {
    actualizarPost(postId, (p) => (p.categoria === 'seguridad' ? { ...p, confirmaciones: alternar(p.confirmaciones, usuarioId) } : p));
  },
  /** "Asistiré" en eventos e "Iré" en ventas de garaje. */
  asistir(postId: string, usuarioId: string) {
    actualizarPost(postId, (p) => (p.categoria === 'evento' || p.categoria === 'garaje' ? { ...p, asistentes: alternar(p.asistentes, usuarioId) } : p));
  },

  // ---------- Ventas de garaje ----------
  /**
   * Un vecino aparta un artículo: queda reservado a su nombre y se le escribe al vendedor
   * por chat privado. Devuelve el id de la conversación, o un error.
   */
  apartarArticulo(postId: string, articuloId: string, u: Usuario): { chatId?: string; error?: string } {
    const post = estado.posts.find((p) => p.id === postId);
    if (!post || post.categoria !== 'garaje') return { error: 'La venta ya no existe.' };
    if (post.autorId === u.id) return { error: 'No puedes apartar tus propios artículos.' };
    if (Date.now() >= new Date(post.fin).getTime()) return { error: 'La venta ya terminó.' };
    const art = post.articulos.find((a) => a.id === articuloId);
    if (!art || art.estado !== 'disponible') return { error: 'Este artículo ya no está disponible.' };
    actualizarPost(postId, (p) => p.categoria !== 'garaje' ? p : {
      ...p, articulos: p.articulos.map((a) => (a.id === articuloId ? { ...a, estado: 'apartado', apartadoPorId: u.id, apartadoPor: u.nombre } : a)),
    });
    const chatId = acciones.abrirConversacion(u, post.autorId, post.autor, { id: post.id, titulo: post.titulo });
    const precio = art.precio > 0 ? ` (${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(art.precio)})` : '';
    acciones.enviarPrivado(chatId, u, `¡Hola! Aparté "${art.nombre}"${precio} de tu venta de garaje. ¿Cómo hacemos para recogerlo?`);
    return { chatId };
  },
  /** El vendedor marca un artículo como vendido o lo vuelve a dejar disponible. */
  marcarArticulo(postId: string, articuloId: string, estadoArt: 'disponible' | 'vendido') {
    actualizarPost(postId, (p) => p.categoria !== 'garaje' ? p : {
      ...p,
      articulos: p.articulos.map((a) => (a.id !== articuloId ? a
        : { ...a, estado: estadoArt, ...(estadoArt === 'disponible' ? { apartadoPorId: undefined, apartadoPor: undefined } : {}) })),
    });
  },
  /** Quien apartó puede soltar el artículo. */
  liberarArticulo(postId: string, articuloId: string, usuarioId: string) {
    actualizarPost(postId, (p) => p.categoria !== 'garaje' ? p : {
      ...p,
      articulos: p.articulos.map((a) => (a.id === articuloId && a.apartadoPorId === usuarioId
        ? { ...a, estado: 'disponible', apartadoPorId: undefined, apartadoPor: undefined } : a)),
    });
  },
  marcarIntercambiado(postId: string) {
    actualizarPost(postId, (p) => (p.categoria === 'trueque' ? { ...p, estado: 'intercambiado' } : p));
  },
  eliminar(postId: string) {
    if (nube && !estado.posts.find((p) => p.id === postId)?.local) nube.eliminar(postId);
    set((s) => ({ ...s, posts: s.posts.filter((p) => p.id !== postId) }));
  },

  // ---------- Servicios ----------
  /** Un proveedor se postula a una necesidad publicada */
  postular(postId: string, postulacion: Postulacion) {
    actualizarServicio(postId, (p) => ({ ...p, postulaciones: [...p.postulaciones, postulacion] }));
    nube?.postular(postId, postulacion.precio, postulacion.mensaje);
  },
  /** El cliente elige a uno de los postulados */
  contratar(postId: string, postulacionId: string) {
    actualizarServicio(postId, (p) => ({ ...p, estado: 'asignada', asignadoId: postulacionId }));
    nube?.contratar(postulacionId);
  },
  /** Un vecino contrata directamente un servicio que alguien ofrece. Devuelve el id de la contratación. */
  contratarOferta(oferta: PostServicio, cliente: Usuario): string {
    const postulacionId = nuevoId();
    const contrato: PostServicio = {
      // la contratación es privada: en el demo vive en el dispositivo; en la nube la crea el servidor (oculta del feed)
      id: nuevoId(), categoria: 'servicio', modo: 'necesito', local: !nube,
      titulo: `Contratación: ${oferta.titulo}`, descripcion: `Contratado desde la oferta de ${oferta.autor}.`,
      autorId: cliente.id, autor: cliente.nombre, autorVerificado: cliente.verificado, barrioId: cliente.barrioId,
      creado: Date.now(), respuestas: [], ...difuminar(cliente.lat, cliente.lng),
      rubro: oferta.rubro, valor: oferta.valor, unidad: oferta.unidad, frecuencia: 'una-vez', dia: '',
      estado: 'asignada', asignadoId: postulacionId, realizados: 0,
      postulaciones: [{
        id: postulacionId, proveedorId: oferta.autorId, proveedor: oferta.autor, verificado: oferta.autorVerificado,
        mensaje: 'Contratado desde su oferta publicada.', precio: oferta.valor, creado: Date.now(),
      }],
    };
    set((s) => ({ ...s, posts: [contrato, ...s.posts] }));
    nube?.contratarOferta(oferta.id, contrato.id);
    return contrato.id;
  },
  /**
   * El cliente paga. El dinero queda RETENIDO (en producción: en la pasarela de pagos)
   * hasta que confirme que el servicio se realizó.
   */
  pagar(postId: string) {
    const post = estado.posts.find((p): p is PostServicio => p.id === postId && p.categoria === 'servicio');
    const elegido = post?.postulaciones.find((x) => x.id === post.asignadoId);
    if (!post || !elegido || post.estado !== 'asignada') return;
    if (nube) {
      // En la nube el pago (y su id) lo crea el servidor; aquí solo se refleja el estado mientras responde
      actualizarServicio(postId, (p) => ({ ...p, estado: 'pagada' }));
      nube.pagar(postId);
      return;
    }
    const pago: Pago = {
      id: nuevoId(), postId, titulo: post.titulo, clienteId: post.autorId,
      proveedorId: elegido.proveedorId, proveedor: elegido.proveedor,
      ...desglose(elegido.precio), estado: 'retenido', creado: Date.now(),
    };
    set((s) => ({
      ...s,
      pagos: [pago, ...s.pagos],
      posts: s.posts.map((p) => (p.id === postId && p.categoria === 'servicio' ? { ...p, estado: 'pagada' } : p)),
    }));
  },
  /** El cliente confirma: se libera el 98 % al proveedor y el 2 % queda para la plataforma. */
  confirmarServicio(postId: string) {
    set((s) => ({
      ...s,
      pagos: s.pagos.map((pg) => (pg.postId === postId && pg.estado === 'retenido' ? { ...pg, estado: 'liberado' } : pg)),
      posts: s.posts.map((p) => {
        if (p.id !== postId || p.categoria !== 'servicio') return p;
        // Los servicios recurrentes vuelven a "asignada" para pagar la siguiente vez
        return { ...p, realizados: p.realizados + 1, estado: p.frecuencia === 'una-vez' ? 'completada' : 'asignada' };
      }),
    }));
    nube?.confirmarServicio(postId);
  },
  /**
   * Sin pagos en la app: el cliente confirma que el servicio se realizó (lo pagó directamente al vecino).
   * Queda un registro con el valor acordado, sin comisión, que habilita las calificaciones.
   */
  registrarServicio(postId: string) {
    const post = estado.posts.find((p): p is PostServicio => p.id === postId && p.categoria === 'servicio');
    const elegido = post?.postulaciones.find((x) => x.id === post.asignadoId);
    if (!post || !elegido || (post.estado !== 'asignada' && post.estado !== 'pagada')) return;
    const siguiente = (p: PostServicio): PostServicio => ({ ...p, realizados: p.realizados + 1, estado: p.frecuencia === 'una-vez' ? 'completada' : 'asignada' });
    if (nube) {
      // En la nube el registro (y su id) lo crea el servidor; aquí solo se refleja el estado mientras responde
      actualizarServicio(postId, siguiente);
      nube.registrarServicio(postId);
      return;
    }
    const retenido = estado.pagos.some((pg) => pg.postId === postId && pg.estado === 'retenido');
    const registro: Pago = {
      id: nuevoId(), postId, titulo: post.titulo, clienteId: post.autorId,
      proveedorId: elegido.proveedorId, proveedor: elegido.proveedor,
      ...desglose(elegido.precio), estado: 'liberado', creado: Date.now(),
    };
    set((s) => ({
      ...s,
      pagos: retenido
        ? s.pagos.map((pg) => (pg.postId === postId && pg.estado === 'retenido' ? { ...pg, estado: 'liberado' } : pg))
        : [registro, ...s.pagos],
      posts: s.posts.map((p) => (p.id === postId && p.categoria === 'servicio' ? siguiente(p) : p)),
    }));
  },
  /** Cancela el servicio; si había un pago retenido se reembolsa completo. */
  cancelarServicio(postId: string) {
    set((s) => ({
      ...s,
      pagos: s.pagos.map((pg) => (pg.postId === postId && pg.estado === 'retenido' ? { ...pg, estado: 'reembolsado' } : pg)),
      posts: s.posts.map((p) => (p.id === postId && p.categoria === 'servicio' ? { ...p, estado: 'cancelada' } : p)),
    }));
    nube?.cancelarServicio(postId);
  },

  // ---------- Redes de seguridad y apoyo ----------
  crearRed(datos: { nombre: string; tipo: TipoRed; descripcion: string; privada: boolean }, creador: Usuario): string {
    const red: Red = {
      id: nuevoId(), ...datos, nombre: datos.nombre.trim(), descripcion: datos.descripcion.trim(),
      barrioId: creador.barrioId, codigo: generarCodigo(), creadorId: creador.id, creado: Date.now(),
      miembros: [{ usuarioId: creador.id, nombre: creador.nombre, rol: 'coordinador', unido: Date.now() }],
      mensajes: [],
    };
    set((s) => ({ ...s, redes: [red, ...s.redes] }));
    nube?.crearRed(red);
    return red.id;
  },
  unirseRed(redId: string, u: Usuario) {
    const ya = estado.redes.find((r) => r.id === redId && esMiembro(r, u.id));
    actualizarRed(redId, (r) => esMiembro(r, u.id) ? r : {
      ...r, miembros: [...r.miembros, { usuarioId: u.id, nombre: u.nombre, rol: 'miembro', unido: Date.now() }],
      totalMiembros: (r.totalMiembros ?? r.miembros.length) + 1,
    });
    if (!ya) nube?.unirseRed(redId);
  },
  /** Devuelve el id de la red, o un error. */
  unirsePorCodigo(codigo: string, u: Usuario): { redId?: string; error?: string } {
    const red = estado.redes.find((r) => r.codigo === codigo.trim().toUpperCase());
    if (!red) return { error: 'No encontramos una red con ese código. Revisa que esté bien escrito.' };
    acciones.unirseRed(red.id, u);
    return { redId: red.id };
  },
  /** Si sale el único coordinador, el miembro más antiguo toma el rol. Si no queda nadie, la red se elimina. */
  salirRed(redId: string, usuarioId: string) {
    set((s) => ({
      ...s,
      redes: s.redes.flatMap((r) => {
        if (r.id !== redId) return [r];
        let miembros = r.miembros.filter((m) => m.usuarioId !== usuarioId);
        if (miembros.length === 0) return [];
        if (!miembros.some((m) => m.rol === 'coordinador')) {
          miembros = miembros.map((m, i) => (i === 0 ? { ...m, rol: 'coordinador' } : m));
        }
        return [{ ...r, miembros }];
      }),
    }));
    nube?.salirRed(redId);
  },
  quitarMiembro(redId: string, usuarioId: string) {
    actualizarRed(redId, (r) => ({ ...r, miembros: r.miembros.filter((m) => m.usuarioId !== usuarioId) }));
    nube?.quitarMiembro(redId, usuarioId);
  },
  enviarMensajeRed(redId: string, autor: Usuario, datos: Pick<MensajeRed, 'tipo' | 'texto' | 'lat' | 'lng'>) {
    const msg: MensajeRed = { id: nuevoId(), autorId: autor.id, autor: autor.nombre, creado: Date.now(), respuestas: [], ...datos };
    actualizarRed(redId, (r) => ({ ...r, mensajes: [...r.mensajes, msg] }));
    if (nube) { nube.mensajeRed(redId, msg); return; }
    if (msg.tipo === 'sos' || msg.tipo === 'ayuda') simularRespuestaRed(redId, msg);
  },
  /** Un miembro responde a una alerta (voy en camino / llamé al 123 / yo te ayudo). Tocar de nuevo la quita. */
  responderAlerta(redId: string, mensajeId: string, u: Usuario, accion: RespuestaAlerta['accion']) {
    const msg = estado.redes.find((r) => r.id === redId)?.mensajes.find((m) => m.id === mensajeId);
    const ya = !!msg?.respuestas.some((x) => x.usuarioId === u.id && x.accion === accion);
    actualizarMensaje(redId, mensajeId, (m) => ({
      ...m,
      respuestas: ya
        ? m.respuestas.filter((x) => !(x.usuarioId === u.id && x.accion === accion))
        : [...m.respuestas, { usuarioId: u.id, nombre: u.nombre, accion, creado: Date.now() }],
    }));
    nube?.responderAlerta(mensajeId, accion, !ya);
  },
  /** Quien envió la alerta (o un coordinador) la marca como resuelta. */
  resolverAlerta(redId: string, mensajeId: string) {
    actualizarMensaje(redId, mensajeId, (m) => ({ ...m, resuelta: true }));
    nube?.resolverAlerta(mensajeId);
  },

  // ---------- Chat privado ----------
  /** Abre (o crea) la conversación entre dos vecinos. Devuelve su id. */
  abrirConversacion(yo: Usuario, otroId: string, otroNombre: string, post?: { id: string; titulo: string }): string {
    const existente = estado.conversaciones.find((c) => c.participantes.includes(yo.id) && c.participantes.includes(otroId));
    if (existente) {
      if (post) actualizarConversacion(existente.id, (c) => ({ ...c, postId: post.id, postTitulo: post.titulo }));
      return existente.id;
    }
    const conv: Conversacion = {
      id: nuevoId(), participantes: [yo.id, otroId], nombres: { [yo.id]: yo.nombre, [otroId]: otroNombre },
      postId: post?.id, postTitulo: post?.titulo, mensajes: [], leido: { [yo.id]: Date.now() },
    };
    set((s) => ({ ...s, conversaciones: [conv, ...s.conversaciones] }));
    nube?.abrirConversacion(conv.id, otroId, post?.id);
    return conv.id;
  },
  enviarPrivado(convId: string, autor: Usuario, texto: string, foto?: string) {
    const ahora = Date.now();
    const mensaje: MensajePrivado = { id: nuevoId(), autorId: autor.id, texto, foto, creado: ahora };
    actualizarConversacion(convId, (c) => ({
      ...c,
      mensajes: [...c.mensajes, mensaje],
      leido: { ...c.leido, [autor.id]: ahora },
    }));
    if (nube) { nube.enviarPrivado(convId, mensaje); return; }
    simularRespuestaPrivada(convId, autor.id);
  },
  marcarLeida(convId: string, usuarioId: string) {
    const c = estado.conversaciones.find((x) => x.id === convId);
    if (c && noLeidos(c, usuarioId) > 0) {
      actualizarConversacion(convId, (x) => ({ ...x, leido: { ...x.leido, [usuarioId]: Date.now() } }));
      nube?.marcarLeida(convId);
    }
  },

  // ---------- Calificaciones ----------
  /** Solo para pagos liberados en los que participó quien califica. Devuelve error o null. */
  calificar(pagoId: string, de: Usuario, estrellas: number, comentario: string): string | null {
    const pago = estado.pagos.find((p) => p.id === pagoId);
    if (!pago || pago.estado !== 'liberado') return 'Solo puedes calificar servicios pagados y confirmados.';
    if (![pago.clienteId, pago.proveedorId].includes(de.id)) return 'No participaste en este servicio.';
    if (estado.calificaciones.some((c) => c.pagoId === pagoId && c.deId === de.id)) return 'Ya calificaste este servicio.';
    if (estrellas < 1 || estrellas > 5) return 'Elige de 1 a 5 estrellas.';
    const cal: Calificacion = {
      id: nuevoId(), pagoId, deId: de.id, deNombre: de.nombre,
      paraId: de.id === pago.clienteId ? pago.proveedorId : pago.clienteId,
      estrellas, comentario: comentario.trim(), creado: Date.now(),
    };
    set((s) => ({ ...s, calificaciones: [cal, ...s.calificaciones] }));
    nube?.calificar(pagoId, estrellas, comentario.trim());
    return null;
  },

  // ---------- Moderación ----------
  reportar(postId: string, porId: string, motivo: MotivoReporte): string | null {
    const post = estado.posts.find((p) => p.id === postId);
    if (!post) return 'La publicación ya no existe.';
    if (post.autorId === porId) return 'No puedes reportar tu propia publicación.';
    if (estado.reportes.some((r) => r.postId === postId && r.porId === porId)) return 'Ya reportaste esta publicación.';
    const reporte: Reporte = { id: nuevoId(), postId, porId, motivo, creado: Date.now() };
    if (nube && !post.local) {
      // En la nube el conteo y el ocultamiento los hace el servidor (con reportes de todos los vecinos)
      set((s) => ({ ...s, reportes: [...s.reportes, reporte] }));
      nube.reportar(postId, motivo);
      return null;
    }
    set((s) => {
      const reportes = [...s.reportes, reporte];
      const total = new Set(reportes.filter((r) => r.postId === postId).map((r) => r.porId)).size;
      return {
        ...s, reportes,
        posts: total >= REPORTES_PARA_OCULTAR ? s.posts.map((p) => (p.id === postId ? { ...p, oculta: true } : p)) : s.posts,
      };
    });
    return null;
  },

  // ---------- Perfil: presentación y redes sociales ----------
  /** Devuelve los errores de validación por red, o null si se guardó. */
  actualizarRedes(usuarioId: string, bio: string, entrada: Partial<Record<RedSocial, string>>): Partial<Record<RedSocial, string>> | null {
    const { enlaces, errores, ok } = validarEnlaces(entrada);
    if (!ok) return errores;
    set((s) => ({ ...s, cuentas: s.cuentas.map((c) => (c.id === usuarioId ? { ...c, bio: bio.trim().slice(0, 160), redes: enlaces } : c)) }));
    return null;
  },

  // ---------- Foto de perfil y oficios ----------
  /** Cambia (o quita, con undefined) la foto de perfil. Borra la anterior del dispositivo. */
  actualizarFoto(usuarioId: string, fotoId: string | undefined) {
    const anterior = estado.cuentas.find((c) => c.id === usuarioId)?.foto;
    if (anterior && anterior !== fotoId) borrarFoto(anterior).catch(() => { /* ya no existía */ });
    set((s) => ({
      ...s,
      cuentas: s.cuentas.map((c) => (c.id !== usuarioId ? c : {
        ...c, foto: fotoId, reportesFoto: [], fotoRetirada: false,
        // Sin foto, la verificación de cédula (que se compara con la foto) deja de valer
        documentos: fotoId ? c.documentos : { ...c.documentos, cedula: undefined },
      })),
    }));
  },
  actualizarVisibilidadFoto(usuarioId: string, visibilidadFoto: VisibilidadFoto) {
    set((s) => ({ ...s, cuentas: s.cuentas.map((c) => (c.id === usuarioId ? { ...c, visibilidadFoto } : c)) }));
  },
  actualizarOficios(usuarioId: string, oficios: string[]) {
    const limpios = [...new Set(oficios.map((o) => o.trim().slice(0, 30)).filter((o) => o.length >= 2))].slice(0, MAX_OFICIOS);
    set((s) => ({ ...s, cuentas: s.cuentas.map((c) => (c.id === usuarioId ? { ...c, oficios: limpios } : c)) }));
  },
  /** Un vecino reporta una foto de perfil inapropiada o falsa. Con 3 reportes distintos se retira. */
  reportarFoto(duenoId: string, porId: string): string | null {
    const c = estado.cuentas.find((x) => x.id === duenoId);
    if (!c?.foto) return 'Este vecino no tiene foto.';
    if (duenoId === porId) return 'No puedes reportar tu propia foto.';
    if (c.reportesFoto?.includes(porId)) return 'Ya reportaste esta foto.';
    const reportes = [...(c.reportesFoto ?? []), porId];
    if (reportes.length >= REPORTES_PARA_RETIRAR_FOTO) {
      borrarFoto(c.foto).catch(() => { /* ya no existía */ });
      set((s) => ({ ...s, cuentas: s.cuentas.map((x) => (x.id === duenoId
        ? { ...x, foto: undefined, reportesFoto: [], fotoRetirada: true, documentos: { ...x.documentos, cedula: undefined } } : x)) }));
    } else {
      set((s) => ({ ...s, cuentas: s.cuentas.map((x) => (x.id === duenoId ? { ...x, reportesFoto: reportes } : x)) }));
    }
    return null;
  },

  // ---------- Empresas y negocios ----------
  /** Crea o actualiza un negocio. Devuelve { id } o los errores. */
  guardarEmpresa(dueno: Usuario, datos: DatosEmpresa, empresaId?: string): { id?: string; error?: string; errores?: Partial<Record<RedSocial, string>> } {
    if (datos.nombre.trim().length < 3) return { error: 'El nombre del negocio debe tener al menos 3 caracteres.' };
    if (!datos.rubro) return { error: 'Elige el tipo de negocio.' };
    // Primero quién puede editar; después, qué datos trae
    const e = empresaId ? estado.empresas.find((x) => x.id === empresaId) : undefined;
    if (empresaId && (!e || e.duenoId !== dueno.id)) return { error: 'Solo el dueño puede editar este negocio.' };
    const { enlaces, errores, ok } = validarEnlaces(datos.redes);
    if (!ok) return { errores };
    if (empresaId && e) {
      // Si cambia el NIT de un negocio verificado, pierde la verificación
      const nit = datos.nit.trim();
      const verificacion = nit !== e.nit ? 'no' : e.verificacion;
      actualizarEmpresa(empresaId, (x) => ({ ...x, ...limpiar(datos), redes: enlaces, nit, verificacion }));
      return { id: empresaId };
    }
    if (estado.empresas.filter((x) => x.duenoId === dueno.id).length >= MAX_EMPRESAS_POR_USUARIO) {
      return { error: `Puedes tener máximo ${MAX_EMPRESAS_POR_USUARIO} negocios.` };
    }
    const nueva: Empresa = {
      id: nuevoId(), duenoId: dueno.id, ...limpiar(datos), redes: enlaces, nit: datos.nit.trim(),
      barrioId: dueno.barrioId, ...difuminar(dueno.lat, dueno.lng), verificacion: 'no', seguidores: [], creado: Date.now(),
    };
    set((s) => ({ ...s, empresas: [nueva, ...s.empresas] }));
    return { id: nueva.id };
  },
  eliminarEmpresa(empresaId: string, usuarioId: string) {
    set((s) => ({
      ...s,
      empresas: s.empresas.filter((e) => !(e.id === empresaId && e.duenoId === usuarioId)),
      // Sus publicaciones quedan a nombre de la persona
      posts: s.posts.map((p) => (p.empresaId === empresaId ? { ...p, empresaId: undefined } : p)),
    }));
  },
  seguirEmpresa(empresaId: string, usuarioId: string) {
    actualizarEmpresa(empresaId, (e) => ({ ...e, seguidores: alternar(e.seguidores, usuarioId) }));
  },
  /** SOLO DEMO: la verificación del NIT/RUT se aprueba a los 3 s (en producción la revisa un moderador). */
  verificarEmpresa(empresaId: string) {
    const e = estado.empresas.find((x) => x.id === empresaId);
    if (!e || !/^\d{6,10}(-\d)?$/.test(e.nit.replace(/[.\s]/g, ''))) return 'Escribe un NIT o RUT válido (ej: 900123456-7) antes de verificar.';
    actualizarEmpresa(empresaId, (x) => ({ ...x, verificacion: 'en-revision' }));
    setTimeout(() => actualizarEmpresa(empresaId, (x) => ({ ...x, verificacion: 'verificada' })), 3000);
    return null;
  },

  // ---------- Interacciones: me gusta, compartir, guardar ----------
  meGusta(postId: string, usuarioId: string) {
    actualizarPost(postId, (p) => ({ ...p, meGusta: alternar(p.meGusta ?? [], usuarioId) }));
    nube?.meGusta(postId, !!estado.posts.find((p) => p.id === postId)?.meGusta?.includes(usuarioId));
  },
  compartido(postId: string) {
    actualizarPost(postId, (p) => ({ ...p, compartidos: (p.compartidos ?? 0) + 1 }));
    nube?.compartido(postId);
  },
  guardar(usuarioId: string, postId: string) {
    set((s) => ({ ...s, cuentas: s.cuentas.map((c) => (c.id === usuarioId ? { ...c, guardados: alternar(c.guardados ?? [], postId) } : c)) }));
  },
  guardadosDe(usuarioId: string): string[] {
    return estado.cuentas.find((c) => c.id === usuarioId)?.guardados ?? [];
  },

  // ---------- Historias ----------
  publicarHistoria(autor: Usuario, datos: { foto?: string; texto: string; fondo: string }) {
    const ahora = Date.now();
    const h: Historia = {
      id: nuevoId(), autorId: autor.id, autor: autor.nombre, barrioId: autor.barrioId, ...difuminar(autor.lat, autor.lng),
      ...datos, texto: datos.texto.trim(), creado: ahora, expira: ahora + DIA_MS, vistas: [],
    };
    set((s) => ({ ...s, historias: [...s.historias, h] }));
  },
  verHistoria(historiaId: string, usuarioId: string) {
    const h = estado.historias.find((x) => x.id === historiaId);
    if (!h || h.autorId === usuarioId || h.vistas.includes(usuarioId)) return;
    set((s) => ({ ...s, historias: s.historias.map((x) => (x.id === historiaId ? { ...x, vistas: [...x.vistas, usuarioId] } : x)) }));
  },
  borrarHistoria(historiaId: string) {
    set((s) => ({ ...s, historias: s.historias.filter((x) => x.id !== historiaId) }));
  },

  // ---------- Reels ----------
  publicarReel(autor: Usuario, video: string, descripcion: string) {
    const r: Reel = {
      id: nuevoId(), autorId: autor.id, autor: autor.nombre, barrioId: autor.barrioId, ...difuminar(autor.lat, autor.lng),
      video, descripcion: descripcion.trim(), creado: Date.now(), meGusta: [], comentarios: [], reproducciones: 0, compartidos: 0,
    };
    set((s) => ({ ...s, reels: [r, ...s.reels] }));
  },
  actualizarReel(reelId: string, fn: (r: Reel) => Reel) {
    set((s) => ({ ...s, reels: s.reels.map((r) => (r.id === reelId ? fn(r) : r)) }));
  },
  borrarReel(reelId: string) {
    set((s) => ({ ...s, reels: s.reels.filter((r) => r.id !== reelId) }));
  },

  // ---------- Notas ----------
  /** Cada vecino tiene máximo una nota activa: publicar otra reemplaza la anterior. */
  publicarNota(autor: Usuario, texto: string) {
    const ahora = Date.now();
    const n: Nota = {
      id: nuevoId(), autorId: autor.id, autor: autor.nombre, barrioId: autor.barrioId, ...difuminar(autor.lat, autor.lng),
      texto: texto.trim().slice(0, 60), creado: ahora, expira: ahora + DIA_MS,
    };
    set((s) => ({ ...s, notas: [...s.notas.filter((x) => x.autorId !== autor.id), n] }));
  },
  borrarNota(autorId: string) {
    set((s) => ({ ...s, notas: s.notas.filter((x) => x.autorId !== autorId) }));
  },

  // ---------- Promociones ----------
  /** Paga (simulado) y activa la promoción. Devuelve un error o null. */
  promocionar(postId: string, autor: Usuario, planId: PlanPromocionId): string | null {
    const post = estado.posts.find((p) => p.id === postId);
    if (!post) return 'La publicación ya no existe.';
    if (post.autorId !== autor.id) return 'Solo puedes promocionar tus propias publicaciones.';
    const motivo = motivoNoPromocionable(post);
    if (motivo) return motivo;
    if (estado.promociones.some((p) => p.postId === postId && promoActiva(p))) return 'Esta publicación ya tiene una promoción activa.';
    const plan = PLAN[planId];
    const inicio = Date.now();
    const promo: Promocion = {
      id: nuevoId(), postId, autorId: autor.id, plan: plan.id, alcanceKm: plan.alcanceKm,
      inicio, fin: finPromocion(post, plan, inicio), ...costoPromocion(plan.precio),
      vistas: 0, clics: 0, estado: 'activa',
    };
    set((s) => ({ ...s, promociones: [promo, ...s.promociones] }));
    return null;
  },
  detenerPromocion(promoId: string) {
    actualizarPromo(promoId, (p) => ({ ...p, estado: 'detenida' }));
  },
  registrarVistas(promoIds: string[]) {
    if (promoIds.length === 0) return;
    set((s) => ({ ...s, promociones: s.promociones.map((p) => (promoIds.includes(p.id) ? { ...p, vistas: p.vistas + 1 } : p)) }));
  },
  registrarClic(promoId: string) {
    actualizarPromo(promoId, (p) => ({ ...p, clics: p.clics + 1 }));
  },

  // ---------- Verificación de documentos ----------
  /**
   * Envía documentos a revisión. SOLO DEMO: se aprueban solos a los 3 s.
   * En producción los revisa un moderador o un servicio de verificación de identidad.
   */
  enviarDocumento(usuarioId: string, tipo: TipoDocumento): string | null {
    // La cédula se compara con la foto de perfil: sin foto no hay contra qué verificar
    if (tipo === 'cedula' && !estado.cuentas.find((c) => c.id === usuarioId)?.foto) {
      return 'Primero sube tu foto de perfil: la comparamos con la foto de tu cédula.';
    }
    const fijar = (estadoDoc: 'en-revision' | 'verificado') => set((s) => ({
      ...s,
      cuentas: s.cuentas.map((c) => (c.id === usuarioId ? { ...c, documentos: { ...c.documentos, [tipo]: estadoDoc } } : c)),
    }));
    fijar('en-revision');
    setTimeout(() => fijar('verificado'), 3000);
    return null;
  },
  actualizarNombre(usuarioId: string, nombre: string) {
    if (nombre.trim().length < 2) return;
    set((s) => ({ ...s, cuentas: s.cuentas.map((c) => (c.id === usuarioId ? { ...c, nombre: nombre.trim() } : c)) }));
    nube?.actualizarNombre(nombre.trim());
  },

  /** Borra TODO (cuentas, publicaciones, pagos) y vuelve a los datos de ejemplo. */
  /** Demo: borra la cuenta y sus datos de este dispositivo (en la nube lo hace eliminarCuentaNube). */
  eliminarCuentaLocal(usuarioId: string) {
    set((s) => ({
      ...s,
      sesionId: null,
      cuentas: s.cuentas.filter((c) => c.id !== usuarioId),
      posts: s.posts.filter((p) => p.autorId !== usuarioId),
      conversaciones: s.conversaciones.filter((c) => !c.participantes.includes(usuarioId)),
      redes: s.redes.map((r) => ({ ...r, miembros: r.miembros.filter((m) => m.usuarioId !== usuarioId) })),
      calificaciones: s.calificaciones.filter((c) => c.deId !== usuarioId && c.paraId !== usuarioId),
      historias: s.historias.filter((h) => h.autorId !== usuarioId),
      notas: s.notas.filter((n) => n.autorId !== usuarioId),
      reels: s.reels.filter((r) => r.autorId !== usuarioId),
      empresas: s.empresas.filter((e) => e.duenoId !== usuarioId),
    }));
  },
  reiniciarDemo() {
    set(() => inicial());
  },
};

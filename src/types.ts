import type { EnlacesSociales } from './redesSociales';

export type Categoria = 'servicio' | 'garaje' | 'trueque' | 'seguridad' | 'oferta' | 'evento';

export type ModoServicio = 'necesito' | 'ofrezco';
export type Frecuencia = 'una-vez' | 'semanal' | 'quincenal' | 'mensual';
export type EstadoServicio = 'abierta' | 'asignada' | 'pagada' | 'completada' | 'cancelada';

/** Propuesta de un vecino para cubrir una necesidad publicada */
export interface Postulacion {
  id: string;
  proveedorId: string;
  proveedor: string;
  verificado: boolean;
  mensaje: string;
  /** Valor propuesto en pesos colombianos */
  precio: number;
  creado: number;
}

/** Pago de un servicio: el dinero queda retenido hasta que el cliente confirma que se realizó */
export interface Pago {
  id: string;
  postId: string;
  titulo: string;
  clienteId: string;
  proveedorId: string;
  proveedor: string;
  /** Valor del servicio acordado */
  valor: number;
  /** Costo de la pasarela de pagos, a cargo del cliente */
  pasarela: number;
  /** Lo que paga el cliente: valor + pasarela */
  total: number;
  /** Comisión de la plataforma, descontada al proveedor */
  comision: number;
  /** Lo que recibe el proveedor: valor − comisión */
  neto: number;
  estado: 'retenido' | 'liberado' | 'reembolsado';
  creado: number;
}

export interface Barrio {
  id: string;
  nombre: string;
  /** Localidad de Bogotá (al expandir: comuna/zona según la ciudad) */
  localidad: string;
  /** 'Bogotá' por ahora; el campo existe para expandir a otras ciudades */
  ciudad: string;
  lat: number;
  lng: number;
}

export interface Usuario {
  id: string;
  nombre: string;
  /** Correo único de la cuenta, en minúsculas. Privado: no se muestra a otros vecinos. */
  correo: string;
  barrioId: string;
  lat: number;
  lng: number;
  /** true si la ubicación del dispositivo coincidió con el barrio declarado (verificación por GPS) */
  verificado: boolean;
  radioKm: number;
  /** Verificaciones adicionales exigidas para servicios de mayor riesgo */
  documentos?: Partial<Record<TipoDocumento, EstadoDocumento>>;
  /** Presentación corta del perfil */
  bio?: string;
  /** Enlaces a redes sociales (ya validados) */
  redes?: EnlacesSociales;
  /** id de la foto de perfil en IndexedDB (recortada cuadrada, se muestra en círculo) */
  foto?: string;
  /** Quién puede ver la foto. Por defecto: todos los vecinos */
  visibilidadFoto?: VisibilidadFoto;
  /** Oficios o habilidades ("Plomería", "Clases de inglés"…) para que los vecinos te encuentren */
  oficios?: string[];
}

/**
 * todos     = cualquier vecino
 * redes     = miembros de mis redes + mis contactos
 * contactos = solo personas con las que he conversado (ambos escribieron) o hecho un servicio pagado
 */
export type VisibilidadFoto = 'todos' | 'redes' | 'contactos';

// ---------- Empresas y negocios ----------
export interface Empresa {
  id: string;
  duenoId: string;
  nombre: string;
  /** id del rubro en el catálogo de servicios, o 'otro' */
  rubro: string;
  descripcion: string;
  /** ids de fotos en IndexedDB */
  logo?: string;
  portada?: string;
  barrioId: string;
  lat: number;
  lng: number;
  direccion: string;
  telefono: string;
  horario: string;
  redes: EnlacesSociales;
  /** NIT o RUT (opcional; se pide para la insignia de negocio verificado) */
  nit: string;
  verificacion: 'no' | 'en-revision' | 'verificada';
  seguidores: string[];
  creado: number;
}

/** cedula = identidad · antecedentes = certificados de Policía y Procuraduría */
export type TipoDocumento = 'cedula' | 'antecedentes';
export type EstadoDocumento = 'en-revision' | 'verificado' | 'rechazado';

// ---------- Chat privado ----------
export interface MensajePrivado {
  id: string;
  autorId: string;
  texto: string;
  /** id de una foto guardada en IndexedDB */
  foto?: string;
  creado: number;
}

export interface Conversacion {
  id: string;
  /** Siempre dos participantes */
  participantes: [string, string];
  nombres: Record<string, string>;
  /** Publicación que originó la conversación, si la hay */
  postId?: string;
  postTitulo?: string;
  mensajes: MensajePrivado[];
  /** Última vez que cada participante abrió la conversación */
  leido: Record<string, number>;
}

// ---------- Promociones (publicaciones pagadas) ----------
export type PlanPromocionId = 'cuadra' | 'barrio' | 'localidad';

export interface Promocion {
  id: string;
  postId: string;
  autorId: string;
  plan: PlanPromocionId;
  alcanceKm: number;
  inicio: number;
  fin: number;
  /** Precio del plan (ingreso de la plataforma) */
  precio: number;
  pasarela: number;
  total: number;
  /** Veces que apareció en el feed de un vecino */
  vistas: number;
  /** Veces que la abrieron desde el espacio promocionado */
  clics: number;
  estado: 'activa' | 'detenida';
}

// ---------- Reputación y moderación ----------
/** Solo se puede calificar después de un servicio PAGADO por la app (reseñas verificadas). */
export interface Calificacion {
  id: string;
  pagoId: string;
  deId: string;
  deNombre: string;
  paraId: string;
  estrellas: number;
  comentario: string;
  creado: number;
}

export type MotivoReporte = 'estafa' | 'falso' | 'discriminacion' | 'ofensivo' | 'peligroso' | 'otro';

export interface Reporte {
  id: string;
  postId: string;
  porId: string;
  motivo: MotivoReporte;
  creado: number;
}

// ---------- Redes de seguridad y de apoyo ----------
export type TipoRed = 'seguridad' | 'apoyo';

export interface MiembroRed {
  usuarioId: string;
  nombre: string;
  rol: 'coordinador' | 'miembro';
  unido: number;
}

/** mensaje = conversación · llegue-bien = check-in · sos = emergencia · ayuda = solicitud de apoyo */
export type TipoMensajeRed = 'mensaje' | 'llegue-bien' | 'sos' | 'ayuda';

export interface RespuestaAlerta {
  usuarioId: string;
  nombre: string;
  accion: 'voy' | 'llame-123' | 'ayudo';
  creado: number;
}

export interface MensajeRed {
  id: string;
  autorId: string;
  autor: string;
  tipo: TipoMensajeRed;
  texto: string;
  creado: number;
  /** Solo en SOS: ubicación que el vecino decidió compartir con su red */
  lat?: number;
  lng?: number;
  respuestas: RespuestaAlerta[];
  resuelta?: boolean;
}

export interface Red {
  id: string;
  nombre: string;
  tipo: TipoRed;
  descripcion: string;
  barrioId: string;
  /** Privada = solo se entra con el código de invitación */
  privada: boolean;
  codigo: string;
  creadorId: string;
  miembros: MiembroRed[];
  mensajes: MensajeRed[];
  creado: number;
  /** Total de miembros cuando no soy miembro (en ese caso no se me envía la lista, por privacidad) */
  totalMiembros?: number;
}

/** Cuenta con credenciales. Nunca se guarda la contraseña, solo su hash con sal. */
export interface Cuenta extends Usuario {
  /** Publicaciones guardadas por el usuario (privado) */
  guardados?: string[];
  /** ids de vecinos que reportaron la foto de perfil (con 3 se retira) */
  reportesFoto?: string[];
  /** true si la foto fue retirada por reportes (se le avisa al dueño) */
  fotoRetirada?: boolean;
  hashClave: string;
  sal: string;
  creado: number;
}

export interface Respuesta {
  id: string;
  autor: string;
  texto: string;
  creado: number;
}

interface PostBase {
  id: string;
  categoria: Categoria;
  titulo: string;
  descripcion: string;
  autorId: string;
  autor: string;
  autorVerificado: boolean;
  barrioId: string;
  /** Ubicación aproximada (difuminada ~150 m) para proteger la privacidad */
  lat: number;
  lng: number;
  creado: number;
  respuestas: Respuesta[];
  /** ids de fotos guardadas en IndexedDB (máx. 4) */
  fotos?: string[];
  /** Oculta automáticamente al recibir 3 reportes de vecinos distintos */
  oculta?: boolean;
  /** ids de vecinos que le dieron "Me gusta" (NO afecta el orden del feed) */
  meGusta?: string[];
  /** Veces que se compartió */
  compartidos?: number;
  /** Si se publicó a nombre de un negocio */
  empresaId?: string;
  /** true = solo existe en este dispositivo (p. ej. una contratación privada); no se sube a la nube */
  local?: boolean;
}

// ---------- Historias, reels y notas (contenido corto, solo del barrio) ----------
/** Foto o texto que desaparece a las 24 horas. */
export interface Historia {
  id: string;
  autorId: string;
  autor: string;
  barrioId: string;
  lat: number;
  lng: number;
  /** id de la foto en IndexedDB; si no hay, es una historia de solo texto */
  foto?: string;
  texto: string;
  /** Color de fondo de las historias de texto */
  fondo: string;
  creado: number;
  expira: number;
  /** ids de quienes la vieron (solo lo ve el autor) */
  vistas: string[];
}

/** Video corto vertical (máx. 60 s). */
export interface Reel {
  id: string;
  autorId: string;
  autor: string;
  barrioId: string;
  lat: number;
  lng: number;
  /** id del video en IndexedDB */
  video: string;
  descripcion: string;
  creado: number;
  meGusta: string[];
  comentarios: Respuesta[];
  reproducciones: number;
  compartidos: number;
}

/** Mensaje corto (máx. 60 caracteres) que aparece sobre la foto del vecino durante 24 h. */
export interface Nota {
  id: string;
  autorId: string;
  autor: string;
  barrioId: string;
  lat: number;
  lng: number;
  texto: string;
  creado: number;
  expira: number;
}

export interface PostTrueque extends PostBase {
  categoria: 'trueque';
  ofrece: string;
  busca: string;
  estado: 'disponible' | 'intercambiado';
}

export type NivelAlerta = 'info' | 'precaucion' | 'urgente';

export interface PostSeguridad extends PostBase {
  categoria: 'seguridad';
  nivel: NivelAlerta;
  /** ids de vecinos que confirman haber visto lo mismo */
  confirmaciones: string[];
}

export interface PostOferta extends PostBase {
  categoria: 'oferta';
  negocio: string;
  precio: string;
  vence: string; // ISO date
}

export interface PostEvento extends PostBase {
  categoria: 'evento';
  fecha: string; // ISO datetime-local
  lugar: string;
  asistentes: string[];
}

export interface PostServicio extends PostBase {
  categoria: 'servicio';
  /** 'necesito' = un vecino busca quién le preste el servicio; 'ofrezco' = un proveedor anuncia su oficio/negocio */
  modo: ModoServicio;
  /** id del rubro en el catálogo (src/servicios.ts) */
  rubro: string;
  /** Pesos colombianos. 0 = precio a convenir */
  valor: number;
  unidad: string;
  frecuencia: Frecuencia;
  /** Ej: "Jueves", "Lunes a viernes" */
  dia: string;
  estado: EstadoServicio;
  postulaciones: Postulacion[];
  asignadoId?: string;
  /** Veces que se ha completado (para servicios recurrentes) */
  realizados: number;
}

export interface ArticuloGaraje {
  id: string;
  nombre: string;
  /** Pesos colombianos */
  precio: number;
  /** id de la foto en IndexedDB */
  foto?: string;
  estado: 'disponible' | 'apartado' | 'vendido';
  apartadoPorId?: string;
  apartadoPor?: string;
}

/** Venta de garaje: un vecino vende cosas usadas en su casa durante un horario. */
export interface PostGaraje extends PostBase {
  categoria: 'garaje';
  /** Fecha y hora de inicio y fin (formato datetime-local) */
  inicio: string;
  fin: string;
  /** Dirección o referencia; opcional (también se puede dar por privado) */
  direccion: string;
  mediosPago: string[];
  articulos: ArticuloGaraje[];
  asistentes: string[];
}

export type Post = PostServicio | PostGaraje | PostTrueque | PostSeguridad | PostOferta | PostEvento;

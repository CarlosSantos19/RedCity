/**
 * Enlaces a redes sociales de vecinos y negocios.
 * Se aceptan usuarios (@miempresa) o enlaces completos, pero SOLO del dominio de cada red:
 * así nadie puede disfrazar un enlace de estafa como si fuera "Facebook".
 */
export type RedSocial = 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'x' | 'youtube' | 'whatsapp' | 'web';
export type EnlacesSociales = Partial<Record<RedSocial, string>>;

interface InfoRed {
  nombre: string;
  icono: string;
  color: string;
  placeholder: string;
  /** Dominios válidos para esta red (vacío = cualquier sitio, solo para "web") */
  dominios: string[];
  /** Cómo construir el enlace a partir de un nombre de usuario */
  desdeUsuario?: (u: string) => string;
}

export const REDES: Record<RedSocial, InfoRed> = {
  facebook: { nombre: 'Facebook', icono: 'f', color: '#1877f2', placeholder: 'facebook.com/minegocio o minegocio', dominios: ['facebook.com', 'fb.com', 'fb.me'], desdeUsuario: (u) => `https://www.facebook.com/${u}` },
  instagram: { nombre: 'Instagram', icono: '◎', color: '#c13584', placeholder: '@minegocio', dominios: ['instagram.com', 'instagr.am'], desdeUsuario: (u) => `https://www.instagram.com/${u}` },
  linkedin: { nombre: 'LinkedIn', icono: 'in', color: '#0a66c2', placeholder: 'linkedin.com/in/tu-nombre', dominios: ['linkedin.com', 'lnkd.in'], desdeUsuario: (u) => `https://www.linkedin.com/in/${u}` },
  tiktok: { nombre: 'TikTok', icono: '♪', color: '#111111', placeholder: '@minegocio', dominios: ['tiktok.com'], desdeUsuario: (u) => `https://www.tiktok.com/@${u}` },
  x: { nombre: 'X', icono: '𝕏', color: '#111111', placeholder: '@minegocio', dominios: ['x.com', 'twitter.com'], desdeUsuario: (u) => `https://x.com/${u}` },
  youtube: { nombre: 'YouTube', icono: '▶', color: '#ff0000', placeholder: '@micanal', dominios: ['youtube.com', 'youtu.be'], desdeUsuario: (u) => `https://www.youtube.com/@${u}` },
  whatsapp: { nombre: 'WhatsApp', icono: '✆', color: '#25d366', placeholder: '300 123 4567', dominios: ['wa.me', 'whatsapp.com'] },
  web: { nombre: 'Sitio web', icono: '🌐', color: '#475569', placeholder: 'www.minegocio.com', dominios: [] },
};

export const ORDEN_REDES: RedSocial[] = ['whatsapp', 'facebook', 'instagram', 'linkedin', 'tiktok', 'x', 'youtube', 'web'];

/** Celular colombiano → 57XXXXXXXXXX, o null si no es válido. */
export function celularColombia(texto: string): string | null {
  const d = texto.replace(/\D/g, '');
  if (/^3\d{9}$/.test(d)) return '57' + d;
  if (/^573\d{9}$/.test(d)) return d;
  return null;
}

/** Convierte lo que escribió el usuario en un enlace seguro, o devuelve un error. Vacío = sin enlace. */
export function normalizarEnlace(red: RedSocial, valor: string): { url?: string; error?: string } {
  const v = valor.trim();
  if (!v) return {};
  const info = REDES[red];

  if (red === 'whatsapp') {
    const cel = celularColombia(v);
    return cel ? { url: `https://wa.me/${cel}` } : { error: 'Escribe un celular colombiano de 10 dígitos (ej: 300 123 4567).' };
  }

  const pareceEnlace = /[./]/.test(v) && !v.startsWith('@');
  if (!pareceEnlace) {
    const usuario = v.replace(/^@/, '');
    if (!info.desdeUsuario) return { error: 'Escribe la dirección completa del sitio (ej: www.minegocio.com).' };
    if (!/^[\w.-]{2,60}$/.test(usuario)) return { error: `Usuario de ${info.nombre} no válido.` };
    return { url: info.desdeUsuario(usuario) };
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
  } catch {
    return { error: 'Ese enlace no es válido.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'Solo se permiten enlaces web (https).' };
  url.protocol = 'https:';
  const host = url.hostname.replace(/^(www|m|web)\./, '');
  if (info.dominios.length && !info.dominios.some((d) => host === d || host.endsWith('.' + d))) {
    return { error: `Ese enlace no es de ${info.nombre}.` };
  }
  return { url: url.toString() };
}

/** Valida un conjunto de enlaces. Devuelve los enlaces limpios y los errores por red. */
export function validarEnlaces(entrada: Partial<Record<RedSocial, string>>) {
  const enlaces: EnlacesSociales = {};
  const errores: Partial<Record<RedSocial, string>> = {};
  for (const red of ORDEN_REDES) {
    const r = normalizarEnlace(red, entrada[red] ?? '');
    if (r.error) errores[red] = r.error;
    else if (r.url) enlaces[red] = r.url;
  }
  return { enlaces, errores, ok: Object.keys(errores).length === 0 };
}

/** Texto corto para mostrar en el formulario a partir de un enlace guardado. */
export function enlaceAEditable(red: RedSocial, url?: string): string {
  if (!url) return '';
  if (red === 'whatsapp') return url.replace('https://wa.me/57', '');
  return url.replace(/^https:\/\/(www\.)?/, '');
}

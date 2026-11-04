/**
 * Utilidades de cuentas para el MODO DEMO (cuentas guardadas en este navegador).
 * En producción esto lo hace Supabase Auth en el servidor (bcrypt); aquí solo
 * evitamos guardar contraseñas en texto plano.
 *
 * Se usa una implementación propia de SHA-256 porque `crypto.subtle` y
 * `crypto.randomUUID` no existen cuando la app se abre por http://IP-local
 * (p. ej. desde el celular en la misma WiFi), que no es un "contexto seguro".
 */

// ---------- SHA-256 ----------
const PRIMOS: number[] = [];
for (let n = 2; PRIMOS.length < 64; n++) if (PRIMOS.every((p) => n % p !== 0)) PRIMOS.push(n);
const fraccion32 = (x: number) => ((x - Math.floor(x)) * 0x100000000) >>> 0;
const K = PRIMOS.map((p) => fraccion32(Math.cbrt(p)));
const H0 = PRIMOS.slice(0, 8).map((p) => fraccion32(Math.sqrt(p)));
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export function sha256(datos: Uint8Array): Uint8Array {
  const total = Math.ceil((datos.length + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(datos);
  buf[datos.length] = 0x80;
  const dv = new DataView(buf.buffer);
  const bits = datos.length * 8;
  dv.setUint32(total - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(total - 4, bits >>> 0);

  const h = H0.slice();
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => { h[i] = (h[i] + v) >>> 0; });
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  h.forEach((v, i) => odv.setUint32(i * 4, v));
  return out;
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const utf8 = (s: string) => new TextEncoder().encode(s);

/** Bytes aleatorios criptográficamente seguros (getRandomValues sí existe fuera de HTTPS). */
export function aleatorioHex(bytes: number): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function generarId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const h = aleatorioHex(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const ITERACIONES = 2000; // ~100-300 ms en un celular de gama media

/** Hash con sal + iteraciones (estiramiento de clave) para que no se guarde la contraseña. */
export function hashClave(clave: string, sal: string): string {
  const salBytes = utf8(sal);
  let h = sha256(utf8(`${sal}:${clave}`));
  for (let i = 0; i < ITERACIONES; i++) {
    const mezcla = new Uint8Array(h.length + salBytes.length);
    mezcla.set(h);
    mezcla.set(salBytes, h.length);
    h = sha256(mezcla);
  }
  return hex(h);
}

// ---------- Validaciones ----------
/** El correo se guarda y compara sin espacios y en minúsculas. */
export const normalizarCorreo = (c: string) => c.trim().toLowerCase();

export function errorCorreo(c: string): string | null {
  if (c.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c)) return 'Escribe un correo válido, por ejemplo marta@gmail.com';
  return null;
}

export function errorClave(c: string): string | null {
  if (c.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (!/[a-zA-Z]/.test(c) || !/[0-9]/.test(c)) return 'La contraseña debe tener letras y números.';
  return null;
}

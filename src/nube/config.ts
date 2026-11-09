/**
 * Conexión con Supabase.
 * La URL y la clave PUBLICABLE son públicas por diseño (van dentro de la app); lo que protege
 * los datos son las reglas RLS de la base de datos. NUNCA poner aquí la "secret key".
 * Se pueden sobreescribir con variables de entorno VITE_SUPABASE_URL / VITE_SUPABASE_KEY.
 */
export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL ?? 'https://wkjtlkknkbcrveuoubbd.supabase.co';
export const SUPABASE_KEY = import.meta.env?.VITE_SUPABASE_KEY ?? 'sb_publishable_EYYj4p3x2OfACrcunyiXNA_7ufwrgPV';

/**
 * Modo demo: agregando ?demo a la dirección la app funciona solo con datos de ejemplo en el
 * navegador (útil para presentaciones). Se recuerda mientras la pestaña esté abierta.
 */
function quiereDemo(): boolean {
  try {
    if (new URLSearchParams(location.search).has('demo')) sessionStorage.setItem('redcity_demo', '1');
    return sessionStorage.getItem('redcity_demo') === '1';
  } catch {
    return false;
  }
}

/** true = cuentas y publicaciones compartidas en Supabase; false = demo local. */
export const NUBE = typeof location !== 'undefined' && !!SUPABASE_URL && !!SUPABASE_KEY && !quiereDemo();

/** Clave pública de notificaciones (Web Push). Es pública por diseño; la privada solo está en el servidor. */
export const VAPID_PUBLICA = 'BBZ1SYtZUeRlnGBWpbjOm_NGrg-THTQ4iMdpbjdVkGT52ig4Xv1BnzPoynnIFnQKfiGsDtjsr5daZiYCUIncqVY';

import { useState } from 'react';
import type { Barrio, Usuario } from '../types';
import { URL_APP } from '../marca';

const clave = (id: string) => `redcity_bienvenida_${id}`;

/** ¿Este celular ya le mostró la bienvenida a esta cuenta? (si el almacenamiento falla, no se insiste) */
export function bienvenidaVista(usuarioId: string): boolean {
  try { return localStorage.getItem(clave(usuarioId)) === '1'; } catch { return true; }
}
function marcarVista(usuarioId: string) {
  try { localStorage.setItem(clave(usuarioId), '1'); } catch { /* sin almacenamiento */ }
}

/** Enlace que, al abrirlo, deja el barrio ya elegido en el registro. */
export const enlaceBarrio = (barrio?: Barrio) => (barrio ? `${URL_APP}?barrio=${encodeURIComponent(barrio.id)}` : URL_APP);

function mensajeInvitacion(barrio?: Barrio) {
  const donde = barrio ? `de ${barrio.nombre}` : 'de nuestro barrio';
  return `👋 Estoy en RedCity, la red de vecinos ${donde}.\n\n`
    + '🆘 Botón SOS que avisa a los vecinos con tu ubicación\n'
    + '🧰 Servicios de vecinos con calificaciones reales\n'
    + '📦 Ventas y trueques a pocas cuadras\n'
    + '🔒 Sin mostrar tu número de celular\n\n'
    + `Únete gratis: ${enlaceBarrio(barrio)}`;
}

/** Botones para invitar vecinos: WhatsApp, compartir del celular y copiar el enlace. */
export function InvitarVecinos({ barrio, onCompartido }: { barrio?: Barrio; onCompartido?: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const texto = mensajeInvitacion(barrio);

  async function compartir() {
    try { await navigator.share({ title: 'RedCity', text: texto }); onCompartido?.(); } catch { /* el usuario canceló */ }
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2500); onCompartido?.(); }
    catch { prompt('Copia este mensaje:', texto); }
  }

  return (
    <div className="invitar-vecinos">
      <a className="btn whatsapp" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer" onClick={onCompartido}>
        💬 Invitar por WhatsApp
      </a>
      <div className="invitar-botones">
        {typeof navigator.share === 'function' && <button type="button" className="btn secondary chico" onClick={compartir}>📤 Compartir</button>}
        <button type="button" className="btn secondary chico" onClick={copiar}>{copiado ? '✔ Copiado' : '🔗 Copiar mensaje'}</button>
      </div>
    </div>
  );
}

/** Mensaje de entrada: aparece una vez por cuenta en cada celular. */
export function Bienvenida({ usuario, barrio, onCerrar }: { usuario: Usuario; barrio?: Barrio; onCerrar: () => void }) {
  const cerrar = () => { marcarVista(usuario.id); onCerrar(); };
  const nombre = usuario.nombre.split(' ')[0];

  return (
    <div className="modal-fondo" onClick={cerrar}>
      <div className="modal bienvenida" onClick={(e) => e.stopPropagation()}>
        <button className="cerrar" onClick={cerrar} aria-label="Cerrar">✕</button>
        <div className="bienvenida-cabeza">
          <div className="logo">🏘️</div>
          <h2>¡Hola, {nombre}!</h2>
          <p>Ya eres parte de <b>{barrio?.nombre ?? 'tu barrio'}</b> en RedCity.</p>
        </div>

        <h4>Lo que tu barrio gana aquí</h4>
        <ul className="bienvenida-ventajas">
          <li><span>🆘</span><div><b>SOS que no se pierde</b><small>Mantén presionado el botón y tu red recibe una alerta urgente con tu ubicación, aunque tengan la app cerrada.</small></div></li>
          <li><span>🧰</span><div><b>Servicios de confianza</b><small>Plomeros, aseo, clases… con calificaciones que solo dejan los vecinos que de verdad contrataron.</small></div></li>
          <li><span>📦</span><div><b>Ventas ordenadas</b><small>Lo que vendes o regalas no se pierde entre cientos de mensajes de un grupo.</small></div></li>
          <li><span>🔒</span><div><b>Tu número es privado</b><small>Hablas con tus vecinos sin mostrar tu celular, y puedes bloquear o reportar a quien quieras.</small></div></li>
          <li><span>📍</span><div><b>Solo tu barrio</b><small>Nada de contenido de afuera: solo lo que pasa a pocas cuadras de tu casa.</small></div></li>
        </ul>

        <div className="bienvenida-invitar">
          <h4>💌 Entre más vecinos, más útil es</h4>
          <p className="muted">Invita a tus vecinos. El enlace les abre RedCity con <b>{barrio?.nombre ?? 'tu barrio'}</b> ya elegido.</p>
          <InvitarVecinos barrio={barrio} />
        </div>

        <button className="btn primary ancho" onClick={cerrar}>Empezar a explorar mi barrio</button>
      </div>
    </div>
  );
}

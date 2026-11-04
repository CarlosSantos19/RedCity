import { useState } from 'react';
import type { Post, Usuario } from '../types';
import { acciones, useEstado } from '../store';
import { nav } from '../ui';
import { URL_APP } from '../marca';

/** Enlace que abre directamente una publicación (?post=id). */
export const enlacePost = (postId: string) => `${URL_APP}?post=${postId}`;

/** Hoja con opciones para compartir: WhatsApp, copiar enlace o las apps del celular. */
export function HojaCompartir({ titulo, texto, url, onCompartido, onCerrar }: {
  titulo: string; texto: string; url: string; onCompartido: () => void; onCerrar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const mensaje = `${texto}\n${url}`;
  const hecho = () => { onCompartido(); onCerrar(); };

  async function nativo() {
    try { await navigator.share({ title: titulo, text: texto, url }); hecho(); } catch { /* el usuario canceló */ }
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(mensaje); setCopiado(true); onCompartido(); setTimeout(onCerrar, 900); } catch { alert(mensaje); }
  }

  return (
    <div className="modal-fondo encima" onClick={(e) => { e.stopPropagation(); onCerrar(); }}>
      <div className="modal hoja" onClick={(e) => e.stopPropagation()}>
        <h3>Compartir</h3>
        <p className="muted">{titulo}</p>
        <div className="opciones-compartir">
          <a className="opcion" href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noreferrer" onClick={hecho}>
            <span className="opcion-icono whatsapp-fondo">💬</span>WhatsApp
          </a>
          <button className="opcion" onClick={copiar}><span className="opcion-icono">{copiado ? '✔' : '🔗'}</span>{copiado ? 'Copiado' : 'Copiar enlace'}</button>
          {typeof navigator.share === 'function' && (
            <button className="opcion" onClick={nativo}><span className="opcion-icono">📤</span>Más apps</button>
          )}
        </div>
        <button className="btn secondary" onClick={onCerrar}>Cancelar</button>
      </div>
    </div>
  );
}

/**
 * Contadores + botones "Me gusta · Comentar · Compartir · Guardar".
 * Los "me gusta" NO cambian el orden del feed: sigue siendo cronológico.
 */
export function BarraAcciones({ post, usuario, enDetalle = false, onComentar }: {
  post: Post; usuario: Usuario; enDetalle?: boolean; onComentar?: () => void;
}) {
  useEstado(); // re-render al cambiar los guardados
  const [compartiendo, setCompartiendo] = useState(false);
  const likes = post.meGusta ?? [];
  const meGusta = likes.includes(usuario.id);
  const guardado = acciones.guardadosDe(usuario.id).includes(post.id);
  const compartidos = post.compartidos ?? 0;
  const comentarios = post.respuestas.length;

  const parar = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

  return (
    <div className={`interacciones ${enDetalle ? 'en-detalle' : ''}`}>
      {(likes.length > 0 || comentarios > 0 || compartidos > 0) && (
        <div className="contadores">
          <span>{likes.length > 0 && <><span className="burbuja-like">👍</span> {likes.length.toLocaleString('es-CO')}</>}</span>
          <span>
            {comentarios > 0 && `${comentarios} comentario${comentarios === 1 ? '' : 's'}`}
            {comentarios > 0 && compartidos > 0 && ' · '}
            {compartidos > 0 && `${compartidos} ${compartidos === 1 ? 'vez compartido' : 'veces compartido'}`}
          </span>
        </div>
      )}
      <div className="botones-interaccion">
        <button className={meGusta ? 'activo' : ''} onClick={parar(() => acciones.meGusta(post.id, usuario.id))} aria-pressed={meGusta}>
          <span>👍</span>Me gusta
        </button>
        <button onClick={parar(() => (onComentar ? onComentar() : nav.post(post.id)))}><span>💬</span>Comentar</button>
        <button onClick={parar(() => setCompartiendo(true))}><span>↗️</span>Compartir</button>
        <button className={guardado ? 'activo' : ''} onClick={parar(() => acciones.guardar(usuario.id, post.id))} aria-pressed={guardado}>
          <span>🔖</span>{guardado ? 'Guardado' : 'Guardar'}
        </button>
      </div>
      {compartiendo && (
        <HojaCompartir
          titulo={post.titulo}
          texto={`${post.titulo} · visto en RedCity`}
          url={enlacePost(post.id)}
          onCompartido={() => acciones.compartido(post.id)}
          onCerrar={() => setCompartiendo(false)}
        />
      )}
    </div>
  );
}

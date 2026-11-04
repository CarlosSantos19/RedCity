import { useEffect, useRef, useState } from 'react';
import type { Reel, Usuario } from '../types';
import { acciones, nuevoId, useEstado } from '../store';
import { distanciaKm, hace } from '../geo';
import { useFoto } from '../fotos';
import { nav } from '../ui';
import { HojaCompartir } from './Interacciones';
import { Avatar } from './Avatar';
import { URL_APP } from '../marca';

const alternar = (l: string[], v: string) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);

/**
 * Reels del barrio a pantalla completa, deslizando hacia arriba.
 * Orden cronológico (el más nuevo primero) y solo dentro del radio del vecino.
 */
export function VisorReels({ usuario, onCerrar, onCrear }: { usuario: Usuario; onCerrar: () => void; onCrear: () => void }) {
  const { reels } = useEstado();
  const cercanos = reels
    .filter((r) => r.autorId === usuario.id || distanciaKm(usuario.lat, usuario.lng, r.lat, r.lng) <= usuario.radioKm)
    .sort((a, b) => b.creado - a.creado);

  return (
    <div className="visor-reels">
      <header className="reels-cabecera">
        <b>🎬 Reels del barrio</b>
        <div>
          <button onClick={onCrear}>＋ Crear</button>
          <button onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
      </header>
      {cercanos.length === 0 ? (
        <div className="reels-vacio">
          <p>🎬</p>
          <p>Todavía no hay reels en tu barrio.</p>
          <p className="muted">Graba un video corto (hasta 60 s): tu negocio, un evento, tu mascota, el parque…</p>
          <button className="btn primary" onClick={onCrear}>Crear el primer reel</button>
        </div>
      ) : (
        <div className="reels-lista">
          {cercanos.map((r) => <ReelItem key={r.id} reel={r} usuario={usuario} />)}
        </div>
      )}
    </div>
  );
}

function ReelItem({ reel, usuario }: { reel: Reel; usuario: Usuario }) {
  const url = useFoto(reel.video);
  const video = useRef<HTMLVideoElement>(null);
  const contado = useRef(false);
  const [sonido, setSonido] = useState(false);
  const [comentarios, setComentarios] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const meGusta = reel.meGusta.includes(usuario.id);
  const mio = reel.autorId === usuario.id;

  // Reproduce solo el reel que está en pantalla
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        v.play().catch(() => { /* autoplay bloqueado */ });
        if (!contado.current && !mio) {
          contado.current = true;
          acciones.actualizarReel(reel.id, (r) => ({ ...r, reproducciones: r.reproducciones + 1 }));
        }
      } else v.pause();
    }, { threshold: 0.6 });
    obs.observe(v);
    return () => obs.disconnect();
  }, [url, reel.id, mio]);

  return (
    <section className="reel">
      {url ? (
        <video ref={video} src={url} loop playsInline muted={!sonido} className="reel-video" onClick={() => setSonido(!sonido)} />
      ) : (
        <div className="reel-video reel-no-disponible">El video no está disponible en este dispositivo.</div>
      )}
      <span className="reel-sonido">{sonido ? '🔊' : '🔇 Toca para activar el sonido'}</span>

      <div className="reel-info">
        <button className="enlace-nombre" onClick={() => nav.perfil(reel.autorId)}><Avatar usuarioId={reel.autorId} nombre={reel.autor} /><b>{reel.autor}</b></button>
        <span className="muted-claro"> · {hace(reel.creado)}</span>
        {reel.descripcion && <p>{reel.descripcion}</p>}
      </div>

      <div className="reel-acciones">
        <button className={meGusta ? 'activo' : ''} onClick={() => acciones.actualizarReel(reel.id, (r) => ({ ...r, meGusta: alternar(r.meGusta, usuario.id) }))}>
          <span>👍</span>{reel.meGusta.length}
        </button>
        <button onClick={() => setComentarios(true)}><span>💬</span>{reel.comentarios.length}</button>
        <button onClick={() => setCompartiendo(true)}><span>↗️</span>{reel.compartidos}</button>
        <span className="reel-vistas">▶ {reel.reproducciones}</span>
        {mio && <button onClick={() => { if (confirm('¿Borrar este reel?')) acciones.borrarReel(reel.id); }}><span>🗑️</span></button>}
      </div>

      {comentarios && <ComentariosReel reel={reel} usuario={usuario} onCerrar={() => setComentarios(false)} />}
      {compartiendo && (
        <HojaCompartir
          titulo={`Reel de ${reel.autor}`}
          texto={`${reel.descripcion || 'Mira este video'} · en RedCity`}
          url={URL_APP}
          onCompartido={() => acciones.actualizarReel(reel.id, (r) => ({ ...r, compartidos: r.compartidos + 1 }))}
          onCerrar={() => setCompartiendo(false)}
        />
      )}
    </section>
  );
}

function ComentariosReel({ reel, usuario, onCerrar }: { reel: Reel; usuario: Usuario; onCerrar: () => void }) {
  const [texto, setTexto] = useState('');
  function enviar() {
    if (!texto.trim()) return;
    acciones.actualizarReel(reel.id, (r) => ({
      ...r, comentarios: [...r.comentarios, { id: nuevoId(), autor: usuario.nombre, texto: texto.trim(), creado: Date.now() }],
    }));
    setTexto('');
  }
  return (
    <div className="modal-fondo encima" onClick={onCerrar}>
      <div className="modal hoja" onClick={(e) => e.stopPropagation()}>
        <h3>Comentarios ({reel.comentarios.length})</h3>
        <div className="respuestas lista-scroll">
          {reel.comentarios.length === 0 && <p className="muted">Sé el primero en comentar.</p>}
          {reel.comentarios.map((c) => (
            <div key={c.id} className="respuesta"><b>{c.autor}</b> <span className="muted">{hace(c.creado)}</span><br />{c.texto}</div>
          ))}
        </div>
        <div className="responder">
          <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviar()} placeholder="Escribe un comentario…" autoFocus />
          <button className="btn primary" onClick={enviar}>Enviar</button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { Conversacion, Usuario } from '../types';
import { acciones, hayBloqueo, noLeidos, otro, useEstado } from '../store';
import { hace } from '../geo';
import { nav } from '../ui';
import { Foto } from './Fotos';
import { guardarFoto } from '../fotos';
import { Avatar } from './Avatar';
import { AccionesVecino } from './AccionesVecino';

const ultimo = (c: Conversacion) => c.mensajes[c.mensajes.length - 1]?.creado ?? 0;

/** Bandeja de entrada: todas mis conversaciones, la más reciente primero. */
export function Bandeja({ usuario }: { usuario: Usuario }) {
  const { conversaciones } = useEstado();
  const mias = conversaciones
    .filter((c) => c.participantes.includes(usuario.id) && c.mensajes.length > 0)
    .sort((a, b) => ultimo(b) - ultimo(a));

  return (
    <div className="feed">
      <section className="panel">
        <h3>💬 Mensajes privados</h3>
        {mias.length === 0 && (
          <p className="muted">Aún no tienes conversaciones. Abre una publicación o el perfil de un vecino y toca “Escribir en privado”.</p>
        )}
        {mias.map((c) => {
          const otroId = otro(c, usuario.id);
          const ult = c.mensajes[c.mensajes.length - 1];
          const n = noLeidos(c, usuario.id);
          return (
            <button key={c.id} className={`fila-servicio conv ${n ? 'sin-leer' : ''}`} onClick={() => nav.chat(c.id)}>
              <Avatar usuarioId={otroId} nombre={c.nombres[otroId] ?? '?'} />
              <span className="fila-titulo">
                <b>{c.nombres[otroId]}</b> <span className="muted">· {hace(ult.creado)}</span>
                {c.postTitulo && <small className="muted"><br />Sobre: {c.postTitulo}</small>}
                <small><br />{ult.autorId === usuario.id && 'Tú: '}{ult.foto && !ult.texto ? '📷 Foto' : ult.texto}</small>
              </span>
              {n > 0 && <span className="contador">{n}</span>}
            </button>
          );
        })}
      </section>
      <p className="muted centro">🔒 Los mensajes privados solo los ven tú y la otra persona. Nunca compartas claves ni códigos de verificación.</p>
    </div>
  );
}

export function ChatModal({ conv, usuario }: { conv: Conversacion; usuario: Usuario }) {
  const [texto, setTexto] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const otroId = otro(conv, usuario.id);
  const { bloqueos } = useEstado();
  const bloqueado = hayBloqueo(bloqueos, usuario.id, otroId);

  useEffect(() => {
    acciones.marcarLeida(conv.id, usuario.id);
    fin.current?.scrollIntoView({ block: 'end' });
  }, [conv.id, conv.mensajes.length, usuario.id]);

  function enviar() {
    if (!texto.trim()) return;
    acciones.enviarPrivado(conv.id, usuario, texto.trim());
    setTexto('');
  }

  async function enviarFoto(f: File | undefined) {
    if (!f) return;
    setSubiendo(true);
    try { acciones.enviarPrivado(conv.id, usuario, '', await guardarFoto(f)); } catch { alert('No se pudo enviar la foto.'); }
    setSubiendo(false);
    if (archivo.current) archivo.current.value = '';
  }

  return (
    <div className="modal-fondo" onClick={() => nav.chat(null)}>
      <div className="modal chat" onClick={(e) => e.stopPropagation()}>
        <header className="chat-cabecera">
          <button className="enlace-nombre" onClick={() => { nav.chat(null); nav.perfil(otroId); }}>
            <Avatar usuarioId={otroId} nombre={conv.nombres[otroId] ?? '?'} /> <b>{conv.nombres[otroId]}</b>
          </button>
          <button className="cerrar estatico" onClick={() => nav.chat(null)} aria-label="Cerrar">✕</button>
        </header>
        <AccionesVecino usuario={usuario} otroId={otroId} nombre={conv.nombres[otroId] ?? 'este vecino'} conversacionId={conv.id} />
        {conv.postTitulo && (
          <button className="chat-contexto" onClick={() => { nav.chat(null); if (conv.postId) nav.post(conv.postId); }}>
            📌 Sobre: {conv.postTitulo}
          </button>
        )}
        <div className="chat-mensajes">
          {conv.mensajes.length === 0 && <p className="muted centro">Escribe el primer mensaje a {conv.nombres[otroId]}.</p>}
          {conv.mensajes.map((m) => (
            <div key={m.id} className={`burbuja ${m.autorId === usuario.id ? 'mia' : ''}`}>
              {m.foto && <Foto id={m.foto} className="burbuja-foto" />}
              {m.texto && <span>{m.texto}</span>}
              <small>{new Date(m.creado).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}</small>
            </div>
          ))}
          <div ref={fin} />
        </div>
        {bloqueado ? <p className="aviso centro">🚫 No pueden escribirse porque hay un bloqueo entre ustedes.</p> : <div className="responder">
          <button className="btn secondary chico" onClick={() => archivo.current?.click()} disabled={subiendo} aria-label="Enviar foto">📷</button>
          <input ref={archivo} type="file" accept="image/*" hidden onChange={(e) => enviarFoto(e.target.files?.[0])} />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviar()} placeholder="Escribe un mensaje…" autoFocus />
          <button className="btn primary" onClick={enviar}>Enviar</button>
        </div>}
      </div>
    </div>
  );
}

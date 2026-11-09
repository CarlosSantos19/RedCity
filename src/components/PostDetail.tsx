import { useRef, useState } from 'react';
import { BarraAcciones } from './Interacciones';
import type { MotivoReporte, Post, Usuario } from '../types';
import { acciones, useEstado } from '../store';
import { CATEGORIAS, NIVELES } from './categorias';
import { hace } from '../geo';
import { nav } from '../ui';
import { ServicioDetalle } from './ServicioDetalle';
import { Galeria } from './Fotos';
import { Reputacion } from './Estrellas';
import { SeccionPromocion } from './Promocionar';
import { NUBE } from '../nube/config';
import { GarajeDetalle } from './Garaje';

interface Props {
  post: Post;
  usuario: Usuario;
  barrio: string;
}

export const MOTIVOS: Record<MotivoReporte, string> = {
  estafa: 'Estafa o fraude',
  falso: 'Información falsa',
  discriminacion: 'Discriminación o estigmatización',
  ofensivo: 'Contenido ofensivo',
  peligroso: 'Pone en riesgo a alguien o a un menor',
  otro: 'Otro motivo',
};

export function PostDetail({ post, usuario, barrio }: Props) {
  const { reportes } = useEstado();
  const [texto, setTexto] = useState('');
  const campoComentario = useRef<HTMLInputElement>(null);
  const [reportando, setReportando] = useState(false);
  const [motivo, setMotivo] = useState<MotivoReporte>('estafa');
  const [avisoReporte, setAvisoReporte] = useState('');
  const cat = CATEGORIAS[post.categoria];
  const esMio = post.autorId === usuario.id;
  const yaReporte = reportes.some((r) => r.postId === post.id && r.porId === usuario.id);
  const cerrar = () => nav.post(null);

  function enviar() {
    if (!texto.trim()) return;
    acciones.responder(post.id, usuario.nombre, texto.trim());
    setTexto('');
  }

  function reportar() {
    const err = acciones.reportar(post.id, usuario.id, motivo);
    setAvisoReporte(err ?? 'Gracias. Revisaremos esta publicación. Con 3 reportes se oculta automáticamente.');
    setReportando(false);
  }

  return (
    <div className="modal-fondo" onClick={cerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="cerrar" onClick={cerrar} aria-label="Cerrar">✕</button>
        {post.oculta && <p className="aviso peligro">Esta publicación está oculta por reportes de la comunidad y en revisión.</p>}
        <span className="chip-cat" style={{ background: cat.color }}>{cat.icono} {cat.nombre}</span>
        {post.categoria === 'seguridad' && <span className={`nivel ${NIVELES[post.nivel].clase}`}>{NIVELES[post.nivel].nombre}</span>}
        <h2>{post.titulo}</h2>
        <p className="muted">
          {post.empresaId
            ? <button className="enlace-nombre" onClick={() => nav.empresa(post.empresaId!)}>🏢 {post.autor}</button>
            : <button className="enlace-nombre" onClick={() => nav.perfil(post.autorId)}>{post.autor}{post.autorVerificado && ' ✔'}</button>}
          {' '}<Reputacion usuarioId={post.autorId} /> · {barrio} · {hace(post.creado)}
        </p>

        <Galeria fotos={post.fotos ?? []} />

        {post.categoria === 'trueque' && (
          <div className="caja"><b>Ofrece:</b> {post.ofrece}<br /><b>A cambio de:</b> {post.busca}</div>
        )}
        {post.categoria === 'oferta' && (
          <div className="caja"><b>{post.negocio}</b><br />Precio/descuento: {post.precio}<br />Válido hasta: {post.vence}</div>
        )}
        {post.categoria === 'evento' && (
          <div className="caja">🗓️ {new Date(post.fecha).toLocaleString('es-CO', { dateStyle: 'full', timeStyle: 'short' })}<br />📍 {post.lugar}</div>
        )}
        <p>{post.descripcion}</p>

        <BarraAcciones post={post} usuario={usuario} enDetalle onComentar={() => campoComentario.current?.focus()} />

        {esMio && !NUBE && <SeccionPromocion post={post} usuario={usuario} />}

        {post.categoria === 'servicio' && <ServicioDetalle post={post} usuario={usuario} />}
        {post.categoria === 'garaje' && <GarajeDetalle post={post} usuario={usuario} />}

        {post.categoria === 'seguridad' && (
          <>
            {post.nivel === 'urgente' && (
              <a className="btn danger" href="tel:123">📞 Emergencia: llamar a la Línea 123</a>
            )}
            <button className="btn secondary" onClick={() => acciones.confirmarAlerta(post.id, usuario.id)}>
              {post.confirmaciones.includes(usuario.id) ? '✔ Confirmaste esta alerta' : '👁️ Yo también lo vi'} ({post.confirmaciones.length})
            </button>
          </>
        )}
        {post.categoria === 'evento' && (
          <button className="btn secondary" onClick={() => acciones.asistir(post.id, usuario.id)}>
            {post.asistentes.includes(usuario.id) ? '✔ Vas a asistir' : '🙋 Asistiré'} ({post.asistentes.length})
          </button>
        )}
        {post.categoria === 'trueque' && esMio && post.estado === 'disponible' && (
          <button className="btn secondary" onClick={() => acciones.marcarIntercambiado(post.id)}>✔ Marcar como intercambiado</button>
        )}
        {!esMio && (
          <button className="btn secondary" onClick={() => nav.chat(acciones.abrirConversacion(usuario, post.autorId, post.autor, { id: post.id, titulo: post.titulo }))}>
            💬 Escribir en privado a {post.autor}
          </button>
        )}

        <h4>Comentarios ({post.respuestas.length})</h4>
        <div className="respuestas">
          {post.respuestas.map((r) => (
            <div key={r.id} className="respuesta"><b>{r.autor}</b> <span className="muted">{hace(r.creado)}</span><br />{r.texto}</div>
          ))}
          {post.respuestas.length === 0 && <p className="muted">Nadie ha comentado todavía.</p>}
        </div>
        <div className="responder">
          <input
            ref={campoComentario}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && enviar()}
            placeholder={post.categoria === 'trueque' ? 'Propón un intercambio…' : post.categoria === 'servicio' ? 'Pregunta pública (los datos personales, por privado)…' : 'Escribe una respuesta…'}
          />
          <button className="btn primary" onClick={enviar}>Enviar</button>
        </div>

        <div className="pie-detalle">
          {esMio ? (
            <button className="btn link" onClick={() => { acciones.eliminar(post.id); cerrar(); }}>Eliminar publicación</button>
          ) : yaReporte ? (
            <span className="muted">🚩 Ya reportaste esta publicación</span>
          ) : reportando ? (
            <div className="reportar">
              <select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoReporte)}>
                {(Object.keys(MOTIVOS) as MotivoReporte[]).map((m) => <option key={m} value={m}>{MOTIVOS[m]}</option>)}
              </select>
              <button className="btn danger chico" onClick={reportar}>Reportar</button>
              <button className="btn link chico neutro" onClick={() => setReportando(false)}>Cancelar</button>
            </div>
          ) : (
            <button className="btn link" onClick={() => setReportando(true)}>🚩 Reportar publicación</button>
          )}
          {avisoReporte && <p className="aviso">{avisoReporte}</p>}
        </div>
      </div>
    </div>
  );
}

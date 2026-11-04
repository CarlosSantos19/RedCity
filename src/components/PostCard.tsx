import type { Post, Usuario } from '../types';
import { BarraAcciones } from './Interacciones';
import { EstadoVenta, ResumenGaraje } from './Garaje';
import { Avatar } from './Avatar';
import { CATEGORIAS, NIVELES } from './categorias';
import { formatoDistancia, hace } from '../geo';
import { ESTADOS, FRECUENCIAS, RUBRO, cop } from '../servicios';
import { Foto } from './Fotos';
import { Reputacion } from './Estrellas';

interface Props {
  post: Post;
  usuario: Usuario;
  distancia: number;
  barrio: string;
  onAbrir: () => void;
  /** Ocupa uno de los espacios pagados del feed */
  promocionado?: boolean;
}

export function PostCard({ post, usuario, distancia, barrio, onAbrir, promocionado }: Props) {
  const cat = CATEGORIAS[post.categoria];
  const clase = promocionado ? 'promocionado' : post.categoria === 'seguridad' && post.nivel === 'urgente' ? 'urgente' : '';
  return (
    <article className={`post-card ${clase}`} onClick={onAbrir}>
      {promocionado && <div className="etiqueta-promo">📣 Promocionado</div>}
      <header>
        <span className="chip-cat" style={{ background: cat.color }}>{cat.icono} {cat.nombre}</span>
        {post.categoria === 'seguridad' && <span className={`nivel ${NIVELES[post.nivel].clase}`}>{NIVELES[post.nivel].nombre}</span>}
        {post.categoria === 'trueque' && post.estado === 'intercambiado' && <span className="nivel nivel-info">Intercambiado</span>}
        {post.categoria === 'garaje' && <EstadoVenta post={post} />}
        {post.categoria === 'servicio' && (
          <span className={`nivel modo-${post.modo}`}>{post.modo === 'necesito' ? 'Se necesita' : 'Ofrece'}</span>
        )}
        {post.categoria === 'servicio' && post.estado !== 'abierta' && (
          <span className={`estado estado-${post.estado}`}>{ESTADOS[post.estado]}</span>
        )}
        <span className="meta">{formatoDistancia(distancia)} · {hace(post.creado)}</span>
      </header>
      <div className={post.fotos?.length ? 'con-foto' : ''}>
        <div>
      <h3>{post.titulo}</h3>
      {post.categoria === 'servicio' && (
        <p className="trueque-line">
          {RUBRO[post.rubro]?.icono} {RUBRO[post.rubro]?.nombre} ·{' '}
          {post.valor > 0 ? <><b className="precio">{cop(post.valor)}</b> {post.unidad}</> : 'Precio a convenir'}
          {post.frecuencia !== 'una-vez' && ` · ${FRECUENCIAS[post.frecuencia]}`}
          {post.dia && ` (${post.dia})`}
        </p>
      )}
      {post.categoria === 'garaje' && <ResumenGaraje post={post} />}
      {post.categoria === 'trueque' && (
        <p className="trueque-line"><b>Ofrece:</b> {post.ofrece}<br /><b>Busca:</b> {post.busca}</p>
      )}
      {post.categoria === 'oferta' && <p className="trueque-line"><b>{post.negocio}</b> · {post.precio} · hasta {post.vence}</p>}
      {post.categoria === 'evento' && (
        <p className="trueque-line">🗓️ {new Date(post.fecha).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {post.lugar}</p>
      )}
      <p className="desc">{post.descripcion}</p>
        </div>
        {post.fotos?.[0] && (
          <div className="miniatura">
            <Foto id={post.fotos[0]} className="miniatura-img" />
            {post.fotos.length > 1 && <span>+{post.fotos.length - 1}</span>}
          </div>
        )}
      </div>
      <footer>
        <span className="autor-tarjeta">{post.empresaId ? '🏢 ' : <Avatar usuarioId={post.autorId} nombre={post.autor} tamano="chico" />}{post.autor}{post.autorVerificado && <span className="verif" title="Vecino verificado"> ✔</span>} <Reputacion usuarioId={post.autorId} /> · {barrio}</span>
        <span>
          {post.categoria === 'seguridad' && `👁️ ${post.confirmaciones.length} confirman`}
          {post.categoria === 'evento' && `🙋 ${post.asistentes.length} van`}
          {post.categoria === 'garaje' && `🙋 ${post.asistentes.length} irán`}
          {post.categoria === 'servicio' && post.modo === 'necesito' && `🙋 ${post.postulaciones.length} propuestas`}
        </span>
      </footer>
      <BarraAcciones post={post} usuario={usuario} />
    </article>
  );
}

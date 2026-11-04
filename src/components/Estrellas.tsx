import { useState } from 'react';
import { acciones, reputacion, useEstado } from '../store';
import type { Usuario } from '../types';

/** Muestra "⭐ 4.8 (23)" o nada si el vecino aún no tiene reseñas. */
export function Reputacion({ usuarioId, completo = false }: { usuarioId: string; completo?: boolean }) {
  const { calificaciones } = useEstado();
  const { n, promedio } = reputacion(calificaciones, usuarioId);
  if (n === 0) return completo ? <span className="muted">Sin reseñas todavía</span> : null;
  return <span className="reputacion">⭐ {promedio.toFixed(1)} <span className="muted">({n}{completo ? ` reseña${n === 1 ? '' : 's'}` : ''})</span></span>;
}

export function EstrellasFijas({ valor }: { valor: number }) {
  return <span className="estrellas" aria-label={`${valor} de 5 estrellas`}>{'★'.repeat(valor)}<span className="apagadas">{'★'.repeat(5 - valor)}</span></span>;
}

/** Formulario para calificar después de un servicio pagado y confirmado. */
export function Calificar({ pagoId, usuario, aQuien }: { pagoId: string; usuario: Usuario; aQuien: string }) {
  const { calificaciones } = useEstado();
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState('');
  const ya = calificaciones.find((c) => c.pagoId === pagoId && c.deId === usuario.id);

  if (ya) return <p className="aviso ok-fondo">Calificaste a {aQuien} con <EstrellasFijas valor={ya.estrellas} />. ¡Gracias!</p>;

  return (
    <div className="calificar">
      <b>¿Cómo te fue con {aQuien}?</b>
      <div className="estrellas-input">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className={n <= estrellas ? 'on' : ''} onClick={() => setEstrellas(n)} aria-label={`${n} estrellas`}>★</button>
        ))}
      </div>
      <textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={300} placeholder="Cuéntales a tus vecinos cómo fue el servicio (opcional)" />
      {error && <small className="error">{error}</small>}
      <button className="btn primary" disabled={estrellas === 0} onClick={() => setError(acciones.calificar(pagoId, usuario, estrellas, comentario) ?? '')}>
        Publicar calificación
      </button>
      <small className="muted">Solo pueden calificar quienes pagaron el servicio por la app, así las reseñas son reales.</small>
    </div>
  );
}

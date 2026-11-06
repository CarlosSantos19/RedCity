import { useState } from 'react';
import type { PlanPromocionId, Post, Promocion, Usuario } from '../types';
import { acciones, useEstado } from '../store';
import { ESPACIOS_PROMO, PLAN, PLANES, costoPromocion, motivoNoPromocionable, promoActiva } from '../promociones';
import { cop } from '../servicios';
import { distanciaKm } from '../geo';

/** Sección "Promocionar" dentro del detalle de MI publicación. */
export function SeccionPromocion({ post, usuario }: { post: Post; usuario: Usuario }) {
  const { promociones } = useEstado();
  const [abierto, setAbierto] = useState(false);
  const activa = promociones.find((p) => p.postId === post.id && promoActiva(p));
  const motivo = motivoNoPromocionable(post);

  if (activa) return <EstadisticasPromo promo={activa} />;
  if (motivo) return post.categoria === 'seguridad' ? null : <p className="muted">📣 {motivo}</p>;
  return (
    <>
      <button className="btn promo" onClick={() => setAbierto(true)}>📣 Promocionar para que más vecinos lo vean</button>
      {abierto && <ModalPromocionar post={post} usuario={usuario} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

export function EstadisticasPromo({ promo }: { promo: Promocion }) {
  const dias = Math.max(0, Math.ceil((promo.fin - Date.now()) / (24 * 3600_000)));
  const ctr = promo.vistas ? Math.round((promo.clics / promo.vistas) * 100) : 0;
  return (
    <div className="promo-stats">
      <b>📣 Promoción activa · Plan {PLAN[promo.plan].nombre}</b>
      <div className="stats">
        <div><b>{promo.vistas}</b><span>Vecinos la vieron</span></div>
        <div><b>{promo.clics}</b><span>La abrieron ({ctr}%)</span></div>
        <div><b>{dias} d</b><span>Restantes · {promo.alcanceKm} km</span></div>
      </div>
      <button className="btn link" onClick={() => { if (confirm(promo.total > 0 ? '¿Detener la promoción? El valor pagado no se reembolsa.' : '¿Detener la promoción?')) acciones.detenerPromocion(promo.id); }}>
        Detener promoción
      </button>
    </div>
  );
}

function ModalPromocionar({ post, usuario, onCerrar }: { post: Post; usuario: Usuario; onCerrar: () => void }) {
  const { barrios } = useEstado();
  const [planId, setPlanId] = useState<PlanPromocionId>('barrio');
  const [error, setError] = useState('');
  const plan = PLAN[planId];
  const costo = costoPromocion(plan.precio);
  const alcanzados = (km: number) => barrios.filter((b) => distanciaKm(post.lat, post.lng, b.lat, b.lng) <= km).length;
  const fechaEvento = post.categoria === 'evento' ? new Date(post.fecha) : null;
  const diasHastaEvento = fechaEvento ? Math.ceil((fechaEvento.getTime() - Date.now()) / (24 * 3600_000)) : Infinity;

  function pagar() {
    const err = acciones.promocionar(post.id, usuario, planId);
    if (err) return setError(err);
    onCerrar();
  }

  return (
    <div className="modal-fondo encima" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <h2>📣 Promocionar</h2>
        <p className="muted">“{post.titulo}”</p>

        <div className="planes">
          {PLANES.map((p) => (
            <button key={p.id} className={`plan ${p.id === planId ? 'activo' : ''}`} onClick={() => setPlanId(p.id)}>
              <span className="plan-icono">{p.icono}</span>
              <b>{p.nombre}</b>
              <span className="plan-precio">{p.precio > 0 ? cop(p.precio) : 'Gratis'}</span>
              <small>{p.dias} días · {p.alcanceKm} km</small>
              <small className="muted">~{alcanzados(p.alcanceKm)} barrio(s)</small>
            </button>
          ))}
        </div>

        {diasHastaEvento < plan.dias && (
          <p className="aviso">🗓️ Tu evento es en {diasHastaEvento} día(s): la promoción termina automáticamente cuando empiece.</p>
        )}

        <div className="caja">
          <b>Así se verá:</b> con la etiqueta <span className="etiqueta-promo">📣 Promocionado</span> en el feed de los vecinos que estén a
          {' '}{plan.alcanceKm} km o menos, aunque ellos usen un radio más pequeño. Hay solo {ESPACIOS_PROMO} espacios promocionados por pantalla
          y se turnan entre los anunciantes, así que nadie llena el feed de publicidad.
        </div>

        {costo.total > 0 && <div className="desglose">
          <div><span>Plan {plan.nombre} ({plan.dias} días)</span><b>{cop(costo.precio)}</b></div>
          <div className="muted"><span>Costo de la transacción*</span><span>+ {cop(costo.pasarela)}</span></div>
          <div className="total"><span>Total</span><b>{cop(costo.total)}</b></div>
          <small className="muted">* Estimado; depende del medio de pago. Demo: el pago es simulado.</small>
        </div>}

        {error && <p className="aviso peligro">{error}</p>}
        <button className="btn promo" onClick={pagar}>{costo.total > 0 ? `💳 Pagar ${cop(costo.total)} y promocionar` : '📣 Promocionar gratis'}</button>
        <small className="muted">Las alertas de seguridad no se pueden promocionar. Las promociones que infrinjan las normas de la comunidad se retiran{costo.total > 0 && ' sin reembolso'}.</small>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { acciones, useEstado } from '../store';
import { hace } from '../geo';
import { nav } from '../ui';
import type { AvisoCampana } from '../types';

const ICONO: Record<AvisoCampana['tipo'], string> = {
  comentario: '💬', propuesta: '💼', propuesta_aceptada: '✅', me_gusta: '👍', seguridad: '🚨',
};

/** Campanita 🔔 de la barra superior: avisos de actividad en lo mío y alertas de seguridad cercanas. */
export function Campanita() {
  const { avisos, posts } = useEstado();
  const [abierta, setAbierta] = useState(false);
  const sinLeer = avisos.filter((a) => !a.leido).length;

  function abrir() {
    setAbierta(true);
    acciones.marcarAvisosLeidos();
  }
  function irA(a: AvisoCampana) {
    setAbierta(false);
    if (a.postId) nav.post(a.postId);
  }

  return (
    <>
      <button className="campanita" onClick={abrir} aria-label={sinLeer ? `Avisos: ${sinLeer} sin leer` : 'Avisos'}>
        🔔{sinLeer > 0 && <i>{sinLeer > 9 ? '9+' : sinLeer}</i>}
      </button>
      {abierta && (
        <div className="modal-fondo" onClick={() => setAbierta(false)}>
          <div className="modal avisos" onClick={(e) => e.stopPropagation()}>
            <button className="cerrar" onClick={() => setAbierta(false)} aria-label="Cerrar">✕</button>
            <h2>🔔 Avisos</h2>
            {avisos.length === 0 ? (
              <p className="muted">
                Aún no tienes avisos. Aquí verás cuando comenten tus publicaciones, te envíen propuestas
                o publiquen una alerta de seguridad cerca de ti.
              </p>
            ) : (
              <ul className="lista-avisos">
                {avisos.map((a) => {
                  const existe = !a.postId || posts.some((p) => p.id === a.postId);
                  return (
                    <li key={a.id}>
                      <button className={`aviso-item ${a.tipo} ${a.leido ? '' : 'nuevo'}`} onClick={() => irA(a)} disabled={!existe}>
                        <span className="aviso-icono">{ICONO[a.tipo]}</span>
                        <span className="aviso-texto">
                          <b>{a.titulo}</b>
                          {a.cuerpo && <small>{a.cuerpo}</small>}
                          <small className="aviso-hace">{hace(a.creado)}{!existe && ' · ya no está disponible'}</small>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}

import { useState } from 'react';
import type { MotivoReporte, Usuario } from '../types';
import { acciones, useEstado } from '../store';
import { MOTIVOS } from './PostDetail';

interface Props {
  usuario: Usuario;
  otroId: string;
  nombre: string;
  /** Si se reporta desde un chat, para que quien revise sepa cuál conversación es */
  conversacionId?: string;
}

/** Bloquear y reportar a un vecino: se usa en su perfil y en el chat privado. */
export function AccionesVecino({ usuario, otroId, nombre, conversacionId }: Props) {
  const { bloqueos, reportesUsuario } = useEstado();
  const [reportando, setReportando] = useState(false);
  const [motivo, setMotivo] = useState<MotivoReporte>('ofensivo');
  const [detalle, setDetalle] = useState('');
  const [aviso, setAviso] = useState('');

  const loBloquee = bloqueos.some((b) => b.de === usuario.id && b.a === otroId);
  const yaReporte = reportesUsuario.some((r) => r.porId === usuario.id && r.reportadoId === otroId);

  function enviarReporte() {
    const err = acciones.reportarUsuario(usuario.id, otroId, motivo, detalle.trim(), conversacionId);
    setAviso(err ?? 'Gracias. Nuestro equipo revisará tu reporte. Si estás en peligro, llama al 123.');
    if (!err) setReportando(false);
  }

  function bloquear() {
    if (confirm(`¿Bloquear a ${nombre}? Dejarán de ver sus publicaciones y no podrán escribirse ni contratarse. No se le avisará.`)) {
      acciones.bloquear(usuario.id, otroId, nombre);
    }
  }

  return (
    <div className="acciones-vecino">
      {reportando ? (
        <div className="form reporte-vecino">
          <label>¿Qué está pasando?
            <select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoReporte)}>
              {(Object.keys(MOTIVOS) as MotivoReporte[]).map((m) => <option key={m} value={m}>{MOTIVOS[m]}</option>)}
            </select>
          </label>
          <label>Cuéntanos más (opcional)
            <textarea rows={2} maxLength={500} value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Qué pasó y cuándo" />
          </label>
          <div className="botones-postulacion">
            <button className="btn danger chico" onClick={enviarReporte}>Enviar reporte</button>
            <button className="btn link chico neutro" onClick={() => setReportando(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="fila-acciones-vecino">
          {yaReporte
            ? <small className="muted">🚩 Ya reportaste a este vecino</small>
            : <button className="btn link chico" onClick={() => { setAviso(''); setReportando(true); }}>🚩 Reportar</button>}
          {loBloquee
            ? <button className="btn link chico" onClick={() => acciones.desbloquear(usuario.id, otroId)}>Desbloquear</button>
            : <button className="btn link chico" onClick={bloquear}>🚫 Bloquear</button>}
        </div>
      )}
      {aviso && <p className="aviso">{aviso}</p>}
    </div>
  );
}

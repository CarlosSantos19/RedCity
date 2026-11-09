import { useEffect, useState } from 'react';
import { NUBE } from '../nube/config';
import { activarNotificaciones, desactivarNotificaciones, estadoNotificaciones, type EstadoPush } from '../nube/push';

/** Botón para activar los avisos de SOS y mensajes. `compacto` se oculta cuando ya están activos. */
export function ActivarNotificaciones({ compacto = false }: { compacto?: boolean }) {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (NUBE) void estadoNotificaciones().then(setEstado); }, []);

  if (!NUBE || !estado || (compacto && estado !== 'apagado')) return null;

  async function cambiar(fn: () => Promise<EstadoPush>) {
    setOcupado(true);
    setError('');
    try { setEstado(await fn()); } catch { setError('No se pudo cambiar el aviso. Revisa tu conexión e inténtalo de nuevo.'); }
    setOcupado(false);
  }

  if (estado === 'no-disponible') return <p className="muted">🔔 Este navegador no permite notificaciones. En iPhone, primero agrega RedCity a la pantalla de inicio desde Safari.</p>;
  if (estado === 'bloqueado') return <p className="aviso">🔕 Tienes bloqueadas las notificaciones de RedCity. Actívalas en los ajustes del celular para recibir los SOS.</p>;

  return (
    <div className={compacto ? 'aviso' : ''}>
      {estado === 'activo'
        ? <p className="muted">🔔 Las notificaciones están activas en este celular. Te avisamos de los SOS de tus redes y de los mensajes privados, aunque la app esté cerrada.</p>
        : <p>🔔 <b>Activa las notificaciones</b> para enterarte de un SOS de tus redes o de un mensaje, aunque tengas la app cerrada.</p>}
      {estado === 'activo'
        ? <button className="btn link chico" disabled={ocupado} onClick={() => void cambiar(desactivarNotificaciones)}>Desactivar en este celular</button>
        : <button className="btn primary" disabled={ocupado} onClick={() => void cambiar(activarNotificaciones)}>{ocupado ? 'Activando…' : '🔔 Activar notificaciones'}</button>}
      {error && <p className="aviso peligro">{error}</p>}
    </div>
  );
}

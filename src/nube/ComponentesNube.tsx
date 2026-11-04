import { useState } from 'react';
import { cerrarErrorNube, guardarNuevaClave, useNube } from './sincronizar';
import { NUBE } from './config';

/** Pantalla mientras se revisa si hay una sesión guardada (evita mostrar el login un instante). */
export function CargandoNube() {
  return (
    <div className="cargando-nube">
      <img src={`${import.meta.env.BASE_URL}icono-192.png`} alt="" />
      <p>Conectando con tu barrio…</p>
    </div>
  );
}

/** Aviso flotante cuando falla algo con el servidor. */
export function ErrorNube() {
  const { error } = useNube();
  if (!error) return null;
  return (
    <div className="toast-error" role="alert">
      <span>⚠️ {error}</span>
      <button onClick={cerrarErrorNube} aria-label="Cerrar aviso">✕</button>
    </div>
  );
}

/** Aparece al abrir el enlace de "¿Olvidaste tu contraseña?" que llega al correo. */
export function NuevaClave() {
  const { recuperandoClave } = useNube();
  const [clave, setClave] = useState('');
  const [clave2, setClave2] = useState('');
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);
  if (!recuperandoClave && !listo) return null;

  async function guardar() {
    if (clave !== clave2) return setError('Las contraseñas no coinciden.');
    const err = await guardarNuevaClave(clave);
    if (err) setError(err);
    else setListo(true);
  }

  return (
    <div className="modal-fondo encima">
      <div className="modal form">
        {listo ? (
          <>
            <h2>✅ Contraseña actualizada</h2>
            <p>Ya puedes usar tu nueva contraseña.</p>
            <button className="btn primary" onClick={() => setListo(false)}>Continuar</button>
          </>
        ) : (
          <>
            <h2>🔑 Crea tu nueva contraseña</h2>
            <label>Nueva contraseña
              <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" autoFocus />
              <small className="muted">Mínimo 8 caracteres, con letras y números.</small>
            </label>
            <label>Repítela
              <input type="password" value={clave2} onChange={(e) => setClave2(e.target.value)} autoComplete="new-password" />
            </label>
            {error && <p className="aviso peligro">{error}</p>}
            <button className="btn primary" onClick={guardar} disabled={!clave || !clave2}>Guardar contraseña</button>
          </>
        )}
      </div>
    </div>
  );
}

/** Secciones que todavía funcionan solo en este dispositivo (se comparten en la Etapa 2). */
export function AvisoSoloDispositivo({ que }: { que: string }) {
  if (!NUBE) return null;
  return (
    <div className="aviso-dispositivo">
      🔧 <b>{que}</b> todavía funciona solo en este dispositivo: tus vecinos aún no lo ven. Pronto quedará compartido.
    </div>
  );
}

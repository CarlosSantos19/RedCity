import { useMemo, useState } from 'react';
import { CUENTA_DEMO, acciones, nuevoId, useEstado } from '../store';
import { CIUDAD, LOCALIDADES, estaEnBogota } from '../data/bogota';
import { distanciaKm, obtenerUbicacion } from '../geo';
import { errorClave, errorCorreo, normalizarCorreo } from '../auth';
import type { Barrio } from '../types';

/** Distancia máxima (km) entre el dispositivo y el centro del barrio para marcar al vecino como verificado. */
const RADIO_VERIFICACION_KM = 1.5;

export function Onboarding() {
  const { cuentas } = useEstado();
  const [modo, setModo] = useState<'entrar' | 'registro'>('entrar');

  return (
    <div className="onboarding">
      <div className="brand">
        <div className="logo">🏘️</div>
        <h1>RedCity</h1>
        <p>La red de tu barrio en Bogotá. Servicios, trueque, seguridad, ofertas y eventos a pocas cuadras. Sin algoritmos ni contenido de afuera.</p>
      </div>

      <div className="tabs-acceso">
        <button className={modo === 'entrar' ? 'activo' : ''} onClick={() => setModo('entrar')}>Iniciar sesión</button>
        <button className={modo === 'registro' ? 'activo' : ''} onClick={() => setModo('registro')}>Crear cuenta</button>
      </div>

      {modo === 'entrar' ? <IniciarSesion onCrear={() => setModo('registro')} /> : <Registro />}

      {cuentas.length > 0 && (
        <p className="muted centro">
          {cuentas.length} cuenta(s) en este dispositivo ·{' '}
          <button className="enlace" onClick={() => { if (confirm('Esto borra TODAS las cuentas, publicaciones y pagos del demo. ¿Continuar?')) acciones.reiniciarDemo(); }}>
            Reiniciar demo
          </button>
        </p>
      )}
    </div>
  );
}

function IniciarSesion({ onCrear }: { onCrear: () => void }) {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState('');

  function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError(acciones.iniciarSesion(correo, clave) ?? '');
  }

  return (
    <form className="card form" onSubmit={entrar}>
      <label>Correo electrónico
        <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="tucorreo@gmail.com" autoComplete="email" autoCapitalize="none" autoFocus />
      </label>
      <label>Contraseña
        <div className="campo-clave">
          <input type={verClave ? 'text' : 'password'} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" />
          <button type="button" onClick={() => setVerClave(!verClave)} aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{verClave ? '🙈' : '👁️'}</button>
        </div>
      </label>
      {error && <p className="aviso peligro">{error}</p>}
      <button className="btn primary" type="submit" disabled={!correo || !clave}>Entrar</button>
      <button type="button" className="btn secondary" onClick={() => { setCorreo(CUENTA_DEMO.correo); setClave(CUENTA_DEMO.clave); setError(''); }}>
        🧪 Usar cuenta de prueba
      </button>
      <p className="muted centro">¿No tienes cuenta? <button type="button" className="enlace" onClick={onCrear}>Crear una</button></p>
    </form>
  );
}

function Registro() {
  const { barrios } = useEstado();
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [correoTocado, setCorreoTocado] = useState(false);
  const [clave, setClave] = useState('');
  const [clave2, setClave2] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [localidad, setLocalidad] = useState('');
  const [barrioId, setBarrioId] = useState('');
  const [nuevoBarrio, setNuevoBarrio] = useState('');
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [habeas, setHabeas] = useState(false);

  const barriosLocalidad = useMemo(
    () => barrios.filter((b) => b.localidad === localidad).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [barrios, localidad],
  );
  const creandoBarrio = barrioId === '__nuevo';
  const barrio = barrios.find((b) => b.id === barrioId);

  // Validación en vivo
  const c = normalizarCorreo(correo);
  const errFormato = c ? errorCorreo(c) : null;
  const errUsado = c && !errFormato && !acciones.correoDisponible(c) ? 'Ya existe una cuenta con este correo. Inicia sesión.' : null;
  // El error de formato se muestra al salir del campo, para no regañar mientras se escribe
  const errCorreo = errUsado ?? (correoTocado ? errFormato : null);
  const errClave = clave ? errorClave(clave) : null;
  const errClave2 = clave2 && clave2 !== clave ? 'Las contraseñas no coinciden.' : null;

  async function usarUbicacion() {
    setCargando(true);
    setAviso('');
    try {
      const pos = await obtenerUbicacion();
      setGps(pos);
      if (!estaEnBogota(pos.lat, pos.lng)) {
        setAviso('Parece que no estás en Bogotá. Por ahora la app solo funciona en Bogotá; puedes elegir tu barrio a mano, pero quedarás sin verificar.');
        return;
      }
      const cercano = [...barrios].sort(
        (a, b) => distanciaKm(pos.lat, pos.lng, a.lat, a.lng) - distanciaKm(pos.lat, pos.lng, b.lat, b.lng),
      )[0];
      const d = distanciaKm(pos.lat, pos.lng, cercano.lat, cercano.lng);
      setLocalidad(cercano.localidad);
      if (d <= RADIO_VERIFICACION_KM) {
        setBarrioId(cercano.id);
        setAviso(`📍 Estás en ${cercano.nombre} (${cercano.localidad}).`);
      } else {
        setBarrioId('__nuevo');
        setAviso(`Tu barrio aún no está registrado en ${cercano.localidad}. Escribe su nombre y serás su primer vecino.`);
      }
    } catch (e) {
      setAviso((e as Error).message + '. Puedes elegir tu barrio manualmente.');
    } finally {
      setCargando(false);
    }
  }

  const barrioOk = creandoBarrio ? nuevoBarrio.trim().length >= 3 && !!gps && estaEnBogota(gps.lat, gps.lng) : !!barrio;
  const puedeCrear = nombre.trim().length >= 2 && c && !errFormato && !errUsado && clave && !errClave && clave2 === clave && habeas && localidad && barrioOk;

  function crear(e: React.FormEvent) {
    e.preventDefault();
    let destino: Barrio;
    let creado: Barrio | undefined;
    if (creandoBarrio && gps) {
      creado = { id: nuevoId(), nombre: nuevoBarrio.trim(), localidad, ciudad: CIUDAD, lat: gps.lat, lng: gps.lng };
      destino = creado;
    } else {
      destino = barrio!;
    }
    const verificado = !!gps && distanciaKm(gps.lat, gps.lng, destino.lat, destino.lng) <= RADIO_VERIFICACION_KM;
    const err = acciones.registrar(
      {
        nombre, correo: c, clave, barrioId: destino.id, verificado,
        lat: verificado && gps ? gps.lat : destino.lat,
        lng: verificado && gps ? gps.lng : destino.lng,
      },
      creado,
    );
    setError(err ?? '');
  }

  return (
    <form className="card form" onSubmit={crear}>
      <h3 className="paso">1. Tus datos</h3>
      <label>Nombre (así te verán tus vecinos)
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Marta Rodríguez" maxLength={40} autoComplete="name" />
      </label>
      <label>Correo electrónico
        <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} onBlur={() => setCorreoTocado(true)}
          placeholder="Ej: marta@gmail.com" maxLength={254} autoComplete="email" autoCapitalize="none" />
        {errCorreo ? <small className="error">{errCorreo}</small> : <small>Con él inicias sesión. No se muestra a tus vecinos.</small>}
      </label>
      <label>Contraseña
        <div className="campo-clave">
          <input type={verClave ? 'text' : 'password'} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" />
          <button type="button" onClick={() => setVerClave(!verClave)} aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{verClave ? '🙈' : '👁️'}</button>
        </div>
        {errClave ? <small className="error">{errClave}</small> : <small>Mínimo 8 caracteres, con letras y números.</small>}
      </label>
      <label>Confirmar contraseña
        <input type={verClave ? 'text' : 'password'} value={clave2} onChange={(e) => setClave2(e.target.value)} autoComplete="new-password" />
        {errClave2 && <small className="error">{errClave2}</small>}
      </label>

      <h3 className="paso">2. Tu barrio</h3>
      <button type="button" className="btn secondary" onClick={usarUbicacion} disabled={cargando}>
        {cargando ? 'Buscando…' : '📍 Detectar mi barrio con el GPS'}
      </button>
      {aviso && <p className="aviso">{aviso}</p>}

      <label>Localidad
        <select value={localidad} onChange={(e) => { setLocalidad(e.target.value); setBarrioId(''); }}>
          <option value="">Selecciona tu localidad</option>
          {LOCALIDADES.map((l) => <option key={l}>{l}</option>)}
        </select>
      </label>

      {localidad && (
        <label>Barrio
          <select value={barrioId} onChange={(e) => setBarrioId(e.target.value)}>
            <option value="">Selecciona tu barrio</option>
            {barriosLocalidad.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            <option value="__nuevo">➕ Mi barrio no está en la lista</option>
          </select>
        </label>
      )}

      {creandoBarrio && (
        <label>Nombre de tu barrio
          <input value={nuevoBarrio} onChange={(e) => setNuevoBarrio(e.target.value)} placeholder="Ej: Villa del Prado" />
          {!gps && <small>Para registrar un barrio nuevo necesitamos tu ubicación GPS (toca “Detectar mi barrio”).</small>}
        </label>
      )}

      <label className="check">
        <input type="checkbox" checked={habeas} onChange={(e) => setHabeas(e.target.checked)} />
        <span>Autorizo el tratamiento de mis datos personales y de ubicación según la Ley 1581 de 2012 (Habeas Data). Mi ubicación exacta nunca se muestra a otros vecinos.</span>
      </label>

      {error && <p className="aviso peligro">{error}</p>}
      <button className="btn primary" type="submit" disabled={!puedeCrear}>Crear cuenta y entrar</button>
      <small className="muted">
        Los vecinos que se registran con el GPS dentro del barrio quedan como <b>✔ verificados</b>. Así se evitan perfiles falsos.
      </small>
    </form>
  );
}

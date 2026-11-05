import { useEffect, useMemo, useState } from 'react';
import { CUENTA_DEMO, acciones, nuevoId, useEstado } from '../store';
import { LOCALIDADES } from '../data/bogota';
import { type Municipio, cargarMunicipios, departamentoDe, estaEnColombia, lugarDeBarrio, municipioCercano } from '../data/colombia';
import { distanciaKm, obtenerUbicacion } from '../geo';
import { errorClave, errorCorreo, normalizarCorreo } from '../auth';
import type { Barrio } from '../types';
import { NUBE } from '../nube/config';

/** Distancia máxima (km) entre el dispositivo y el centro del barrio para marcar al vecino como verificado. */
const RADIO_VERIFICACION_KM = 1.5;
/** Distancia máxima (km) entre el GPS y la cabecera del municipio elegido para crear un barrio nuevo allí. */
const MAX_KM_MUNICIPIO = 100;

export function Onboarding() {
  const { cuentas } = useEstado();
  const [modo, setModo] = useState<'entrar' | 'registro'>('entrar');

  return (
    <div className="onboarding">
      <div className="brand">
        <div className="logo">🏘️</div>
        <h1>RedCity</h1>
        <p className="lema">Tu barrio, más unido que nunca.</p>
        <p>Encuentra al plomero de la esquina, vende lo que ya no usas y cuídate con tus vecinos. Todo a pocas cuadras de tu casa.</p>
        <ul className="ventajas">
          <li>🧰 Servicios</li>
          <li>🆘 SOS vecinal</li>
          <li>📦 Ventas de garaje</li>
          <li>🏢 Negocios</li>
          <li>🔄 Trueque</li>
        </ul>
        <p className="sello">📍 En toda Colombia · Sin algoritmos · Gratis</p>
      </div>

      <div className="tabs-acceso">
        <button className={modo === 'entrar' ? 'activo' : ''} onClick={() => setModo('entrar')}>Iniciar sesión</button>
        <button className={modo === 'registro' ? 'activo' : ''} onClick={() => setModo('registro')}>Crear cuenta</button>
      </div>

      {modo === 'entrar' ? <IniciarSesion onCrear={() => setModo('registro')} /> : <Registro />}

      {NUBE && <p className="muted centro">¿Solo quieres ver cómo funciona? <a className="enlace" href="?demo">Abrir la versión de demostración</a></p>}
      {!NUBE && cuentas.length > 0 && (
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
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setAviso('');
    if (!NUBE) return setError(acciones.iniciarSesion(correo, clave) ?? '');
    setEnviando(true);
    const { iniciarSesionEnNube } = await import('../nube/sincronizar');
    setError((await iniciarSesionEnNube(correo, clave)) ?? '');
    setEnviando(false);
  }

  async function olvide() {
    setError('');
    const { recuperarClave } = await import('../nube/sincronizar');
    const err = await recuperarClave(correo);
    if (err) setError(err);
    else setAviso(`📧 Si ${correo} tiene una cuenta, te enviamos un enlace para crear una nueva contraseña. Revisa también la carpeta de spam.`);
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
      {aviso && <p className="aviso">{aviso}</p>}
      <button className="btn primary" type="submit" disabled={!correo || !clave || enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
      {NUBE ? (
        <p className="muted centro">
          <button type="button" className="enlace" onClick={olvide} disabled={!correo}>¿Olvidaste tu contraseña?</button>
          {!correo && <small><br />Escribe tu correo arriba y toca el enlace.</small>}
        </p>
      ) : (
        <button type="button" className="btn secondary" onClick={() => { setCorreo(CUENTA_DEMO.correo); setClave(CUENTA_DEMO.clave); setError(''); }}>
          🧪 Usar cuenta de prueba
        </button>
      )}
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
  const [municipios, setMunicipios] = useState<Municipio[] | null>(null);
  const [errMunicipios, setErrMunicipios] = useState(false);
  const [departamento, setDepartamento] = useState('');
  const [codigoMun, setCodigoMun] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [barrioId, setBarrioId] = useState('');
  const [nuevoBarrio, setNuevoBarrio] = useState('');
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [habeas, setHabeas] = useState(false);

  function traerMunicipios() {
    setErrMunicipios(false);
    return cargarMunicipios().then((m) => { setMunicipios(m); return m; }, () => { setErrMunicipios(true); return null; });
  }
  useEffect(() => { void traerMunicipios(); }, []);

  const departamentos = useMemo(() => [...new Set((municipios ?? []).map((m) => m.d))], [municipios]);
  const municipiosDepto = useMemo(() => (municipios ?? []).filter((m) => m.d === departamento), [municipios, departamento]);
  const municipio = municipios?.find((m) => m.c === codigoMun);
  const esBogota = municipio?.c === '11001';
  const barriosMunicipio = useMemo(
    () => municipio ? barrios.filter((b) => b.ciudad === municipio.m && departamentoDe(b) === municipio.d).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) : [],
    [barrios, municipio],
  );
  const creandoBarrio = barrioId === '__nuevo';
  const barrio = barrios.find((b) => b.id === barrioId);

  // Validación en vivo
  const c = normalizarCorreo(correo);
  const errFormato = c ? errorCorreo(c) : null;
  // En la nube no se puede saber si el correo existe antes de registrarse (protege la privacidad)
  const errUsado = !NUBE && c && !errFormato && !acciones.correoDisponible(c) ? 'Ya existe una cuenta con este correo. Inicia sesión.' : null;
  const [enviando, setEnviando] = useState(false);
  const [revisaCorreo, setRevisaCorreo] = useState(false);
  // El error de formato se muestra al salir del campo, para no regañar mientras se escribe
  const errCorreo = errUsado ?? (correoTocado ? errFormato : null);
  const errClave = clave ? errorClave(clave) : null;
  const errClave2 = clave2 && clave2 !== clave ? 'Las contraseñas no coinciden.' : null;

  function elegirDepartamento(d: string) {
    setDepartamento(d);
    const delDepto = (municipios ?? []).filter((m) => m.d === d);
    // Bogotá D.C. (y cualquier departamento de un solo municipio) se elige solo
    setCodigoMun(delDepto.length === 1 ? delDepto[0].c : '');
    setBarrioId('');
    setLocalidad('');
  }

  async function usarUbicacion() {
    setCargando(true);
    setAviso('');
    try {
      const pos = await obtenerUbicacion();
      setGps(pos);
      if (!estaEnColombia(pos.lat, pos.lng)) {
        setAviso('Parece que no estás en Colombia. RedCity funciona solo en Colombia; puedes elegir tu barrio a mano, pero quedarás sin verificar.');
        return;
      }
      const lista = municipios ?? (await traerMunicipios());
      if (!lista) throw new Error('No se pudo cargar la lista de municipios');
      const cercano = [...barrios].sort(
        (a, b) => distanciaKm(pos.lat, pos.lng, a.lat, a.lng) - distanciaKm(pos.lat, pos.lng, b.lat, b.lng),
      )[0];
      const d = cercano ? distanciaKm(pos.lat, pos.lng, cercano.lat, cercano.lng) : Infinity;
      if (cercano && d <= RADIO_VERIFICACION_KM) {
        const mun = lista.find((m) => m.m === cercano.ciudad && m.d === departamentoDe(cercano)) ?? municipioCercano(lista, pos.lat, pos.lng);
        if (mun) { setDepartamento(mun.d); setCodigoMun(mun.c); }
        setLocalidad(cercano.localidad);
        setBarrioId(cercano.id);
        setAviso(`📍 Estás en ${cercano.nombre} (${lugarDeBarrio(cercano)}).`);
        return;
      }
      const mun = municipioCercano(lista, pos.lat, pos.lng);
      if (!mun) return;
      setDepartamento(mun.d);
      setCodigoMun(mun.c);
      // Sugiere la localidad/comuna del barrio registrado más cercano del mismo municipio
      setLocalidad(cercano && cercano.ciudad === mun.m && d <= 3 ? cercano.localidad : '');
      setBarrioId('__nuevo');
      setAviso(`📍 Estás en ${mun.m} (${mun.d}). Tu barrio aún no está registrado: escribe su nombre y serás su primer vecino. Si ya está en la lista, elígelo.`);
    } catch (e) {
      setAviso((e as Error).message + '. Puedes elegir tu barrio manualmente.');
    } finally {
      setCargando(false);
    }
  }

  // El GPS debe estar en Colombia y razonablemente cerca del municipio elegido
  const kmAlMunicipio = gps && municipio ? distanciaKm(gps.lat, gps.lng, municipio.la, municipio.lo) : 0;
  const gpsOk = !!gps && estaEnColombia(gps.lat, gps.lng) && kmAlMunicipio <= MAX_KM_MUNICIPIO;
  const barrioOk = creandoBarrio ? nuevoBarrio.trim().length >= 3 && !!municipio && gpsOk : !!barrio;
  const puedeCrear = nombre.trim().length >= 2 && c && !errFormato && !errUsado && clave && !errClave && clave2 === clave && habeas && barrioOk;

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (NUBE) {
      // El servidor crea el perfil y calcula él mismo si quedas verificado (GPS a ≤ 1,5 km del barrio)
      setEnviando(true);
      setError('');
      const { registrarEnNube } = await import('../nube/sincronizar');
      const r = await registrarEnNube({
        nombre, correo: c, clave, localidad: localidad.trim(),
        barrio: creandoBarrio ? '' : barrioId,
        barrioNuevo: creandoBarrio ? nuevoBarrio.trim() : undefined,
        ciudad: municipio?.m, departamento: municipio?.d, codigoMunicipio: municipio?.c,
        gps: gps && estaEnColombia(gps.lat, gps.lng) ? gps : undefined,
      });
      setEnviando(false);
      if (r.error) setError(r.error);
      if (r.confirmarCorreo) setRevisaCorreo(true);
      return;
    }
    let destino: Barrio;
    let creado: Barrio | undefined;
    if (creandoBarrio && gps && municipio) {
      creado = { id: nuevoId(), nombre: nuevoBarrio.trim(), localidad: localidad.trim(), ciudad: municipio.m, departamento: municipio.d, lat: gps.lat, lng: gps.lng };
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

      {errMunicipios ? (
        <p className="aviso peligro">No se pudo cargar la lista de municipios. <button type="button" className="enlace" onClick={() => void traerMunicipios()}>Reintentar</button></p>
      ) : !municipios ? (
        <p className="muted">Cargando municipios…</p>
      ) : (
        <>
          <label>Departamento
            <select value={departamento} onChange={(e) => elegirDepartamento(e.target.value)}>
              <option value="">Selecciona tu departamento</option>
              {departamentos.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>

          {departamento && municipiosDepto.length > 1 && (
            <label>Municipio
              <select value={codigoMun} onChange={(e) => { setCodigoMun(e.target.value); setBarrioId(''); setLocalidad(''); }}>
                <option value="">Selecciona tu municipio</option>
                {municipiosDepto.map((m) => <option key={m.c} value={m.c}>{m.m}</option>)}
              </select>
            </label>
          )}
        </>
      )}

      {municipio && (
        <label>Barrio
          <select value={barrioId} onChange={(e) => { setBarrioId(e.target.value); if (e.target.value !== '__nuevo') setLocalidad(''); }}>
            <option value="">{barriosMunicipio.length ? 'Selecciona tu barrio' : `Aún no hay barrios en ${municipio.m}`}</option>
            {barriosMunicipio.map((b) => <option key={b.id} value={b.id}>{b.nombre}{b.localidad ? ` · ${b.localidad}` : ''}</option>)}
            <option value="__nuevo">➕ Mi barrio no está en la lista</option>
          </select>
          {!barriosMunicipio.length && <small>Sé el primer vecino de {municipio.m}: elige “Mi barrio no está en la lista”.</small>}
        </label>
      )}

      {creandoBarrio && municipio && (
        <>
          <label>Nombre de tu barrio
            <input value={nuevoBarrio} onChange={(e) => setNuevoBarrio(e.target.value)} placeholder="Ej: Villa del Prado" maxLength={60} />
            {!gps && <small>Para registrar un barrio nuevo necesitamos tu ubicación GPS (toca “Detectar mi barrio”).</small>}
            {gps && !gpsOk && <small className="error">Tu ubicación está a {Math.round(kmAlMunicipio)} km de {municipio.m}. Revisa el municipio o vuelve a detectar tu ubicación.</small>}
          </label>
          {esBogota ? (
            <label>Localidad
              <select value={localidad} onChange={(e) => setLocalidad(e.target.value)}>
                <option value="">Selecciona tu localidad</option>
                {LOCALIDADES.map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
          ) : (
            <label>Comuna o localidad (opcional)
              <input value={localidad} onChange={(e) => setLocalidad(e.target.value)} placeholder="Ej: Comuna 2" maxLength={60} />
            </label>
          )}
        </>
      )}

      <label className="check">
        <input type="checkbox" checked={habeas} onChange={(e) => setHabeas(e.target.checked)} />
        <span>Tengo 18 años o más y autorizo el tratamiento de mis datos personales y de ubicación según la Ley 1581 de 2012 (Habeas Data) y la <a href={`${import.meta.env.BASE_URL}privacidad.html`} target="_blank" rel="noreferrer">política de privacidad</a>. Mi ubicación exacta nunca se muestra a otros vecinos.</span>
      </label>

      {error && <p className="aviso peligro">{error}</p>}
      {revisaCorreo ? (
        <p className="aviso ok-fondo">
          📧 <b>¡Casi listo!</b> Te enviamos un correo a <b>{c}</b>. Abre el enlace para confirmar tu cuenta y entrarás directo a tu barrio.
          <br /><small>Si no lo ves en unos minutos, revisa la carpeta de spam.</small>
        </p>
      ) : (
        <button className="btn primary" type="submit" disabled={!puedeCrear || enviando}>{enviando ? 'Creando tu cuenta…' : 'Crear cuenta y entrar'}</button>
      )}
      <small className="muted">
        Los vecinos que se registran con el GPS dentro del barrio quedan como <b>✔ verificados</b>. Así se evitan perfiles falsos.
      </small>
    </form>
  );
}

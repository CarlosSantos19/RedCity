import { useState } from 'react';
import type { Barrio, Red, TipoRed, Usuario } from '../types';
import { acciones, alertaActiva, esMiembro } from '../store';
import { distanciaKm } from '../geo';

interface Props {
  usuario: Usuario;
  redes: Red[];
  barrios: Barrio[];
  onAbrir: (redId: string) => void;
}

export const TIPOS_RED: Record<TipoRed, { nombre: string; icono: string; ayuda: string }> = {
  seguridad: { nombre: 'Red de seguridad', icono: '🛡️', ayuda: 'Botón SOS, “Llegué bien” y alertas entre vecinos de confianza.' },
  apoyo: { nombre: 'Red de apoyo', icono: '🤝', ayuda: 'Pedir y ofrecer ayuda: adultos mayores, cuidado de niños, mercados, acompañamiento.' },
};

/** Distancia máxima entre barrios para sugerir redes públicas cercanas. */
const RADIO_SUGERENCIAS_KM = 2;

export function Redes({ usuario, redes, barrios, onAbrir }: Props) {
  const [creando, setCreando] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [errorCodigo, setErrorCodigo] = useState('');

  const centro = new Map(barrios.map((b) => [b.id, b]));
  const mias = redes.filter((r) => esMiembro(r, usuario.id));
  const cercanas = redes.filter((r) => {
    if (r.privada || esMiembro(r, usuario.id)) return false;
    const b = centro.get(r.barrioId);
    return !!b && distanciaKm(usuario.lat, usuario.lng, b.lat, b.lng) <= RADIO_SUGERENCIAS_KM;
  });

  function unirmeConCodigo() {
    const r = acciones.unirsePorCodigo(codigo, usuario);
    if (r.error) return setErrorCodigo(r.error);
    setErrorCodigo('');
    setCodigo('');
    onAbrir(r.redId!);
  }

  const tarjeta = (r: Red, miembro: boolean) => {
    const alertas = r.mensajes.filter(alertaActiva).length;
    return (
      <button key={r.id} className={`tarjeta-red ${alertas ? 'con-alerta' : ''}`} onClick={() => onAbrir(r.id)}>
        <span className="icono-red">{TIPOS_RED[r.tipo].icono}</span>
        <span className="fila-titulo">
          <b>{r.nombre}</b>
          <small className="muted"><br />{centro.get(r.barrioId)?.nombre} · {r.miembros.length} miembros{r.privada && ' · 🔒 privada'}</small>
          {alertas > 0 && <small className="txt-alerta"><br />🆘 {alertas} alerta(s) activa(s)</small>}
        </span>
        {!miembro && <span className="btn primary chico" onClick={(e) => { e.stopPropagation(); acciones.unirseRed(r.id, usuario); onAbrir(r.id); }}>Unirme</span>}
      </button>
    );
  };

  return (
    <div className="feed">
      <div className="aviso peligro">🚨 Las redes <b>no reemplazan</b> a las autoridades. En una emergencia llama primero a la <a href="tel:123">Línea 123</a>.</div>

      <section className="panel">
        <div className="titulo-seccion">
          <h3>Mis redes ({mias.length})</h3>
          <button className="btn primary chico" onClick={() => setCreando(true)}>＋ Crear red</button>
        </div>
        {mias.length === 0 && <p className="muted">Aún no estás en ninguna red. Únete a una de tu barrio o crea la de tu cuadra, edificio o conjunto.</p>}
        {mias.map((r) => tarjeta(r, true))}
      </section>

      <section className="panel">
        <h3>Unirme con código de invitación</h3>
        <div className="responder">
          <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Ej: A1B2C3" maxLength={6} />
          <button className="btn primary" onClick={unirmeConCodigo} disabled={codigo.trim().length < 6}>Unirme</button>
        </div>
        {errorCodigo && <p className="aviso peligro">{errorCodigo}</p>}
      </section>

      <section className="panel">
        <h3>Redes públicas cerca de ti ({cercanas.length})</h3>
        {cercanas.length === 0 && <p className="muted">No hay redes públicas cerca. ¡Crea la primera!</p>}
        {cercanas.map((r) => tarjeta(r, false))}
      </section>

      {creando && <CrearRed usuario={usuario} onCerrar={() => setCreando(false)} onCreada={(id) => { setCreando(false); onAbrir(id); }} />}
    </div>
  );
}

const PLANTILLAS: { tipo: TipoRed; nombre: string; descripcion: string }[] = [
  { tipo: 'seguridad', nombre: 'Seguridad de mi cuadra', descripcion: 'Vecinos de la cuadra que nos cuidamos entre todos.' },
  { tipo: 'seguridad', nombre: 'Edificio / conjunto', descripcion: 'Residentes del edificio: alertas, portería y “llegué bien”.' },
  { tipo: 'apoyo', nombre: 'Apoyo a adultos mayores', descripcion: 'Acompañamos a los vecinos mayores: mercado, citas y visitas.' },
  { tipo: 'apoyo', nombre: 'Mamás y papás del barrio', descripcion: 'Nos apoyamos con recogidas del colegio y cuidado de niños.' },
  { tipo: 'apoyo', nombre: 'Comerciantes del barrio', descripcion: 'Dueños de negocios que nos ayudamos y avisamos novedades.' },
];

function CrearRed({ usuario, onCerrar, onCreada }: { usuario: Usuario; onCerrar: () => void; onCreada: (id: string) => void }) {
  const [tipo, setTipo] = useState<TipoRed>('seguridad');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [privada, setPrivada] = useState(true);

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal form" onClick={(e) => e.stopPropagation()}>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <h2>Crear una red</h2>

        <div className="toggle-modo">
          {(Object.keys(TIPOS_RED) as TipoRed[]).map((t) => (
            <button key={t} className={tipo === t ? 'activo' : ''} onClick={() => setTipo(t)}>{TIPOS_RED[t].icono} {TIPOS_RED[t].nombre}</button>
          ))}
        </div>
        <small className="muted">{TIPOS_RED[tipo].ayuda}</small>

        <p className="muted plantillas-titulo">Ideas rápidas:</p>
        <div className="plantillas">
          {PLANTILLAS.filter((p) => p.tipo === tipo).map((p) => (
            <button key={p.nombre} onClick={() => { setNombre(p.nombre); setDescripcion(p.descripcion); }}>{p.nombre}</button>
          ))}
        </div>

        <label>Nombre de la red
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder="Ej: Seguridad Calle 45 entre 5.ª y 7.ª" />
        </label>
        <label>Descripción y reglas
          <textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={400}
            placeholder="Para qué es la red, quiénes pueden entrar y cómo usarla" />
        </label>
        <label className="check">
          <input type="checkbox" checked={privada} onChange={(e) => setPrivada(e.target.checked)} />
          <span><b>Privada:</b> solo entra quien tenga el código de invitación. Recomendado para redes de seguridad, para que solo estén vecinos que conoces.</span>
        </label>

        <button className="btn primary" disabled={nombre.trim().length < 4}
          onClick={() => onCreada(acciones.crearRed({ nombre, tipo, descripcion, privada }, usuario))}>
          Crear red
        </button>
        <small className="muted">Quedarás como coordinador. Después podrás invitar vecinos con un código o por WhatsApp.</small>
      </div>
    </div>
  );
}

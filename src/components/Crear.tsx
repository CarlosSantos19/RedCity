import { useEffect, useRef, useState } from 'react';
import type { Usuario } from '../types';
import { acciones, useEstado, vigente } from '../store';
import { FONDOS_HISTORIA } from '../data/seed';
import { DURACION_MAX_VIDEO_S, borrarFoto, guardarVideo, useFoto } from '../fotos';
import { SelectorFotos } from './Fotos';

export type TipoCreacion = 'publicacion' | 'historia' | 'reel' | 'envivo' | 'nota' | 'negocio';

const OPCIONES: { tipo: TipoCreacion; icono: string; nombre: string; ayuda: string }[] = [
  { tipo: 'publicacion', icono: '📝', nombre: 'Publicación', ayuda: 'Servicio, trueque, alerta, oferta o evento' },
  { tipo: 'historia', icono: '⭕', nombre: 'Historia', ayuda: 'Foto o texto que dura 24 horas' },
  { tipo: 'reel', icono: '🎬', nombre: 'Reel', ayuda: 'Video corto vertical, hasta 60 s' },
  { tipo: 'envivo', icono: '🔴', nombre: 'En vivo', ayuda: 'Transmite a tus vecinos en directo' },
  { tipo: 'nota', icono: '💭', nombre: 'Nota', ayuda: 'Un mensaje corto sobre tu foto por 24 h' },
  { tipo: 'negocio', icono: '🏢', nombre: 'Página de negocio', ayuda: 'Tu empresa con horario, contacto y redes sociales' },
];

/** Menú que se abre con el botón ＋. */
export function MenuCrear({ onElegir, onCerrar }: { onElegir: (t: TipoCreacion) => void; onCerrar: () => void }) {
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal hoja menu-crear" onClick={(e) => e.stopPropagation()}>
        <h3>Crear</h3>
        {OPCIONES.map((o) => (
          <button key={o.tipo} className="opcion-crear" onClick={() => onElegir(o.tipo)}>
            <span className={`icono-crear ic-${o.tipo}`}>{o.icono}</span>
            <span><b>{o.nombre}</b><small className="muted"><br />{o.ayuda}</small></span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Hoja({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal form" onClick={(e) => e.stopPropagation()}>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <h2>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

export function CrearHistoria({ usuario, onCerrar }: { usuario: Usuario; onCerrar: () => void }) {
  const [fotos, setFotos] = useState<string[]>([]);
  const [texto, setTexto] = useState('');
  const [fondo, setFondo] = useState(FONDOS_HISTORIA[0]);
  const foto = fotos[0];
  const cancelar = () => { fotos.forEach(borrarFoto); onCerrar(); };

  return (
    <Hoja titulo="⭕ Nueva historia" onCerrar={cancelar}>
      <div className="vista-previa-historia" style={{ background: foto ? '#000' : fondo }}>
        {foto ? <VistaFoto id={foto} /> : null}
        <p className={foto ? 'texto-sobre-foto' : 'texto-historia'}>{texto || (foto ? '' : 'Escribe algo para tus vecinos…')}</p>
      </div>
      <SelectorFotos fotos={fotos} onChange={setFotos} max={1} texto="📷 Usar foto" />
      {!foto && (
        <div className="paleta">
          {FONDOS_HISTORIA.map((c) => (
            <button key={c} className={c === fondo ? 'activo' : ''} style={{ background: c }} onClick={() => setFondo(c)} aria-label="Color de fondo" />
          ))}
        </div>
      )}
      <label>Texto
        <textarea rows={2} maxLength={150} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej: ¡Hoy hay empanadas en la esquina! 🥟" />
      </label>
      <small className="muted">La verán los vecinos en tu radio durante 24 horas. Tú verás quién la vio.</small>
      <button className="btn primary" disabled={!foto && !texto.trim()} onClick={() => { acciones.publicarHistoria(usuario, { foto, texto, fondo }); onCerrar(); }}>
        Compartir historia
      </button>
    </Hoja>
  );
}

function VistaFoto({ id }: { id: string }) {
  const url = useFoto(id);
  return url ? <img src={url} alt="" className="historia-foto" /> : null;
}

export function CrearNota({ usuario, onCerrar }: { usuario: Usuario; onCerrar: () => void }) {
  const { notas } = useEstado();
  const actual = notas.find((n) => n.autorId === usuario.id && vigente(n));
  const [texto, setTexto] = useState(actual?.texto ?? '');

  return (
    <Hoja titulo="💭 Tu nota" onCerrar={onCerrar}>
      <div className="vista-previa-nota">
        <span className="nota-burbuja grande">{texto || '¿Qué cuentas, vecino?'}</span>
        <span className="avatar grande">{usuario.nombre[0]}</span>
      </div>
      <label>Nota (máx. 60 caracteres)
        <input value={texto} maxLength={60} onChange={(e) => setTexto(e.target.value)} placeholder="Ej: ¿Alguien tiene un taladro? 🔧" autoFocus />
        <small className="muted">{60 - texto.length} caracteres restantes</small>
      </label>
      <small className="muted">Aparece sobre tu foto en la fila de historias durante 24 horas. Solo puedes tener una.</small>
      <button className="btn primary" disabled={!texto.trim()} onClick={() => { acciones.publicarNota(usuario, texto); onCerrar(); }}>
        {actual ? 'Cambiar nota' : 'Compartir nota'}
      </button>
      {actual && <button className="btn link" onClick={() => { acciones.borrarNota(usuario.id); onCerrar(); }}>Borrar mi nota</button>}
    </Hoja>
  );
}

export function CrearReel({ usuario, onCerrar }: { usuario: Usuario; onCerrar: () => void }) {
  const [video, setVideo] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const url = useFoto(video ?? undefined);

  async function elegir(f?: File) {
    if (!f) return;
    setCargando(true);
    setError('');
    try {
      if (video) await borrarFoto(video);
      setVideo(await guardarVideo(f));
    } catch (e) {
      setError((e as Error).message);
    }
    setCargando(false);
  }

  const cancelar = () => { if (video) borrarFoto(video); onCerrar(); };

  return (
    <Hoja titulo="🎬 Nuevo reel" onCerrar={cancelar}>
      {url ? (
        <video src={url} className="vista-previa-reel" controls playsInline loop autoPlay muted />
      ) : (
        <button className="elegir-video" onClick={() => input.current?.click()} disabled={cargando}>
          {cargando ? '⏳ Procesando…' : <>🎥<br />Grabar o elegir un video<br /><small>Vertical, hasta {DURACION_MAX_VIDEO_S} segundos</small></>}
        </button>
      )}
      <input ref={input} type="file" accept="video/*" capture="environment" hidden onChange={(e) => elegir(e.target.files?.[0])} />
      {video && <button className="btn secondary" onClick={() => input.current?.click()}>Cambiar video</button>}
      {error && <p className="aviso peligro">{error}</p>}
      <label>Descripción
        <textarea rows={2} maxLength={300} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Cuéntale a tus vecinos de qué se trata" />
      </label>
      <small className="muted">Lo verán los vecinos en tu radio. No publiques videos de personas sin su permiso.</small>
      <button className="btn primary" disabled={!video} onClick={() => { acciones.publicarReel(usuario, video!, descripcion); onCerrar(); }}>Publicar reel</button>
    </Hoja>
  );
}

/**
 * EN VIVO: la prueba de cámara funciona; la transmisión real necesita un servidor de video
 * (p. ej. LiveKit, Mux o Agora) que reciba la señal y la reparta a los vecinos.
 */
export function EnVivo({ onCerrar }: { onCerrar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [titulo, setTitulo] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('La cámara solo funciona con conexión segura (HTTPS o localhost).');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true })
      .then((s) => { stream = s; if (video.current) video.current.srcObject = s; })
      .catch(() => setError('No se pudo usar la cámara. Revisa los permisos del navegador.'));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  return (
    <Hoja titulo="🔴 En vivo" onCerrar={onCerrar}>
      <div className="camara">
        {error ? <p>{error}</p> : <video ref={video} autoPlay playsInline muted />}
        <span className="etiqueta-vivo">● VISTA PREVIA</span>
      </div>
      <label>Título de la transmisión
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Bazar de la JAC en vivo" />
      </label>
      <button className="btn danger" disabled>🔴 Iniciar transmisión</button>
      <p className="aviso">
        🛠️ <b>Próximamente.</b> La cámara ya funciona, pero transmitir en directo a tus vecinos necesita un servidor de video
        que todavía no está conectado. Mientras tanto, graba un <b>reel</b> o publica un <b>evento</b>.
      </p>
    </Hoja>
  );
}

import type { Post, Usuario } from '../types';
import { alertaActiva, esMiembro, noLeidos, useEstado } from '../store';
import { distanciaKm, formatoDistancia } from '../geo';
import { nav } from '../ui';
import { RUBRO } from '../servicios';
import { Reputacion } from './Estrellas';
import { Avatar } from './Avatar';
import { InvitarVecinos } from './Bienvenida';
import { NUBE } from '../nube/config';
import { lugarDeBarrio } from '../data/colombia';

export type VistaApp = 'barrio' | 'cerca' | 'redes' | 'mensajes' | 'servicios' | 'perfil';

/**
 * Paneles laterales: solo aparecen en pantallas anchas (computador / tablet horizontal).
 * En el celular la app se ve igual que siempre.
 */
export function PanelIzquierdo({ usuario, vista, onVista, onNegocios, onReels, onCrear }: {
  usuario: Usuario; vista: VistaApp; onVista: (v: VistaApp) => void; onNegocios: () => void; onReels: () => void; onCrear: () => void;
}) {
  const { barrios, redes, conversaciones, empresas } = useEstado();
  const barrio = barrios.find((b) => b.id === usuario.barrioId);
  const misRedes = redes.filter((r) => esMiembro(r, usuario.id));
  const misNegocios = empresas.filter((e) => e.duenoId === usuario.id);
  const sinLeer = conversaciones.filter((c) => c.participantes.includes(usuario.id)).reduce((t, c) => t + noLeidos(c, usuario.id), 0);
  const conAlerta = misRedes.some((r) => r.mensajes.some((m) => alertaActiva(m) && m.autorId !== usuario.id));

  const item = (v: VistaApp, icono: string, nombre: string, extra?: React.ReactNode) => (
    <button className={`lat-item ${vista === v ? 'activo' : ''}`} onClick={() => onVista(v)}>
      <span className="lat-icono">{icono}</span>{nombre}{extra}
    </button>
  );

  return (
    <div className="panel-lateral">
      <div className="marca-lateral">
        <img src={`${import.meta.env.BASE_URL}icono-192.png`} alt="" />
        <div><b>RedCity</b><small>{barrio?.ciudad ?? 'Colombia'}</small></div>
      </div>

      <button className="tarjeta-usuario" onClick={() => onVista('perfil')}>
        <Avatar usuarioId={usuario.id} nombre={usuario.nombre} tamano="grande" />
        <span>
          <b>{usuario.nombre}</b>
          <small>{barrio?.nombre}, {lugarDeBarrio(barrio)}</small>
          <small>{usuario.verificado ? '📍 Vive en el barrio ✔' : 'Sin verificar'} <Reputacion usuarioId={usuario.id} /></small>
        </span>
      </button>

      <nav className="lat-nav">
        {item('barrio', '📰', 'Mi barrio')}
        {item('cerca', '🔎', 'Cerca de mí: panaderías, droguerías…')}
        {item('redes', '🤝', 'Redes de seguridad y apoyo', conAlerta && <i className="lat-alerta">🆘</i>)}
        {item('mensajes', '💬', 'Mensajes', sinLeer > 0 && <i className="lat-contador">{sinLeer}</i>)}
        {item('servicios', '💼', 'Mis servicios')}
        {item('perfil', '👤', 'Mi perfil')}
        {!NUBE && <button className="lat-item" onClick={onNegocios}><span className="lat-icono">🏢</span>Negocios del barrio</button>}
        {!NUBE && <button className="lat-item" onClick={onReels}><span className="lat-icono">🎬</span>Reels</button>}
        <button className="lat-item" onClick={() => onVista('perfil')}><span className="lat-icono">🔖</span>Guardados</button>
      </nav>

      <button className="btn primary" onClick={onCrear}>＋ Crear</button>

      {misRedes.length > 0 && (
        <section className="lat-seccion">
          <h4>Mis redes</h4>
          {misRedes.slice(0, 5).map((r) => {
            const alerta = r.mensajes.some((m) => alertaActiva(m) && m.autorId !== usuario.id);
            return (
              <button key={r.id} className="lat-item chico" onClick={() => nav.red(r.id)}>
                <span className="lat-icono">{r.tipo === 'seguridad' ? '🛡️' : '🤝'}</span>
                <span className="lat-texto">{r.nombre}</span>{alerta && <i className="lat-alerta">🆘</i>}
              </button>
            );
          })}
        </section>
      )}

      {misNegocios.length > 0 && (
        <section className="lat-seccion">
          <h4>Mis negocios</h4>
          {misNegocios.map((e) => (
            <button key={e.id} className="lat-item chico" onClick={() => nav.empresa(e.id)}>
              <span className="lat-icono">🏢</span><span className="lat-texto">{e.nombre}</span>
            </button>
          ))}
        </section>
      )}

      <p className="lat-pie">RedCity · Colombia<br />Tus datos protegidos por la Ley 1581 de 2012<br /><a href={`${import.meta.env.BASE_URL}privacidad.html`} target="_blank" rel="noreferrer">Privacidad</a> · <a href="mailto:redcity.soporte@gmail.com">Soporte</a></p>
    </div>
  );
}

/** Números de emergencia nacionales de Colombia. */
const EMERGENCIAS = [
  { numero: '123', nombre: 'Línea única de emergencias', detalle: 'Policía, bomberos, ambulancias' },
  { numero: '155', nombre: 'Línea 155', detalle: 'Orientación a mujeres víctimas de violencia' },
  { numero: '141', nombre: 'ICBF', detalle: 'Protección de niños, niñas y adolescentes' },
  { numero: '165', nombre: 'GAULA', detalle: 'Secuestro y extorsión' },
  { numero: '122', nombre: 'Fiscalía', detalle: 'Denuncias' },
];

const fechaDe = (p: Post) => (p.categoria === 'evento' ? p.fecha : p.categoria === 'garaje' ? p.inicio : '');

export function PanelDerecho({ usuario, onNegocios }: { usuario: Usuario; onNegocios: () => void }) {
  const { posts, redes, empresas, barrios } = useEstado();
  const ahora = Date.now();
  const cerca = (x: { lat: number; lng: number }, km = usuario.radioKm) => distanciaKm(usuario.lat, usuario.lng, x.lat, x.lng) <= km;

  const alertas = redes
    .filter((r) => esMiembro(r, usuario.id))
    .flatMap((r) => r.mensajes.filter((m) => alertaActiva(m) && m.autorId !== usuario.id).map((m) => ({ r, m })));

  // Próximos eventos y ventas de garaje en mi radio, por fecha (lo más pronto primero)
  const proximos = posts
    .filter((p) => {
      if (p.oculta || !cerca(p)) return false;
      if (p.categoria === 'garaje') return new Date(p.fin).getTime() > ahora;
      if (p.categoria === 'evento') return new Date(p.fecha).getTime() > ahora;
      return false;
    })
    .sort((a, b) => fechaDe(a).localeCompare(fechaDe(b)))
    .slice(0, 5);

  const negocios = empresas
    .map((e) => ({ e, d: distanciaKm(usuario.lat, usuario.lng, e.lat, e.lng) }))
    .filter((x) => x.d <= Math.max(usuario.radioKm, 2))
    .sort((a, b) => a.d - b.d)
    .slice(0, 4);


  return (
    <div className="panel-lateral">
      <section className="lat-tarjeta emergencias">
        <h4>🚨 Emergencias</h4>
        {EMERGENCIAS.map((e) => (
          <a key={e.numero} className="linea-emergencia" href={`tel:${e.numero}`}>
            <b>{e.numero}</b><span>{e.nombre}<small>{e.detalle}</small></span>
          </a>
        ))}
      </section>

      <section className="lat-tarjeta">
        <h4>🛡️ Alertas de mis redes</h4>
        {alertas.length === 0
          ? <p className="muted">✅ Sin alertas activas.</p>
          : alertas.map(({ r, m }) => (
            <button key={m.id} className={`lat-alerta-item ${m.tipo}`} onClick={() => nav.red(r.id)}>
              <b>{m.tipo === 'sos' ? '🆘 SOS' : '🙋 Pide ayuda'}: {m.autor}</b>
              <small>{r.nombre}</small>
            </button>
          ))}
      </section>

      <section className="lat-tarjeta">
        <h4>📅 Próximamente cerca</h4>
        {proximos.length === 0 && <p className="muted">No hay eventos ni ventas de garaje programados en tu radio.</p>}
        {proximos.map((p) => {
          const f = new Date(fechaDe(p));
          return (
            <button key={p.id} className="lat-evento" onClick={() => nav.post(p.id)}>
              <span className="lat-fecha"><b>{f.getDate()}</b><small>{f.toLocaleDateString('es-CO', { month: 'short' })}</small></span>
              <span className="lat-texto">
                {p.categoria === 'garaje' ? '📦 ' : '📅 '}{p.titulo}
                <small>{f.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })} · {p.autor}</small>
              </span>
            </button>
          );
        })}
      </section>

      {!NUBE && <section className="lat-tarjeta">
        <h4>🏢 Negocios cerca</h4>
        {negocios.length === 0 && <p className="muted">Aún no hay negocios registrados cerca.</p>}
        {negocios.map(({ e, d }) => (
          <button key={e.id} className="lat-evento" onClick={() => nav.empresa(e.id)}>
            <span className="lat-logo">{RUBRO[e.rubro]?.icono ?? '🏢'}</span>
            <span className="lat-texto">{e.nombre}{e.verificacion === 'verificada' && ' ✔'}<small>{RUBRO[e.rubro]?.nombre ?? 'Negocio'} · {formatoDistancia(d)}</small></span>
          </button>
        ))}
        <button className="btn secondary chico ancho" onClick={onNegocios}>Ver todos los negocios</button>
      </section>}

      <section className="lat-tarjeta invitar-tarjeta">
        <h4>💌 Invita a tus vecinos</h4>
        <p>Entre más vecinos, más útil es la red: más servicios, más seguridad, más ventas.</p>
        <InvitarVecinos barrio={barrios.find((b) => b.id === usuario.barrioId)} />
      </section>
    </div>
  );
}

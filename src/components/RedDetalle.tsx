import { useState } from 'react';
import type { MensajeRed, Red, RespuestaAlerta, Usuario } from '../types';
import { acciones, alertaActiva, esMiembro } from '../store';
import { hace, obtenerUbicacion } from '../geo';
import { TIPOS_RED } from './Redes';
import { BotonMantener } from './BotonMantener';
import { nav } from '../ui';

interface Props {
  red: Red;
  usuario: Usuario;
  onCerrar: () => void;
}

const ACCIONES: Record<RespuestaAlerta['accion'], string> = {
  voy: '🏃 Voy en camino',
  'llame-123': '📞 Llamé al 123',
  ayudo: '🙋 Yo te ayudo',
};

export function RedDetalle({ red, usuario, onCerrar }: Props) {
  const [texto, setTexto] = useState('');
  const [enviandoSOS, setEnviandoSOS] = useState(false);
  const [verMiembros, setVerMiembros] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const miembro = esMiembro(red, usuario.id);
  const soyCoordinador = red.miembros.some((m) => m.usuarioId === usuario.id && m.rol === 'coordinador');
  const activas = red.mensajes.filter(alertaActiva);
  const historial = red.mensajes.filter((m) => !alertaActiva(m)).slice().reverse();
  const otros = red.miembros.length - 1;

  /** Se dispara al mantener presionado el botón 3 segundos (evita SOS por error sin pedir confirmación en plena emergencia). */
  async function enviarSOS() {
    setEnviandoSOS(true);
    let pos = { lat: usuario.lat, lng: usuario.lng };
    try { pos = await obtenerUbicacion({ rapido: true }); } catch { /* se usa la ubicación del perfil */ }
    acciones.enviarMensajeRed(red.id, usuario, { tipo: 'sos', texto: texto.trim() || '¡Necesito ayuda urgente!', ...pos });
    setTexto('');
    setEnviandoSOS(false);
  }

  function enviar(tipo: MensajeRed['tipo']) {
    const t = texto.trim();
    if (tipo === 'mensaje' && !t) return;
    if (tipo === 'ayuda' && !t) { alert('Escribe en el cuadro qué ayuda necesitas.'); return; }
    acciones.enviarMensajeRed(red.id, usuario, { tipo, texto: tipo === 'llegue-bien' ? t || 'Llegué bien a casa ✅' : t });
    setTexto('');
  }

  const invitacion = `Únete a la red "${red.nombre}" en RedCity con el código ${red.codigo}`;
  async function copiarCodigo() {
    try { await navigator.clipboard.writeText(invitacion); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sin portapapeles */ }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <span className={`chip-cat ${red.tipo === 'seguridad' ? 'fondo-seguridad' : 'fondo-apoyo'}`}>{TIPOS_RED[red.tipo].icono} {TIPOS_RED[red.tipo].nombre}</span>
        {red.privada && <span className="nivel nivel-info">🔒 Privada</span>}
        <h2>{red.nombre}</h2>
        {red.descripcion && <p className="muted">{red.descripcion}</p>}

        {!miembro ? (
          <button className="btn primary" onClick={() => acciones.unirseRed(red.id, usuario)}>Unirme a esta red ({red.totalMiembros ?? red.miembros.length} miembros)</button>
        ) : (
          <>
            {/* ---------- Botones de acción rápida ---------- */}
            {red.tipo === 'seguridad' ? (
              <>
              <div className="acciones-red">
                <BotonMantener className="btn sos" onCompleto={enviarSOS} disabled={enviandoSOS}>{enviandoSOS ? 'Enviando…' : '🆘 SOS'}</BotonMantener>
                <a className="btn danger" href="tel:123">📞 Llamar 123</a>
                <button className="btn secondary" onClick={() => enviar('llegue-bien')}>✅ Llegué bien</button>
              </div>
              <small className="muted">Mantén presionado <b>SOS</b> 3 segundos para alertar a los {otros} miembros con tu ubicación. El uso falso del SOS puede llevar a la expulsión de la red.</small>
              </>
            ) : (
              <div className="acciones-red dos">
                <button className="btn apoyo" onClick={() => enviar('ayuda')}>🙋 Pedir ayuda</button>
                <button className="btn secondary" onClick={() => enviar('mensaje')}>💬 Enviar mensaje</button>
              </div>
            )}
            <div className="responder">
              <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviar('mensaje')}
                placeholder={red.tipo === 'seguridad' ? 'Mensaje a la red (o detalle del SOS)…' : 'Escribe qué necesitas o un mensaje…'} />
              <button className="btn primary" onClick={() => enviar('mensaje')}>Enviar</button>
            </div>

            {/* ---------- Alertas activas ---------- */}
            {activas.length > 0 && <h4>🚨 Alertas activas</h4>}
            {activas.map((m) => <Alerta key={m.id} red={red} m={m} usuario={usuario} soyCoordinador={soyCoordinador} />)}

            {/* ---------- Tablero ---------- */}
            <h4>Tablero de la red</h4>
            {historial.length === 0 && <p className="muted">Todavía no hay mensajes.</p>}
            <div className="respuestas">
              {historial.map((m) => (
                <div key={m.id} className={`respuesta msg-${m.tipo}`}>
                  <b>{m.autor}</b> <span className="muted">{hace(m.creado)}</span>
                  {m.tipo === 'sos' && <span className="nivel nivel-info">SOS resuelto</span>}
                  {m.tipo === 'ayuda' && <span className="nivel nivel-info">Solicitud de ayuda</span>}
                  <br />{m.texto}
                  {m.respuestas.length > 0 && <small className="muted"><br />{m.respuestas.map((r) => `${r.nombre}: ${ACCIONES[r.accion]}`).join(' · ')}</small>}
                </div>
              ))}
            </div>

            {/* ---------- Invitar ---------- */}
            <h4>Invitar vecinos</h4>
            <div className="caja invitar">
              <div>Código: <b className="codigo">{red.codigo}</b></div>
              <div className="invitar-botones">
                <button className="btn secondary chico" onClick={copiarCodigo}>{copiado ? '✔ Copiado' : '📋 Copiar'}</button>
                <a className="btn whatsapp chico" href={`https://wa.me/?text=${encodeURIComponent(invitacion)}`} target="_blank" rel="noreferrer">WhatsApp</a>
              </div>
            </div>

            {/* ---------- Miembros ---------- */}
            <button className="btn link neutro" onClick={() => setVerMiembros(!verMiembros)}>
              👥 {verMiembros ? 'Ocultar' : 'Ver'} miembros ({red.miembros.length})
            </button>
            {verMiembros && red.miembros.map((m) => (
              <div key={m.usuarioId} className="fila-servicio">
                <span>{m.rol === 'coordinador' ? '⭐' : '👤'}</span>
                <span className="fila-titulo"><button className="enlace-nombre" onClick={() => nav.perfil(m.usuarioId)}>{m.nombre}</button>{m.usuarioId === usuario.id && ' (tú)'}<small className="muted"><br />{m.rol === 'coordinador' ? 'Coordinador' : 'Miembro'} · se unió {hace(m.unido)}</small></span>
                {soyCoordinador && m.usuarioId !== usuario.id && (
                  <button className="btn link chico" onClick={() => { if (confirm(`¿Quitar a ${m.nombre} de la red?`)) acciones.quitarMiembro(red.id, m.usuarioId); }}>Quitar</button>
                )}
              </div>
            ))}

            <button className="btn link" onClick={() => { if (confirm(`¿Salir de "${red.nombre}"?`)) { acciones.salirRed(red.id, usuario.id); onCerrar(); } }}>
              Salir de la red
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Alerta({ red, m, usuario, soyCoordinador }: { red: Red; m: MensajeRed; usuario: Usuario; soyCoordinador: boolean }) {
  const mia = m.autorId === usuario.id;
  const opciones: RespuestaAlerta['accion'][] = m.tipo === 'sos' ? ['voy', 'llame-123'] : ['ayudo'];
  return (
    <div className={`alerta-red ${m.tipo === 'sos' ? 'es-sos' : 'es-ayuda'}`}>
      <div><b>{m.tipo === 'sos' ? '🆘 SOS' : '🙋 Pide ayuda'}: {m.autor}</b> <span className="muted">{hace(m.creado)}</span></div>
      <p>{m.texto}</p>
      {m.lat !== undefined && m.lng !== undefined && (
        <a className="enlace" href={`https://www.openstreetmap.org/?mlat=${m.lat}&mlon=${m.lng}#map=18/${m.lat}/${m.lng}`} target="_blank" rel="noreferrer">
          📍 Ver ubicación en el mapa
        </a>
      )}
      {m.respuestas.length > 0 && (
        <ul className="lista-respuestas">
          {m.respuestas.map((r, i) => <li key={i}><b>{r.nombre}</b>: {ACCIONES[r.accion]} <span className="muted">{hace(r.creado)}</span></li>)}
        </ul>
      )}
      {m.respuestas.length === 0 && <p className="muted">Avisando a los miembros de la red…</p>}
      <div className="botones-alerta">
        {!mia && opciones.map((a) => {
          const marcada = m.respuestas.some((r) => r.usuarioId === usuario.id && r.accion === a);
          return (
            <button key={a} className={`btn chico ${marcada ? 'primary' : 'secondary'}`} onClick={() => acciones.responderAlerta(red.id, m.id, usuario, a)}>
              {marcada ? '✔ ' : ''}{ACCIONES[a]}
            </button>
          );
        })}
        {(mia || soyCoordinador) && (
          <button className="btn chico secondary" onClick={() => acciones.resolverAlerta(red.id, m.id)}>
            {mia ? (m.tipo === 'sos' ? '😌 Ya estoy bien' : '✔ Ya me ayudaron') : '✔ Marcar resuelta'}
          </button>
        )}
      </div>
    </div>
  );
}

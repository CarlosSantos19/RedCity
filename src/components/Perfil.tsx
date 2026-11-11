import { useRef, useState } from 'react';
import type { PostServicio, TipoDocumento, Usuario, VisibilidadFoto } from '../types';
import { MAX_OFICIOS, acciones, hayBloqueo, useEstado } from '../store';
import { Avatar } from './Avatar';
import { RecortarFoto } from './RecortarFoto';
import { NUBE } from '../nube/config';
import { hace } from '../geo';
import { AccionesVecino } from './AccionesVecino';
import { ActivarNotificaciones } from './Notificaciones';
import { InvitarVecinos } from './Bienvenida';
import { lugarDeBarrio } from '../data/colombia';
import { nav } from '../ui';
import { NOMBRE_DOCUMENTO, REQUISITOS, RUBRO, cop } from '../servicios';
import { borrarFoto } from '../fotos';
import { EstrellasFijas, Reputacion } from './Estrellas';
import { SelectorFotos } from './Fotos';
import { useInstalar } from '../pwa';
import { EditorRedes, EnlacesRedes, editablesDe } from './Empresas';
import type { RedSocial } from '../redesSociales';

/** Insignias de verificación de un vecino. */
export function Insignias({ verificadoGps, documentos }: { verificadoGps: boolean; documentos?: Usuario['documentos'] }) {
  return (
    <div className="insignias">
      {verificadoGps && <span className="insignia">📍 Vive en el barrio</span>}
      {documentos?.cedula === 'verificado' && <span className="insignia">🪪 Identidad verificada</span>}
      {documentos?.antecedentes === 'verificado' && <span className="insignia">📄 Antecedentes al día</span>}
    </div>
  );
}

/** Perfil público de cualquier vecino (no muestra correo ni ubicación). */
export function PerfilModal({ perfilId, usuario }: { perfilId: string; usuario: Usuario }) {
  const { cuentas, posts, pagos, calificaciones, barrios, empresas, bloqueos } = useEstado();
  const cuenta = cuentas.find((c) => c.id === perfilId);
  const susEmpresas = empresas.filter((e) => e.duenoId === perfilId);
  const susPosts = posts.filter((p) => p.autorId === perfilId && !p.oculta);
  const nombre = cuenta?.nombre ?? susPosts[0]?.autor
    ?? calificaciones.find((c) => c.deId === perfilId)?.deNombre ?? 'Vecino';
  const barrio = barrios.find((b) => b.id === (cuenta?.barrioId ?? susPosts[0]?.barrioId));
  const ofertas = susPosts.filter((p): p is PostServicio => p.categoria === 'servicio' && p.modo === 'ofrezco');
  const resenas = calificaciones.filter((c) => c.paraId === perfilId);
  const trabajos = pagos.filter((p) => p.proveedorId === perfilId && p.estado === 'liberado').length;
  const verificadoGps = cuenta?.verificado ?? susPosts.some((p) => p.autorVerificado);
  const soyYo = perfilId === usuario.id;
  const [avisoFoto, setAvisoFoto] = useState('');
  const yaReporteFoto = !!cuenta?.reportesFoto?.includes(usuario.id);

  function escribir() {
    nav.chat(acciones.abrirConversacion(usuario, perfilId, nombre));
  }

  return (
    <div className="modal-fondo" onClick={() => nav.perfil(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="cerrar" onClick={() => nav.perfil(null)} aria-label="Cerrar">✕</button>
        <div className="perfil-cabecera">
          <Avatar usuarioId={perfilId} nombre={nombre} tamano="grande" />
          <div>
            <h2>{nombre}{soyYo && ' (tú)'}</h2>
            <p className="muted">{barrio ? `${barrio.nombre}, ${lugarDeBarrio(barrio)}` : 'Colombia'}{cuenta && ` · en RedCity ${hace(cuenta.creado).replace('hace', 'desde hace')}`}</p>
            <Reputacion usuarioId={perfilId} completo />
          </div>
        </div>
        <Insignias verificadoGps={verificadoGps} documentos={NUBE ? undefined : cuenta?.documentos} />
        {cuenta?.bio && <p>{cuenta.bio}</p>}
        {!!cuenta?.oficios?.length && (
          <div className="oficios">{cuenta.oficios.map((o) => <span key={o} className="oficio">🛠️ {o}</span>)}</div>
        )}
        <EnlacesRedes redes={cuenta?.redes} />
        {trabajos > 0 && <p className="muted">✅ {trabajos} servicio(s) completado(s) por la app</p>}
        {!soyYo && !hayBloqueo(bloqueos, usuario.id, perfilId) && <button className="btn primary" onClick={escribir}>💬 Escribir en privado</button>}
        {!soyYo && <AccionesVecino usuario={usuario} otroId={perfilId} nombre={nombre} />}
        {!soyYo && cuenta?.foto && (
          yaReporteFoto
            ? <small className="muted">🚩 Reportaste la foto de este vecino.</small>
            : <button className="btn link chico" onClick={() => { if (confirm('¿Reportar esta foto de perfil como falsa o inapropiada?')) setAvisoFoto(acciones.reportarFoto(perfilId, usuario.id) ?? 'Gracias. Con 3 reportes la foto se retira automáticamente.'); }}>🚩 Reportar foto</button>
        )}
        {avisoFoto && <p className="aviso">{avisoFoto}</p>}

        {susEmpresas.length > 0 && (
          <>
            <h4>Negocios</h4>
            {susEmpresas.map((e) => (
              <button key={e.id} className="fila-servicio" onClick={() => { nav.perfil(null); nav.empresa(e.id); }}>
                <span>🏢</span>
                <span className="fila-titulo">{e.nombre}{e.verificacion === 'verificada' && ' ✔'}<small className="muted"><br />{RUBRO[e.rubro]?.nombre ?? 'Negocio'}</small></span>
              </button>
            ))}
          </>
        )}

        {ofertas.length > 0 && (
          <>
            <h4>Servicios que ofrece</h4>
            {ofertas.map((p) => (
              <button key={p.id} className="fila-servicio" onClick={() => { nav.perfil(null); nav.post(p.id); }}>
                <span>{RUBRO[p.rubro]?.icono}</span>
                <span className="fila-titulo">{p.titulo}<small className="muted"><br />{p.valor > 0 ? `Desde ${cop(p.valor)} ${p.unidad}` : 'Precio a convenir'}</small></span>
              </button>
            ))}
          </>
        )}

        <h4>Reseñas verificadas ({resenas.length})</h4>
        {resenas.length === 0 && <p className="muted">Todavía no tiene reseñas. Las reseñas solo las dejan vecinos que contrataron un servicio por la app.</p>}
        {resenas.map((r) => (
          <div key={r.id} className="respuesta">
            <EstrellasFijas valor={r.estrellas} /> <b>{r.deNombre}</b> <span className="muted">{hace(r.creado)}</span>
            {r.comentario && <><br />{r.comentario}</>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Pestaña "Perfil": mis datos, verificación de documentos, instalar la app y cerrar sesión. */
export function MiPerfil({ usuario, onSalir, onCrearNegocio }: { usuario: Usuario; onSalir: () => void; onCrearNegocio: () => void }) {
  const { barrios, posts, empresas, bloqueos } = useEstado();
  const misBloqueos = bloqueos.filter((b) => b.de === usuario.id);
  const misEmpresas = empresas.filter((e) => e.duenoId === usuario.id);
  const [bio, setBio] = useState(usuario.bio ?? '');
  const [redes, setRedes] = useState<Partial<Record<RedSocial, string>>>(editablesDe(usuario.redes));
  const [erroresRedes, setErroresRedes] = useState<Partial<Record<RedSocial, string>>>({});
  const [guardadoRedes, setGuardadoRedes] = useState(false);

  function guardarRedes() {
    const errores = acciones.actualizarRedes(usuario.id, bio, redes);
    setErroresRedes(errores ?? {});
    setGuardadoRedes(!errores);
    if (!errores) setTimeout(() => setGuardadoRedes(false), 2000);
  }
  const [nombre, setNombre] = useState(usuario.nombre);
  const guardados = acciones.guardadosDe(usuario.id)
    .map((id) => posts.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const instalar = useInstalar();
  const barrio = barrios.find((b) => b.id === usuario.barrioId);

  return (
    <div className="feed">
      <section className="panel">
        <div className="perfil-cabecera">
          <Avatar usuarioId={usuario.id} nombre={usuario.nombre} tamano="grande" />
          <div>
            <h3>{usuario.nombre}</h3>
            <p className="muted">{usuario.correo} · {barrio?.nombre}, {lugarDeBarrio(barrio)}</p>
            <Reputacion usuarioId={usuario.id} completo />
          </div>
        </div>
        <SeccionFoto usuario={usuario} />
        {NUBE && <small className="muted">Por ahora tu foto solo se ve en este celular. Pronto la verán tus vecinos.</small>}
        <Insignias verificadoGps={usuario.verificado} documentos={NUBE ? undefined : usuario.documentos} />
        <button className="btn secondary" onClick={() => nav.perfil(usuario.id)}>👁️ Ver mi perfil público</button>
        <div className="form">
          <label>Nombre visible
            <div className="responder">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} />
              <button className="btn primary" disabled={nombre.trim() === usuario.nombre || nombre.trim().length < 2} onClick={() => acciones.actualizarNombre(usuario.id, nombre)}>Guardar</button>
            </div>
          </label>
        </div>
      </section>

      <section className="panel">
        <h3>🔗 Sobre mí y mis redes</h3>
        <div className="form">
          <label>Presentación corta
            <textarea rows={2} maxLength={160} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Ej: Profe de inglés, vecina de la cuadra hace 10 años 🐶" />
          </label>
        </div>
        <EditorRedes valores={redes} errores={erroresRedes} onChange={setRedes} />
        <button className="btn primary" onClick={guardarRedes}>{guardadoRedes ? '✔ Guardado' : 'Guardar'}</button>
        <small className="muted">Tus redes aparecen en tu perfil público como botones. Escribe tu usuario o pega el enlace.</small>
      </section>

      <EditorOficios usuario={usuario} />

      {!NUBE && <section className="panel">
        <div className="titulo-seccion">
          <h3>🏢 Mis negocios ({misEmpresas.length})</h3>
          <button className="btn primary chico" onClick={onCrearNegocio}>＋ Crear</button>
        </div>
        {misEmpresas.length === 0 && <p className="muted">¿Tienes una tienda, un taller o eres profesional independiente? Crea la página de tu negocio con horario, contacto y redes.</p>}
        {misEmpresas.map((e) => (
          <button key={e.id} className="fila-servicio" onClick={() => nav.empresa(e.id)}>
            <span>🏢</span>
            <span className="fila-titulo">{e.nombre}<small className="muted"><br />{e.seguidores.length} seguidores · {e.verificacion === 'verificada' ? '✔ verificado' : 'sin verificar'}</small></span>
          </button>
        ))}
      </section>}

      <section className="panel">
        <h3>🔖 Guardados ({guardados.length})</h3>
        {guardados.length === 0 && <p className="muted">Toca “Guardar” en cualquier publicación para encontrarla aquí después. Solo tú ves lo que guardas.</p>}
        {guardados.map((p) => (
          <button key={p.id} className="fila-servicio" onClick={() => nav.post(p.id)}>
            <span>{p.categoria === 'servicio' ? RUBRO[p.rubro]?.icono : { garaje: '📦', trueque: '🔄', seguridad: '🛡️', oferta: '🏷️', evento: '📅' }[p.categoria]}</span>
            <span className="fila-titulo">{p.titulo}<small className="muted"><br />{p.autor} · {hace(p.creado)}</small></span>
            <span onClick={(e) => { e.stopPropagation(); acciones.guardar(usuario.id, p.id); }} title="Quitar de guardados">✕</span>
          </button>
        ))}
      </section>

      <section className="panel">
        <h3>🛡️ Verificación</h3>
        {NUBE && <p className="muted">Por ahora solo verificamos tu ubicación en el barrio. RedCity aún no revisa documentos de identidad.</p>}
        {!NUBE && <p className="muted">Entre más verificado estés, más confían tus vecinos. Algunos servicios la exigen:</p>}
        {!NUBE && <ul className="lista-requisitos">
          {Object.entries(REQUISITOS).map(([rubro, docs]) => (
            <li key={rubro}>{RUBRO[rubro]?.icono} {RUBRO[rubro]?.nombre}: {docs!.map((d) => NOMBRE_DOCUMENTO[d].split(' (')[0]).join(' + ')}</li>
          ))}
        </ul>}
        <div className="verif-fila">
          <span>📍 Ubicación en el barrio (GPS)</span>
          <span className={`estado ${usuario.verificado ? 'estado-completada' : 'estado-cancelada'}`}>{usuario.verificado ? 'Verificado' : 'Sin verificar'}</span>
        </div>
        {!NUBE && <Documento usuario={usuario} tipo="cedula" ayuda="Foto de tu cédula por ambos lados." />}
        {!NUBE && <Documento usuario={usuario} tipo="antecedentes" ayuda="Certificados de antecedentes de la Policía y de la Procuraduría (se descargan gratis en sus páginas web)." />}
        {!NUBE && <small className="muted">🔒 Tus documentos solo los ve el equipo de verificación, nunca tus vecinos. Son datos sensibles protegidos por la Ley 1581 de 2012.</small>}
      </section>

      {misBloqueos.length > 0 && (
        <section className="panel">
          <h3>🚫 Vecinos bloqueados ({misBloqueos.length})</h3>
          {misBloqueos.map((b) => (
            <div key={b.a} className="titulo-seccion">
              <span>{b.nombre}</span>
              <button className="btn link chico" onClick={() => acciones.desbloquear(usuario.id, b.a)}>Desbloquear</button>
            </div>
          ))}
        </section>
      )}

      {NUBE && (
        <section className="panel">
          <h3>🔔 Notificaciones</h3>
          <ActivarNotificaciones />
        </section>
      )}

      <section className="panel">
        <h3>💌 Invita a tus vecinos</h3>
        <p className="muted">Entre más vecinos, más útil es tu barrio. El enlace les abre RedCity con tu barrio ya elegido.</p>
        <InvitarVecinos barrio={barrios.find((b) => b.id === usuario.barrioId)} />
      </section>

      <section className="panel">
        <h3>📱 La app en tu celular</h3>
        {instalar
          ? <button className="btn primary" onClick={instalar}>Instalar RedCity en la pantalla de inicio</button>
          : <p className="muted">Para instalarla: abre el menú del navegador (⋮ o Compartir) y elige “Agregar a pantalla de inicio”.</p>}
      </section>

      <button className="btn danger" onClick={onSalir}>🚪 Cerrar sesión</button>

      <EliminarCuenta usuario={usuario} />
      <p className="muted centro">
        <a href={`${import.meta.env.BASE_URL}privacidad.html`} target="_blank" rel="noreferrer">Política de privacidad</a> · <a href="mailto:redcity.soporte@gmail.com">redcity.soporte@gmail.com</a>
      </p>
    </div>
  );
}

/** Eliminar la cuenta para siempre (Google Play lo exige; Ley 1581: derecho a la supresión). */
function EliminarCuenta({ usuario }: { usuario: Usuario }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState('');

  async function eliminar() {
    setBorrando(true);
    setError('');
    if (NUBE) {
      const { eliminarCuentaNube } = await import('../nube/sincronizar');
      const err = await eliminarCuentaNube();
      if (err) { setError(err); setBorrando(false); return; }
    } else {
      acciones.eliminarCuentaLocal(usuario.id);
    }
    nav.cerrarTodo();
  }

  if (!abierto) {
    return <button className="btn link" onClick={() => setAbierto(true)}>Eliminar mi cuenta</button>;
  }
  return (
    <section className="panel zona-peligro">
      <h3>⚠️ Eliminar mi cuenta</h3>
      <p>Se borrarán <b>para siempre</b> tu perfil, tus publicaciones y fotos, comentarios, mensajes, calificaciones y tu participación en redes. <b>No se puede deshacer.</b></p>
      <p className="muted">Los registros de servicios realizados se conservan sin tu nombre ni tus datos, para que el otro vecino conserve su historial de servicios.</p>
      <div className="form">
        <label>Para confirmar, escribe <b>ELIMINAR</b>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} autoCapitalize="characters" />
        </label>
      </div>
      {error && <p className="aviso peligro">{error}</p>}
      <button className="btn danger" disabled={texto.trim().toUpperCase() !== 'ELIMINAR' || borrando} onClick={eliminar}>
        {borrando ? 'Eliminando…' : 'Eliminar mi cuenta para siempre'}
      </button>
      <button className="btn link neutro" onClick={() => { setAbierto(false); setTexto(''); }}>Cancelar</button>
    </section>
  );
}

const VISIBILIDAD: Record<VisibilidadFoto, { nombre: string; ayuda: string }> = {
  todos: { nombre: '🏘️ Todos los vecinos', ayuda: 'Cualquier vecino de la app puede verla.' },
  redes: { nombre: '🤝 Mis redes y contactos', ayuda: 'Miembros de tus redes y personas con las que ya hablaste o hiciste un servicio.' },
  contactos: { nombre: '🔒 Solo mis contactos', ayuda: 'Solo quienes ya conversaron contigo (ambos escribieron) o con quienes hiciste un servicio.' },
};

/** Subir, recortar, cambiar o quitar la foto de perfil, y elegir quién la ve. */
function SeccionFoto({ usuario }: { usuario: Usuario }) {
  const { cuentas } = useEstado();
  const cuenta = cuentas.find((c) => c.id === usuario.id);
  const [archivo, setArchivo] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const vis = usuario.visibilidadFoto ?? 'todos';

  return (
    <div className="seccion-foto">
      {cuenta?.fotoRetirada && <p className="aviso peligro">Tu foto anterior fue retirada por reportes de vecinos. Sube una foto real tuya.</p>}
      <div className="botones-foto">
        <button className="btn secondary" onClick={() => input.current?.click()}>📷 {usuario.foto ? 'Cambiar foto' : 'Subir foto de perfil'}</button>
        {usuario.foto && (
          <button className="btn link neutro" onClick={() => { if (confirm('¿Quitar tu foto de perfil? Si tienes la cédula verificada, tendrás que verificarla de nuevo.')) acciones.actualizarFoto(usuario.id, undefined); }}>
            Quitar
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setArchivo(f); e.target.value = ''; }} />
      <small className="muted">Usa una foto real de tu cara, sin otras personas ni niños. Ayuda a que tus vecinos te reconozcan y confíen en ti.</small>
      <div className="form">
        <label>¿Quién ve mi foto?
          <select value={vis} onChange={(e) => acciones.actualizarVisibilidadFoto(usuario.id, e.target.value as VisibilidadFoto)}>
            {(Object.keys(VISIBILIDAD) as VisibilidadFoto[]).map((v) => <option key={v} value={v}>{VISIBILIDAD[v].nombre}</option>)}
          </select>
          <small className="muted">{VISIBILIDAD[vis].ayuda} Quien no pueda verla verá tu inicial.</small>
        </label>
      </div>
      {archivo && (
        <RecortarFoto archivo={archivo} onCancelar={() => setArchivo(null)}
          onListo={(id) => { acciones.actualizarFoto(usuario.id, id); setArchivo(null); }} />
      )}
    </div>
  );
}

/** Oficios o habilidades: "Plomería", "Clases de inglés"… */
function EditorOficios({ usuario }: { usuario: Usuario }) {
  const [nuevo, setNuevo] = useState('');
  const oficios = usuario.oficios ?? [];
  const agregar = () => { if (nuevo.trim().length >= 2) { acciones.actualizarOficios(usuario.id, [...oficios, nuevo]); setNuevo(''); } };

  return (
    <section className="panel">
      <h3>🛠️ Mis oficios y habilidades</h3>
      <p className="muted">Así los vecinos te encuentran en “Negocios y oficios” aunque no hayas publicado nada.</p>
      <div className="oficios">
        {oficios.map((o) => (
          <span key={o} className="oficio">{o}
            <button onClick={() => acciones.actualizarOficios(usuario.id, oficios.filter((x) => x !== o))} aria-label={`Quitar ${o}`}>✕</button>
          </span>
        ))}
        {oficios.length === 0 && <span className="muted">Aún no has agregado oficios.</span>}
      </div>
      {oficios.length < MAX_OFICIOS && (
        <div className="responder">
          <input value={nuevo} maxLength={30} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && agregar()}
            placeholder="Ej: Plomería, Clases de inglés, Repostería" />
          <button className="btn primary" onClick={agregar} disabled={nuevo.trim().length < 2}>Agregar</button>
        </div>
      )}
    </section>
  );
}

function Documento({ usuario, tipo, ayuda }: { usuario: Usuario; tipo: TipoDocumento; ayuda: string }) {
  const [fotos, setFotos] = useState<string[]>([]);
  const [error, setError] = useState('');
  const estadoDoc = usuario.documentos?.[tipo];

  function enviar() {
    const err = acciones.enviarDocumento(usuario.id, tipo);
    setError(err ?? '');
    if (err) return;
    // DEMO: las imágenes no se conservan. En producción se suben a un bucket privado para revisión.
    fotos.forEach(borrarFoto);
    setFotos([]);
  }

  return (
    <div className="documento">
      <div className="verif-fila">
        <span>{tipo === 'cedula' ? '🪪' : '📄'} {NOMBRE_DOCUMENTO[tipo]}</span>
        <span className={`estado ${estadoDoc === 'verificado' ? 'estado-completada' : estadoDoc === 'en-revision' ? 'estado-pagada' : ''}`}>
          {estadoDoc === 'verificado' ? 'Verificado' : estadoDoc === 'en-revision' ? 'En revisión…' : estadoDoc === 'rechazado' ? 'Rechazado' : 'Pendiente'}
        </span>
      </div>
      {(!estadoDoc || estadoDoc === 'rechazado') && (
        <>
          <small className="muted">{ayuda}</small>
          {tipo === 'cedula' && !usuario.foto && <small className="error">Necesitas foto de perfil: la comparamos con la de tu cédula.</small>}
          <SelectorFotos fotos={fotos} onChange={setFotos} max={2} texto="📷 Subir" />
          <button className="btn secondary" disabled={fotos.length === 0} onClick={enviar}>Enviar a verificación</button>
          {error && <small className="error">{error}</small>}
        </>
      )}
    </div>
  );
}

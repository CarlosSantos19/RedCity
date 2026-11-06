import { useState } from 'react';
import type { Postulacion, PostServicio, Usuario } from '../types';
import { acciones, nuevoId, useEstado } from '../store';
import { ESTADOS, FRECUENCIAS, NOMBRE_DOCUMENTO, PAGOS_EN_APP, RUBRO, cop, desglose, documentosFaltantes, requiereFoto } from '../servicios';
import { Avatar } from './Avatar';
import { nav } from '../ui';
import { Desglose } from './Desglose';
import { Calificar, Reputacion } from './Estrellas';

interface Props {
  post: PostServicio;
  usuario: Usuario;
}

/** Abre el chat privado con otro vecino, ligado a esta publicación. */
const escribirA = (usuario: Usuario, otroId: string, otroNombre: string, post: PostServicio) =>
  nav.chat(acciones.abrirConversacion(usuario, otroId, otroNombre, { id: post.id, titulo: post.titulo }));

export function ServicioDetalle({ post, usuario }: Props) {
  const rubro = RUBRO[post.rubro];
  const mio = post.autorId === usuario.id;
  const elegido = post.postulaciones.find((p) => p.id === post.asignadoId);
  const miPostulacion = post.postulaciones.find((p) => p.proveedorId === usuario.id);

  return (
    <>
      <div className="caja">
        {rubro?.icono} <b>{rubro?.nombre}</b> · {post.modo === 'necesito' ? 'Se necesita' : 'Se ofrece'}<br />
        {post.valor > 0 ? <><b className="precio">{cop(post.valor)}</b> {post.unidad}</> : 'Precio a convenir'}<br />
        {FRECUENCIAS[post.frecuencia]}{post.dia && ` · ${post.dia}`}
        {post.modo === 'necesito' && <><br /><span className={`estado estado-${post.estado}`}>{ESTADOS[post.estado]}</span></>}
        {post.realizados > 0 && <span className="muted"> · realizado {post.realizados} {post.realizados === 1 ? 'vez' : 'veces'}</span>}
      </div>

      {post.modo === 'ofrezco'
        ? <Oferta post={post} usuario={usuario} mio={mio} />
        : mio
          ? <MiNecesidad post={post} elegido={elegido} usuario={usuario} />
          : <Postularse post={post} usuario={usuario} miPostulacion={miPostulacion} />}
    </>
  );
}

function Oferta({ post, usuario, mio }: { post: PostServicio; usuario: Usuario; mio: boolean }) {
  if (mio) {
    if (!PAGOS_EN_APP) return <p className="muted">Esta es tu oferta. Los vecinos te contratarán o te escribirán por privado; el pago lo acuerdan directamente.</p>;
    return post.valor > 0
      ? <><p className="muted">Esta es tu oferta. Cada vez que un vecino te contrate por la app:</p><Desglose valor={post.valor} quien="proveedor" /></>
      : <p className="muted">Esta es tu oferta. Los vecinos te escribirán por privado.</p>;
  }
  if (post.valor === 0) return <p className="muted">Precio a convenir: escríbele por privado para cotizar.</p>;
  return (
    <>
      {PAGOS_EN_APP && <Desglose valor={post.valor} quien="cliente" />}
      <button className="btn primary" onClick={() => nav.post(acciones.contratarOferta(post, usuario))}>
        Contratar a {post.autor}
      </button>
      <small className="muted">{PAGOS_EN_APP
        ? 'Pagas por la app y el dinero queda retenido hasta que confirmes que el trabajo quedó bien.'
        : `Acuerdas con ${post.autor} el horario y el pago (efectivo, Nequi, transferencia). RedCity no cobra comisión.`}</small>
    </>
  );
}

function MiNecesidad({ post, elegido, usuario }: { post: PostServicio; elegido?: Postulacion; usuario: Usuario }) {
  const { pagos } = useEstado();
  const puedeCancelar = post.estado === 'abierta' || post.estado === 'asignada' || post.estado === 'pagada';
  // El último pago liberado de este servicio (en los recurrentes, uno por cada vez)
  const ultimoPago = pagos.find((p) => p.postId === post.id && p.estado === 'liberado');

  return (
    <>
      {post.estado === 'abierta' && (
        <>
          <h4>Propuestas de vecinos ({post.postulaciones.length})</h4>
          {post.postulaciones.length === 0 && <p className="muted">⏳ Esperando propuestas de vecinos…</p>}
          {post.postulaciones.map((p) => (
            <div key={p.id} className="postulacion">
              <div>
                <button className="enlace-nombre" onClick={() => nav.perfil(p.proveedorId)}><Avatar usuarioId={p.proveedorId} nombre={p.proveedor} tamano="chico" /><b>{p.proveedor}</b>{p.verificado && <span className="verif-verde"> ✔</span>}</button>
                {' '}<Reputacion usuarioId={p.proveedorId} /> · <b className="precio">{cop(p.precio)}</b>
                <p>{p.mensaje}</p>
              </div>
              <div className="botones-postulacion">
                <button className="btn primary chico" onClick={() => acciones.contratar(post.id, p.id)}>Contratar</button>
                <button className="btn secondary chico" onClick={() => escribirA(usuario, p.proveedorId, p.proveedor, post)} aria-label={`Escribir a ${p.proveedor}`}>💬</button>
              </div>
            </div>
          ))}
        </>
      )}

      {elegido && post.estado === 'asignada' && !PAGOS_EN_APP && (
        <>
          <p>Elegiste a <button className="enlace-nombre" onClick={() => nav.perfil(elegido.proveedorId)}><b>{elegido.proveedor}</b></button> por <b className="precio">{cop(elegido.precio)}</b>.
            {post.realizados > 0 ? ` Ya lo ha hecho ${post.realizados} ${post.realizados === 1 ? 'vez' : 'veces'}.` : ''}</p>
          <p className="aviso">🤝 Coordinen por privado el horario y el pago, que se hace directamente entre ustedes (efectivo, Nequi, transferencia). RedCity no cobra comisión.</p>
          <button className="btn primary" onClick={() => acciones.registrarServicio(post.id)}>✔ Confirmar que el servicio se realizó</button>
          <small className="muted">Al confirmar, ambos pueden calificarse y la reseña queda en el perfil de {elegido.proveedor}.</small>
        </>
      )}

      {elegido && post.estado === 'asignada' && PAGOS_EN_APP && (
        <>
          <p>Elegiste a <button className="enlace-nombre" onClick={() => nav.perfil(elegido.proveedorId)}><b>{elegido.proveedor}</b></button>.
            {post.realizados > 0 && ' Paga el siguiente servicio cuando quieras programarlo.'}</p>
          <Desglose valor={elegido.precio} quien="cliente" />
          <button className="btn primary" onClick={() => acciones.pagar(post.id)}>💳 Pagar {cop(desglose(elegido.precio).total)}</button>
          <small className="muted">Demo: el pago es simulado. En producción se paga con PSE, Nequi o tarjeta y el dinero queda retenido hasta que confirmes.</small>
        </>
      )}

      {elegido && post.estado === 'pagada' && (
        <>
          <p className="aviso">{PAGOS_EN_APP
            ? <>🔒 Tu pago de <b>{cop(desglose(elegido.precio).total)}</b> está retenido. Cuando <b>{elegido.proveedor}</b> termine, confirma para liberarlo.</>
            : <>Servicio en curso con <b>{elegido.proveedor}</b>. Cuando termine, confírmalo aquí.</>}</p>
          <button className="btn primary" onClick={() => (PAGOS_EN_APP ? acciones.confirmarServicio(post.id) : acciones.registrarServicio(post.id))}>✔ Confirmar que el servicio se realizó</button>
        </>
      )}

      {elegido && post.estado === 'completada' && <p>✅ Servicio completado con <b>{elegido.proveedor}</b>.</p>}

      {elegido && ultimoPago && <Calificar pagoId={ultimoPago.id} usuario={usuario} aQuien={elegido.proveedor} />}

      {elegido && post.estado !== 'cancelada' && (
        <button className="btn secondary" onClick={() => escribirA(usuario, elegido.proveedorId, elegido.proveedor, post)}>💬 Escribir a {elegido.proveedor}</button>
      )}

      {post.estado === 'cancelada' && <p className="muted">Servicio cancelado.{PAGOS_EN_APP && ' Si había un pago retenido, se reembolsó completo.'}</p>}

      {puedeCancelar && (
        <button className="btn link" onClick={() => { if (confirm('¿Cancelar este servicio?')) acciones.cancelarServicio(post.id); }}>
          Cancelar servicio{PAGOS_EN_APP && post.estado === 'pagada' && ' y pedir reembolso'}
        </button>
      )}
    </>
  );
}

function Postularse({ post, usuario, miPostulacion }: { post: PostServicio; usuario: Usuario; miPostulacion?: Postulacion }) {
  const { pagos } = useEstado();
  const [precio, setPrecio] = useState(String(post.valor || ''));
  const [mensaje, setMensaje] = useState('');
  const valor = Number(precio) || 0;
  const faltan = documentosFaltantes(usuario, post.rubro);
  const elegido = !!miPostulacion && miPostulacion.id === post.asignadoId;
  const pagoRecibido = pagos.find((p) => p.postId === post.id && p.proveedorId === usuario.id && p.estado === 'liberado');

  if (elegido) {
    return (
      <>
        <p className="aviso">🎉 ¡{post.autor} te eligió! Coordinen por privado. {PAGOS_EN_APP ? 'Recibirás el pago cuando confirme el servicio.' : `El pago (${cop(miPostulacion!.precio)}) te lo hace directamente; RedCity no cobra comisión.`}</p>
        <button className="btn secondary" onClick={() => escribirA(usuario, post.autorId, post.autor, post)}>💬 Escribir a {post.autor}</button>
        {pagoRecibido && <Calificar pagoId={pagoRecibido.id} usuario={usuario} aQuien={post.autor} />}
      </>
    );
  }
  if (miPostulacion) return <p className="aviso">📨 Ya te postulaste. {post.autor} verá tu propuesta.</p>;
  if (post.estado !== 'abierta') return <p className="muted">Este servicio ya fue asignado a otro vecino.</p>;

  if (requiereFoto(post.rubro) && !usuario.foto) {
    return (
      <div className="aviso">
        📷 Para postularte a <b>{RUBRO[post.rubro]?.nombre}</b> necesitas una <b>foto de perfil real</b>: la familia que contrata debe poder reconocer a quien llega a su casa.
        <br />Súbela en <b>👤 Perfil</b>.
      </div>
    );
  }
  if (faltan.length > 0) {
    return (
      <div className="aviso">
        🛡️ Para postularte a <b>{RUBRO[post.rubro]?.nombre}</b> necesitas verificar: {faltan.map((d) => NOMBRE_DOCUMENTO[d]).join(' y ')}.
        <br />Ve a la pestaña <b>👤 Perfil → Verificación</b>. Así protegemos a las familias que contratan.
      </div>
    );
  }

  return (
    <div className="form">
      <h4>¿Puedes hacerlo? Postúlate</h4>
      <label>Tu precio (COP)
        <input type="number" inputMode="numeric" min={0} step={1000} value={precio} onChange={(e) => setPrecio(e.target.value)} />
      </label>
      <label>Mensaje para {post.autor}
        <textarea rows={2} value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Cuéntale tu experiencia y disponibilidad" />
      </label>
      {valor > 0 && PAGOS_EN_APP && <Desglose valor={valor} quien="proveedor" />}
      <button
        className="btn primary"
        disabled={valor <= 0}
        onClick={() => acciones.postular(post.id, {
          id: nuevoId(), proveedorId: usuario.id, proveedor: usuario.nombre, verificado: usuario.verificado,
          mensaje: mensaje.trim() || 'Me interesa, puedo hacerlo.', precio: valor, creado: Date.now(),
        })}
      >
        Enviar propuesta
      </button>
    </div>
  );
}

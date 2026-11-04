import { useState } from 'react';
import type { ArticuloGaraje, PostGaraje, Usuario } from '../types';
import { acciones, nuevoId } from '../store';
import { cop } from '../servicios';
import { nav } from '../ui';
import { MAX_ARTICULOS, MEDIOS_PAGO, horarioVenta, momentoVenta, resumenArticulos } from '../garaje';
import { Foto, Galeria, SelectorFotos } from './Fotos';
import { borrarFoto } from '../fotos';

/** Etiqueta de estado de la venta: Abierta ahora / Próxima / Terminada. */
export function EstadoVenta({ post }: { post: PostGaraje }) {
  const m = momentoVenta(post);
  if (m === 'abierta') return <span className="nivel venta-abierta">🟢 Abierta ahora</span>;
  if (m === 'terminada') return <span className="nivel nivel-info">Terminó</span>;
  const hoy = new Date(post.inicio).toDateString() === new Date().toDateString();
  return <span className="nivel venta-proxima">{hoy ? '⏰ Hoy' : '📅 Próxima'}</span>;
}

/** Línea de resumen para la tarjeta del feed. */
export function ResumenGaraje({ post }: { post: PostGaraje }) {
  const r = resumenArticulos(post);
  return (
    <p className="trueque-line">
      🗓️ {horarioVenta(post)}<br />
      📦 {r.disponibles} de {r.total} artículos disponibles{r.desde > 0 && <> · desde <b className="precio">{cop(r.desde)}</b></>}
    </p>
  );
}

/** Detalle de la venta: información, artículos y acciones según si soy el vendedor o un vecino. */
export function GarajeDetalle({ post, usuario }: { post: PostGaraje; usuario: Usuario }) {
  const [aviso, setAviso] = useState('');
  const mio = post.autorId === usuario.id;
  const terminada = momentoVenta(post) === 'terminada';
  const voy = post.asistentes.includes(usuario.id);
  const r = resumenArticulos(post);

  function apartar(a: ArticuloGaraje) {
    const res = acciones.apartarArticulo(post.id, a.id, usuario);
    if (res.error) return setAviso(res.error);
    setAviso(`Apartaste "${a.nombre}". Le escribimos a ${post.autor} por privado para coordinar.`);
  }

  return (
    <>
      <div className="caja">
        <EstadoVenta post={post} /><br />
        🗓️ {horarioVenta(post)}<br />
        {post.direccion ? <>📍 {post.direccion}<br /></> : <>📍 Dirección por mensaje privado<br /></>}
        💳 {post.mediosPago.length ? post.mediosPago.join(' · ') : 'Efectivo'}
      </div>

      {!mio && !terminada && (
        <div className="acciones-red dos">
          <button className={`btn ${voy ? 'primary' : 'secondary'}`} onClick={() => acciones.asistir(post.id, usuario.id)}>
            {voy ? '✔ Iré' : '🙋 Iré'} ({post.asistentes.length})
          </button>
          <button className="btn secondary" onClick={() => nav.chat(acciones.abrirConversacion(usuario, post.autorId, post.autor, { id: post.id, titulo: post.titulo }))}>
            💬 Preguntar
          </button>
        </div>
      )}
      {mio && (
        <div className="promo-stats">
          <b>Tu venta</b>
          <div className="stats">
            <div><b>{r.disponibles}/{r.total}</b><span>Disponibles</span></div>
            <div><b>{post.articulos.filter((a) => a.estado === 'apartado').length}</b><span>Apartados</span></div>
            <div><b>{cop(r.vendido)}</b><span>Vendido</span></div>
            <div><b>{post.asistentes.length}</b><span>Vecinos irán</span></div>
          </div>
        </div>
      )}

      {aviso && <p className="aviso">{aviso}</p>}

      <h4>Artículos ({post.articulos.length})</h4>
      <div className="articulos">
        {post.articulos.map((a) => (
          <div key={a.id} className={`articulo ${a.estado}`}>
            {a.foto ? <Galeria fotos={[a.foto]} /> : <div className="articulo-sin-foto">📦</div>}
            <div className="articulo-info">
              <b>{a.nombre}</b>
              <span className="precio">{a.precio > 0 ? cop(a.precio) : 'A convenir'}</span>
              {a.estado === 'apartado' && <small className="estado estado-pagada">Apartado{(mio || a.apartadoPorId === usuario.id) && a.apartadoPor ? ` por ${a.apartadoPorId === usuario.id ? 'ti' : a.apartadoPor}` : ''}</small>}
              {a.estado === 'vendido' && <small className="estado estado-cancelada">Vendido</small>}
            </div>
            <div className="articulo-acciones">
              {!mio && !terminada && a.estado === 'disponible' && <button className="btn primary chico" onClick={() => apartar(a)}>Apartar</button>}
              {!mio && a.estado === 'apartado' && a.apartadoPorId === usuario.id && (
                <button className="btn link chico" onClick={() => acciones.liberarArticulo(post.id, a.id, usuario.id)}>Soltar</button>
              )}
              {mio && a.estado !== 'vendido' && <button className="btn primary chico" onClick={() => acciones.marcarArticulo(post.id, a.id, 'vendido')}>Vendido</button>}
              {mio && a.estado !== 'disponible' && <button className="btn link chico neutro" onClick={() => acciones.marcarArticulo(post.id, a.id, 'disponible')}>Liberar</button>}
            </div>
          </div>
        ))}
      </div>
      {!mio && !terminada && <small className="muted">Apartar es un compromiso con tu vecino: si ya no lo quieres, tócalo de nuevo para soltarlo. El pago se hace en la venta.</small>}
    </>
  );
}

/** Editor de artículos para el formulario de nueva venta de garaje. */
export function EditorArticulos({ articulos, onChange }: { articulos: ArticuloGaraje[]; onChange: (a: ArticuloGaraje[]) => void }) {
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);

  function agregar() {
    if (!nombre.trim()) return;
    onChange([...articulos, { id: nuevoId(), nombre: nombre.trim(), precio: Number(precio) || 0, foto: fotos[0], estado: 'disponible' }]);
    setNombre('');
    setPrecio('');
    setFotos([]);
  }

  return (
    <div className="editor-articulos">
      {articulos.map((a) => (
        <div key={a.id} className="fila-articulo">
          {a.foto ? <Foto id={a.foto} className="mini-img articulo-mini" /> : <span className="articulo-mini">📦</span>}
          <span className="fila-titulo">{a.nombre}<small className="muted"><br />{a.precio > 0 ? cop(a.precio) : 'A convenir'}</small></span>
          <button type="button" className="btn link chico" onClick={() => { if (a.foto) borrarFoto(a.foto); onChange(articulos.filter((x) => x.id !== a.id)); }}>Quitar</button>
        </div>
      ))}
      {articulos.length < MAX_ARTICULOS && (
        <div className="nuevo-articulo">
          <div className="fila">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Artículo (ej: Bicicleta rin 26)" maxLength={60}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }} />
            <input type="number" inputMode="numeric" min={0} step={1000} value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Precio COP" />
          </div>
          <SelectorFotos fotos={fotos} onChange={setFotos} max={1} texto="📷 Foto" />
          <button type="button" className="btn secondary" onClick={agregar} disabled={!nombre.trim()}>＋ Agregar artículo</button>
        </div>
      )}
    </div>
  );
}

export function SelectorMediosPago({ valor, onChange }: { valor: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="plantillas">
      {MEDIOS_PAGO.map((m) => (
        <button key={m} type="button" className={valor.includes(m) ? 'activo-chip' : ''}
          onClick={() => onChange(valor.includes(m) ? valor.filter((x) => x !== m) : [...valor, m])}>
          {valor.includes(m) ? '✔ ' : ''}{m}
        </button>
      ))}
    </div>
  );
}

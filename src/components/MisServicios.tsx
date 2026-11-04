import type { Pago, Post, PostServicio, Usuario } from '../types';
import { COMISION, ESTADOS, RUBRO, cop } from '../servicios';
import { useEstado } from '../store';
import { PLAN, promoActiva } from '../promociones';

interface Props {
  usuario: Usuario;
  posts: Post[];
  pagos: Pago[];
  onAbrir: (id: string) => void;
}

const esServicio = (p: Post): p is PostServicio => p.categoria === 'servicio';
const suma = (lista: Pago[], campo: 'valor' | 'comision' | 'neto') => lista.reduce((t, p) => t + p[campo], 0);

export function MisServicios({ usuario, posts, pagos, onAbrir }: Props) {
  const servicios = posts.filter(esServicio);
  const solicitados = servicios.filter((p) => p.modo === 'necesito' && p.autorId === usuario.id);
  const postulados = servicios.filter((p) => p.modo === 'necesito' && p.postulaciones.some((x) => x.proveedorId === usuario.id));
  const ofertas = servicios.filter((p) => p.modo === 'ofrezco' && p.autorId === usuario.id);
  const misPagos = pagos.filter((p) => p.clienteId === usuario.id || p.proveedorId === usuario.id);

  const liberados = pagos.filter((p) => p.estado === 'liberado');
  const retenidos = pagos.filter((p) => p.estado === 'retenido');
  const { promociones } = useEstado();
  const misPromos = promociones.filter((p) => p.autorId === usuario.id);
  const ingresosPromo = promociones.reduce((t, p) => t + p.precio, 0);
  const tituloDe = (postId: string) => posts.find((p) => p.id === postId)?.titulo ?? 'Publicación eliminada';

  const fila = (p: PostServicio, extra?: string) => (
    <button key={p.id} className="fila-servicio" onClick={() => onAbrir(p.id)}>
      <span>{RUBRO[p.rubro]?.icono}</span>
      <span className="fila-titulo">{p.titulo}{extra && <small className="muted"><br />{extra}</small>}</span>
      <span className={`estado estado-${p.estado}`}>{p.modo === 'ofrezco' ? 'Publicada' : ESTADOS[p.estado]}</span>
    </button>
  );

  return (
    <div className="feed">
      <section className="panel">
        <h3>📈 Panel de la plataforma <small className="muted">(demo)</small></h3>
        <div className="stats">
          <div><b>{cop(suma(liberados, 'valor'))}</b><span>Movido en servicios</span></div>
          <div><b>{cop(suma(liberados, 'comision'))}</b><span>Ingresos RedCity ({COMISION * 100}%)</span></div>
          <div><b>{cop(suma(retenidos, 'valor'))}</b><span>Pagos retenidos</span></div>
          <div><b>{cop(ingresosPromo)}</b><span>Ingresos por promociones</span></div>
          <div><b>{cop(suma(liberados, 'comision') + ingresosPromo)}</b><span>Ingresos totales</span></div>
          <div><b>{promociones.filter((p) => promoActiva(p)).length}</b><span>Promociones activas</span></div>
        </div>
        <small className="muted">Las comisiones solo se cobran cuando el cliente confirma que el servicio se realizó. Los ingresos por promociones incluyen las de ejemplo del demo.</small>
      </section>

      <section className="panel">
        <h3>📣 Mis promociones ({misPromos.length})</h3>
        {misPromos.length === 0 && <p className="muted">Abre una de tus publicaciones (evento, oferta, servicio o trueque) y toca “Promocionar” para que la vean más vecinos.</p>}
        {misPromos.map((pr) => (
          <button key={pr.id} className="fila-servicio" onClick={() => onAbrir(pr.postId)}>
            <span>{PLAN[pr.plan].icono}</span>
            <span className="fila-titulo">
              {tituloDe(pr.postId)}
              <small className="muted"><br />Plan {PLAN[pr.plan].nombre} · {pr.vistas} vistas · {pr.clics} clics · pagaste {cop(pr.total)}</small>
            </span>
            <span className={`estado ${promoActiva(pr) ? 'estado-completada' : ''}`}>{promoActiva(pr) ? 'Activa' : pr.estado === 'detenida' ? 'Detenida' : 'Terminada'}</span>
          </button>
        ))}
      </section>

      <section className="panel">
        <h3>🙋 Lo que he solicitado ({solicitados.length})</h3>
        {solicitados.length === 0 && <p className="muted">Toca ＋ y publica lo que necesitas. Ej: “Se necesita aseo los jueves, $100.000”.</p>}
        {solicitados.map((p) => fila(p, `${p.postulaciones.length} propuesta(s)`))}
      </section>

      <section className="panel">
        <h3>📨 Mis propuestas como proveedor ({postulados.length})</h3>
        {postulados.length === 0 && <p className="muted">Postúlate a las necesidades de tus vecinos desde el feed.</p>}
        {postulados.map((p) => {
          const mia = p.postulaciones.find((x) => x.proveedorId === usuario.id)!;
          return fila(p, `Propusiste ${cop(mia.precio)}${p.asignadoId === mia.id ? ' · 🎉 Te eligieron' : ''}`);
        })}
      </section>

      <section className="panel">
        <h3>💼 Mis servicios ofrecidos ({ofertas.length})</h3>
        {ofertas.length === 0 && <p className="muted">¿Tienes un oficio, negocio o profesión? Publícalo como “Ofrezco”.</p>}
        {ofertas.map((p) => fila(p, p.valor > 0 ? `Desde ${cop(p.valor)} ${p.unidad}` : 'Precio a convenir'))}
      </section>

      <section className="panel">
        <h3>💳 Mis pagos ({misPagos.length})</h3>
        {misPagos.length === 0 && <p className="muted">Aún no hay pagos.</p>}
        {misPagos.map((p) => (
          <button key={p.id} className="fila-servicio" onClick={() => onAbrir(p.postId)}>
            <span>{p.clienteId === usuario.id ? '⬆️' : '⬇️'}</span>
            <span className="fila-titulo">
              {p.titulo}
              <small className="muted"><br />Cliente pagó {cop(p.total)} (servicio {cop(p.valor)} + transacción {cop(p.pasarela)}) · comisión {cop(p.comision)} · {p.proveedor} recibe {cop(p.neto)}</small>
            </span>
            <span className={`estado pago-${p.estado}`}>{{ retenido: 'Retenido', liberado: 'Pagado', reembolsado: 'Reembolsado' }[p.estado]}</span>
          </button>
        ))}
      </section>
    </div>
  );
}

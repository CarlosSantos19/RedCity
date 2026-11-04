import { useEffect, useMemo, useState } from 'react';
import { acciones, alertaActiva, esMiembro, noLeidos, useEstado } from './store';
import { nav, useUI } from './ui';
import type { Categoria, Post, Promocion } from './types';
import { ESPACIOS_PROMO, POSICION_SEGUNDO_ESPACIO, promoActiva } from './promociones';
import { distanciaKm } from './geo';
import { Onboarding } from './components/Onboarding';
import { PostCard } from './components/PostCard';
import { PostDetail } from './components/PostDetail';
import { NewPost } from './components/NewPost';
import { MapView } from './components/MapView';
import { CATEGORIAS } from './components/categorias';
import { MisServicios } from './components/MisServicios';
import { Redes } from './components/Redes';
import { RedDetalle } from './components/RedDetalle';
import { Bandeja, ChatModal } from './components/Chat';
import { MiPerfil, PerfilModal } from './components/Perfil';
import { GRUPOS, RUBRO, type GrupoId } from './servicios';
import { CrearHistoria, CrearNota, CrearReel, EnVivo, MenuCrear, type TipoCreacion } from './components/Crear';
import { BarraHistorias, VisorHistorias, type Grupo } from './components/Historias';
import { VisorReels } from './components/Reels';
import { DirectorioEmpresas, FormEmpresa, PaginaEmpresa } from './components/Empresas';
import type { Empresa } from './types';
import { PanelDerecho, PanelIzquierdo } from './components/Laterales';
import { FilaDesplazable } from './components/FilaDesplazable';
import { NUBE } from './nube/config';
import { AvisoSoloDispositivo, CargandoNube, ErrorNube, NuevaClave } from './nube/ComponentesNube';
import { useNube } from './nube/sincronizar';

const RADIOS = [0.5, 1, 2];
/** Las alertas urgentes se fijan arriba del feed durante 24 h. */
const FIJAR_URGENTE_MS = 24 * 3600_000;

type Vista = 'barrio' | 'redes' | 'mensajes' | 'servicios' | 'perfil';

/** Minúsculas y sin tildes, para que "plomeria" encuentre "Plomería". */
const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Rotación justa de promociones: el orden se sortea una vez por visita (semilla de sesión),
 * así los anunciantes se turnan entre visitas pero el feed no "salta" mientras lo miras.
 */
const SEMILLA_SESION = Math.random().toString(36);
function turno(id: string): number {
  let h = 0;
  for (const ch of id + SEMILLA_SESION) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return h;
}
/** Promociones que ya se contaron como vistas en esta sesión. */
const vistasContadas = new Set<string>();

function textoBuscable(p: Post): string {
  const partes = [p.titulo, p.descripcion, p.autor];
  if (p.categoria === 'servicio') partes.push(RUBRO[p.rubro]?.nombre ?? '');
  if (p.categoria === 'trueque') partes.push(p.ofrece, p.busca);
  if (p.categoria === 'oferta') partes.push(p.negocio);
  if (p.categoria === 'evento') partes.push(p.lugar);
  if (p.categoria === 'garaje') partes.push('venta de garaje', ...p.articulos.map((a) => a.nombre));
  return normalizar(partes.join(' '));
}

export default function App() {
  const { usuario, barrios, posts, pagos, redes, conversaciones, promociones, empresas } = useEstado();
  const estadoNube = useNube();
  const [verNegocios, setVerNegocios] = useState(false);
  /** null = cerrado; { empresa: undefined } = crear; { empresa } = editar */
  const [formEmpresa, setFormEmpresa] = useState<{ empresa?: Empresa } | null>(null);
  const ui = useUI();
  const [vista, setVista] = useState<Vista>('barrio');
  const [verMapa, setVerMapa] = useState(false);
  const [filtro, setFiltro] = useState<Categoria | 'todo'>('todo');
  const [modoServ, setModoServ] = useState<'todos' | 'necesito' | 'ofrezco'>('todos');
  const [grupo, setGrupo] = useState<GrupoId | 'todos'>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [creando, setCreando] = useState(false);
  const [menuCrear, setMenuCrear] = useState(false);
  const [creacion, setCreacion] = useState<Exclude<TipoCreacion, 'publicacion' | 'negocio'> | null>(null);
  const [verReels, setVerReels] = useState(false);
  const [visorHist, setVisorHist] = useState<{ grupos: Grupo[]; indice: number } | null>(null);

  // Enlaces compartidos (?post=id) abren directamente la publicación
  const logueado = !!usuario;
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('post');
    if (!logueado || !id) return;
    nav.post(id);
    history.replaceState(null, '', location.pathname);
  }, [logueado]);

  function elegirCreacion(t: TipoCreacion) {
    setMenuCrear(false);
    if (t === 'publicacion') setCreando(true);
    else if (t === 'negocio') setFormEmpresa({});
    else setCreacion(t);
  }

  const nombreBarrio = useMemo(() => new Map(barrios.map((b) => [b.id, b.nombre])), [barrios]);

  /**
   * Feed SIN algoritmo: solo lo que está dentro del radio elegido, en orden cronológico.
   * La única excepción son las alertas urgentes recientes, que se fijan arriba.
   */
  const { cercanos, promos } = useMemo(() => {
    if (!usuario) return { cercanos: [], promos: [] };
    const ahora = Date.now();
    const q = normalizar(busqueda.trim());
    const esFijado = (p: Post) => p.categoria === 'seguridad' && p.nivel === 'urgente' && ahora - p.creado < FIJAR_URGENTE_MS;
    const pasaFiltros = (p: Post) => {
      if (p.oculta && p.autorId !== usuario.id) return false;
      if (filtro !== 'todo' && p.categoria !== filtro) return false;
      // Las ventas de garaje que ya terminaron salen del feed (el vendedor aún las ve)
      if (p.categoria === 'garaje' && new Date(p.fin).getTime() <= ahora && p.autorId !== usuario.id) return false;
      if (p.categoria === 'servicio') {
        // Las necesidades ya asignadas/cerradas salen del feed (siguen en "Servicios")
        if (p.modo === 'necesito' && p.estado !== 'abierta') return false;
        if (filtro === 'servicio' && !((modoServ === 'todos' || p.modo === modoServ) && (grupo === 'todos' || RUBRO[p.rubro]?.grupo === grupo))) return false;
      }
      return !q || q.split(/\s+/).every((palabra) => textoBuscable(p).includes(palabra));
    };
    const candidatos = posts.filter(pasaFiltros).map((p) => ({ post: p, distancia: distanciaKm(usuario.lat, usuario.lng, p.lat, p.lng) }));
    const porId = new Map(candidatos.map((x) => [x.post.id, x]));

    // Promociones: activas, dentro del alcance PAGADO (aunque esté fuera de mi radio), máx. 2, en rotación
    const promos = promociones
      .filter((pr) => promoActiva(pr, ahora))
      .map((pr) => ({ promo: pr, ...porId.get(pr.postId)! }))
      .filter((x) => x.post && !x.post.oculta && x.distancia <= x.promo.alcanceKm)
      .sort((a, b) => turno(a.promo.id) - turno(b.promo.id))
      .slice(0, ESPACIOS_PROMO);
    const promovidos = new Set(promos.map((x) => x.post.id));

    const cercanos = candidatos
      .filter((x) => x.distancia <= usuario.radioKm && !promovidos.has(x.post.id))
      .sort((a, b) => Number(esFijado(b.post)) - Number(esFijado(a.post)) || b.post.creado - a.post.creado);
    return { cercanos, promos };
  }, [posts, usuario, filtro, modoServ, grupo, busqueda, promociones]);

  /** Feed final: espacio promocionado arriba, otro después de 5 publicaciones normales. */
  const feed: { post: Post; distancia: number; promo?: Promocion }[] = [...cercanos];
  if (promos[0]) feed.unshift(promos[0]);
  if (promos[1]) feed.splice(Math.min(feed.length, POSICION_SEGUNDO_ESPACIO + 1), 0, promos[1]);

  // Cuenta una vista por promoción y por sesión (sin contar las del propio anunciante)
  const enFeed = vista === 'barrio' && !verMapa;
  const idsPromo = promos.filter((x) => x.promo.autorId !== usuario?.id).map((x) => x.promo.id).join(',');
  useEffect(() => {
    if (!enFeed || !idsPromo) return;
    const nuevas = idsPromo.split(',').filter((id) => !vistasContadas.has(id));
    nuevas.forEach((id) => vistasContadas.add(id));
    acciones.registrarVistas(nuevas);
  }, [enFeed, idsPromo]);

  if (NUBE && estadoNube.iniciando) return <><CargandoNube /><ErrorNube /></>;
  if (!usuario) return <><Onboarding /><NuevaClave /><ErrorNube /></>;

  const barrio = barrios.find((b) => b.id === usuario.barrioId);
  const urgentes = cercanos.filter((x) => x.post.categoria === 'seguridad' && x.post.nivel === 'urgente').length;
  /** Alertas activas de OTROS vecinos en las redes a las que pertenezco */
  const alertasRedes = redes
    .filter((r) => esMiembro(r, usuario.id))
    .flatMap((r) => r.mensajes.filter((m) => alertaActiva(m) && m.autorId !== usuario.id).map((m) => ({ red: r, m })));
  const sos = alertasRedes.filter((a) => a.m.tipo === 'sos');
  const sinLeer = conversaciones.filter((c) => c.participantes.includes(usuario.id)).reduce((t, c) => t + noLeidos(c, usuario.id), 0);

  const postAbierto = posts.find((p) => p.id === ui.postId);
  const red = redes.find((r) => r.id === ui.redId);
  const chat = conversaciones.find((c) => c.id === ui.chatId);
  const empresaAbierta = empresas.find((e) => e.id === ui.empresaId);

  function salir() {
    if (!confirm(`¿Cerrar la sesión de ${usuario!.correo}?`)) return;
    setVista('barrio');
    nav.cerrarTodo();
    acciones.cerrarSesion();
  }

  const pestaña = (v: Vista, icono: string, nombre: string, aviso?: number | boolean) => (
    <button className={vista === v ? 'activo' : ''} onClick={() => setVista(v)}>
      <span>{icono}{aviso === true && <i className="punto-alerta" />}{typeof aviso === 'number' && aviso > 0 && <i className="contador-tab">{aviso}</i>}</span>
      {nombre}
    </button>
  );

  return (
    <div className="layout">
    <aside className="lateral izquierda">
      <PanelIzquierdo usuario={usuario} vista={vista} onVista={setVista} onNegocios={() => setVerNegocios(true)} onReels={() => setVerReels(true)} onCrear={() => setMenuCrear(true)} />
    </aside>
    <div className="app">
      <header className="topbar">
        <div>
          <h1>🏘️ {barrio?.nombre}</h1>
          <p>{barrio?.localidad}, Bogotá · {usuario.nombre} {usuario.verificado ? <span className="verif">✔ verificado</span> : <span className="sin-verif">sin verificar</span>}</p>
        </div>
        <div className="radio">
          <span>Radio</span>
          {RADIOS.map((r) => (
            <button key={r} className={r === usuario.radioKm ? 'activo' : ''} onClick={() => acciones.cambiarRadio(r)}>
              {r < 1 ? `${r * 1000} m` : `${r} km`}
            </button>
          ))}
        </div>
      </header>

      {alertasRedes.length > 0 && (
        <button className={`banner-urgente banner-red ${sos.length ? '' : 'solo-ayuda'}`} onClick={() => nav.red((sos[0] ?? alertasRedes[0]).red.id)}>
          {sos.length
            ? `🆘 ${sos[0].m.autor} activó SOS en "${sos[0].red.nombre}"${sos.length > 1 ? ` (+${sos.length - 1} más)` : ''}. Toca para ver.`
            : `🙋 ${alertasRedes[0].m.autor} pide ayuda en "${alertasRedes[0].red.nombre}". Toca para ver.`}
        </button>
      )}
      {vista === 'barrio' && urgentes > 0 && <div className="banner-urgente">🚨 {urgentes} alerta(s) urgente(s) cerca de ti · Emergencias: <a href="tel:123">123</a></div>}

      {vista === 'barrio' && (
        <>
          <div className="buscador">
            <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="🔍 Buscar: plomero, bicicleta, panadería…" />
            <button className="btn chico secondary" onClick={() => setVerNegocios(true)} aria-label="Negocios del barrio" title="Negocios">🏢</button>
            <button className="btn chico secondary" onClick={() => setVerReels(true)} aria-label="Ver reels" title="Reels">🎬</button>
            <button className={`btn chico ${verMapa ? 'primary' : 'secondary'}`} onClick={() => setVerMapa(!verMapa)} title={verMapa ? 'Ver lista' : 'Ver mapa'}>
              {verMapa ? '📰' : '🗺️'}<span className="solo-ancho">{verMapa ? ' Lista' : ' Mapa'}</span>
            </button>
          </div>
          <FilaDesplazable className="filtros" etiqueta="categorías">
            <button className={filtro === 'todo' ? 'activo' : ''} onClick={() => setFiltro('todo')}>Todo</button>
            {(Object.keys(CATEGORIAS) as Categoria[]).map((c) => (
              <button key={c} className={filtro === c ? 'activo' : ''} onClick={() => setFiltro(c)}>
                {CATEGORIAS[c].icono} {CATEGORIAS[c].nombre}
              </button>
            ))}
          </FilaDesplazable>
          {filtro === 'servicio' && (
            <FilaDesplazable className="filtros sub" etiqueta="filtros de servicios">
              {(['todos', 'necesito', 'ofrezco'] as const).map((m) => (
                <button key={m} className={modoServ === m ? 'activo' : ''} onClick={() => setModoServ(m)}>
                  {{ todos: 'Todos', necesito: '🙋 Se necesita', ofrezco: '💼 Ofrecen' }[m]}
                </button>
              ))}
              <select value={grupo} onChange={(e) => setGrupo(e.target.value as GrupoId | 'todos')}>
                <option value="todos">Todos los rubros</option>
                {(Object.keys(GRUPOS) as GrupoId[]).map((g) => <option key={g} value={g}>{GRUPOS[g]}</option>)}
              </select>
            </FilaDesplazable>
          )}
        </>
      )}

      {vista === 'redes' && <AvisoSoloDispositivo que="Redes de seguridad y apoyo" />}
      {vista === 'mensajes' && <AvisoSoloDispositivo que="El chat privado" />}
      {vista === 'servicios' && <AvisoSoloDispositivo que="Propuestas, pagos y promociones" />}
      <main>
        {vista === 'redes' && <Redes usuario={usuario} redes={redes} barrios={barrios} onAbrir={nav.red} />}
        {vista === 'mensajes' && <Bandeja usuario={usuario} />}
        {vista === 'servicios' && <MisServicios usuario={usuario} posts={posts} pagos={pagos} onAbrir={nav.post} />}
        {vista === 'perfil' && <MiPerfil usuario={usuario} onSalir={salir} onCrearNegocio={() => setFormEmpresa({})} />}
        {vista === 'barrio' && (verMapa ? (
          <MapView usuario={usuario} posts={cercanos.map((x) => x.post)} onAbrir={nav.post} />
        ) : (
          <div className="feed">
            {!busqueda && (
              <BarraHistorias
                usuario={usuario}
                onCrearHistoria={() => setCreacion('historia')}
                onCrearNota={() => setCreacion('nota')}
                onAbrir={(grupos, indice) => setVisorHist({ grupos, indice })}
              />
            )}
            {feed.length === 0 && (
              <div className="vacio">
                {busqueda
                  ? <p>No encontramos “{busqueda}” en {usuario.radioKm < 1 ? `${usuario.radioKm * 1000} m` : `${usuario.radioKm} km`} a la redonda.</p>
                  : <p>No hay publicaciones en {usuario.radioKm < 1 ? `${usuario.radioKm * 1000} m` : `${usuario.radioKm} km`} a la redonda.</p>}
                <p className="muted">Amplía el radio o publica lo que buscas: alguien del barrio puede tenerlo.</p>
              </div>
            )}
            {feed.map(({ post, distancia, promo }) => (
              <PostCard
                key={post.id} post={post} usuario={usuario} distancia={distancia} barrio={nombreBarrio.get(post.barrioId) ?? ''} promocionado={!!promo}
                onAbrir={() => { if (promo && promo.autorId !== usuario.id) acciones.registrarClic(promo.id); nav.post(post.id); }}
              />
            ))}
            {feed.length > 0 && <p className="fin-feed muted">Esto es todo lo de tu cuadra por ahora. Sin scroll infinito. 🌱</p>}
          </div>
        ))}
      </main>

      {(vista === 'barrio' || vista === 'servicios') && <button className="fab" onClick={() => setMenuCrear(true)} aria-label="Crear">＋</button>}

      <nav className="bottombar">
        {pestaña('barrio', '📰', 'Barrio')}
        {pestaña('redes', '🤝', 'Redes', alertasRedes.length > 0)}
        {pestaña('mensajes', '💬', 'Mensajes', sinLeer)}
        {pestaña('servicios', '💼', 'Servicios')}
        {pestaña('perfil', '👤', 'Perfil')}
      </nav>

      {postAbierto && <PostDetail post={postAbierto} usuario={usuario} barrio={nombreBarrio.get(postAbierto.barrioId) ?? ''} />}
      {red && <RedDetalle red={red} usuario={usuario} onCerrar={() => nav.red(null)} />}
      {ui.perfilId && <PerfilModal perfilId={ui.perfilId} usuario={usuario} />}
      {chat && <ChatModal conv={chat} usuario={usuario} />}
      {verNegocios && <DirectorioEmpresas usuario={usuario} onCerrar={() => setVerNegocios(false)} onCrear={() => setFormEmpresa({})} />}
      {empresaAbierta && <PaginaEmpresa empresa={empresaAbierta} usuario={usuario} onEditar={() => setFormEmpresa({ empresa: empresaAbierta })} />}
      {formEmpresa && <FormEmpresa usuario={usuario} empresa={formEmpresa.empresa} onCerrar={() => setFormEmpresa(null)} />}
      {menuCrear && <MenuCrear onElegir={elegirCreacion} onCerrar={() => setMenuCrear(false)} />}
      {creacion === 'historia' && <CrearHistoria usuario={usuario} onCerrar={() => setCreacion(null)} />}
      {creacion === 'nota' && <CrearNota usuario={usuario} onCerrar={() => setCreacion(null)} />}
      {creacion === 'reel' && <CrearReel usuario={usuario} onCerrar={() => { setCreacion(null); setVerReels(true); }} />}
      {creacion === 'envivo' && <EnVivo onCerrar={() => setCreacion(null)} />}
      {verReels && !creacion && <VisorReels usuario={usuario} onCerrar={() => setVerReels(false)} onCrear={() => setCreacion('reel')} />}
      {visorHist && <VisorHistorias grupos={visorHist.grupos} inicial={visorHist.indice} usuario={usuario} onCerrar={() => setVisorHist(null)} />}
      <NuevaClave />
      <ErrorNube />
      {creando && <NewPost usuario={usuario} categoriaInicial={filtro === 'todo' ? 'servicio' : filtro} onCerrar={() => setCreando(false)} />}
    </div>
    <aside className="lateral derecha">
      <PanelDerecho usuario={usuario} onNegocios={() => setVerNegocios(true)} />
    </aside>
    </div>
  );
}

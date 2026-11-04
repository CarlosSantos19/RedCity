import { useEffect, useMemo, useState } from 'react';
import type { Historia, Nota, Usuario } from '../types';
import { acciones, useEstado, vigente } from '../store';
import { distanciaKm, hace } from '../geo';
import { Foto } from './Fotos';
import { Avatar } from './Avatar';
import { FilaDesplazable } from './FilaDesplazable';

/** Un grupo = todas las historias vigentes de un mismo vecino. */
export interface Grupo { autorId: string; autor: string; historias: Historia[]; nota?: Nota }

/**
 * Fila de círculos arriba del feed: "Tu historia" + vecinos cercanos con historias o notas.
 * Orden: primero los que tienen historias sin ver, luego por la más reciente (sin algoritmo).
 */
export function BarraHistorias({ usuario, onCrearHistoria, onCrearNota, onAbrir }: {
  usuario: Usuario; onCrearHistoria: () => void; onCrearNota: () => void; onAbrir: (grupos: Grupo[], indice: number) => void;
}) {
  const { historias, notas } = useEstado();
  const cerca = (x: { lat: number; lng: number }) => distanciaKm(usuario.lat, usuario.lng, x.lat, x.lng) <= usuario.radioKm;

  const grupos = useMemo(() => {
    const ahora = Date.now();
    const mapa = new Map<string, Grupo>();
    for (const h of historias) {
      if (!vigente(h, ahora) || (h.autorId !== usuario.id && !cerca(h))) continue;
      const g = mapa.get(h.autorId) ?? { autorId: h.autorId, autor: h.autor, historias: [] };
      g.historias.push(h);
      mapa.set(h.autorId, g);
    }
    for (const n of notas) {
      if (!vigente(n, ahora) || (n.autorId !== usuario.id && !cerca(n))) continue;
      const g = mapa.get(n.autorId) ?? { autorId: n.autorId, autor: n.autor, historias: [] };
      g.nota = n;
      mapa.set(n.autorId, g);
    }
    const sinVer = (g: Grupo) => g.historias.some((h) => !h.vistas.includes(usuario.id));
    const ultima = (g: Grupo) => Math.max(0, ...g.historias.map((h) => h.creado), g.nota?.creado ?? 0);
    return [...mapa.values()]
      .filter((g) => g.autorId !== usuario.id)
      .map((g) => ({ ...g, historias: g.historias.sort((a, b) => a.creado - b.creado) }))
      .sort((a, b) => Number(sinVer(b)) - Number(sinVer(a)) || ultima(b) - ultima(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historias, notas, usuario]);

  const mias = historias.filter((h) => h.autorId === usuario.id && vigente(h)).sort((a, b) => a.creado - b.creado);
  const miNota = notas.find((n) => n.autorId === usuario.id && vigente(n));
  const miGrupo: Grupo = { autorId: usuario.id, autor: usuario.nombre, historias: mias, nota: miNota };
  const conHistorias = grupos.filter((g) => g.historias.length > 0);

  return (
    <FilaDesplazable className="barra-historias" etiqueta="historias">
      <div className="historia-item">
        <button className="nota-burbuja propia" onClick={onCrearNota}>{miNota ? miNota.texto : '💭 Nota…'}</button>
        <button className={`circulo ${mias.length ? 'con-historia visto' : ''}`} onClick={() => (mias.length ? onAbrir([miGrupo], 0) : onCrearHistoria())}>
          <Avatar usuarioId={usuario.id} nombre={usuario.nombre} className="avatar-hist" />
          <span className="mas" onClick={(e) => { e.stopPropagation(); onCrearHistoria(); }}>＋</span>
        </button>
        <small>Tu historia</small>
      </div>
      {grupos.map((g) => {
        const sinVer = g.historias.some((h) => !h.vistas.includes(usuario.id));
        return (
          <div key={g.autorId} className="historia-item">
            {g.nota && <span className="nota-burbuja">{g.nota.texto}</span>}
            <button
              className={`circulo ${g.historias.length ? 'con-historia' : ''} ${g.historias.length && !sinVer ? 'visto' : ''}`}
              onClick={() => g.historias.length && onAbrir(conHistorias, conHistorias.indexOf(g))}
              disabled={g.historias.length === 0}
            >
              <Avatar usuarioId={g.autorId} nombre={g.autor} className="avatar-hist" />
            </button>
            <small>{g.autor.split(' ')[0]}</small>
          </div>
        );
      })}
    </FilaDesplazable>
  );
}

const DURACION_MS = 5000;

/** Visor a pantalla completa: avanza solo cada 5 s, toca izquierda/derecha para navegar. */
export function VisorHistorias({ grupos, inicial, usuario, onCerrar }: { grupos: Grupo[]; inicial: number; usuario: Usuario; onCerrar: () => void }) {
  const { historias } = useEstado();
  const [g, setG] = useState(inicial);
  const [i, setI] = useState(() => {
    const primeraSinVer = grupos[inicial].historias.findIndex((h) => !h.vistas.includes(usuario.id));
    return primeraSinVer >= 0 ? primeraSinVer : 0;
  });
  const [progreso, setProgreso] = useState(0);
  const [pausa, setPausa] = useState(false);

  const grupo = grupos[g];
  // La versión más reciente de la historia (para ver las vistas actualizadas)
  const h = historias.find((x) => x.id === grupo?.historias[i]?.id) ?? grupo?.historias[i];
  const mia = h?.autorId === usuario.id;

  function siguiente() {
    if (i < grupo.historias.length - 1) { setI(i + 1); return; }
    if (g < grupos.length - 1) { setG(g + 1); setI(0); return; }
    onCerrar();
  }
  function anterior() {
    if (i > 0) { setI(i - 1); return; }
    if (g > 0) { setG(g - 1); setI(grupos[g - 1].historias.length - 1); }
  }

  useEffect(() => {
    if (!h) return;
    acciones.verHistoria(h.id, usuario.id);
    setProgreso(0);
  }, [h?.id, usuario.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pausa || !h) return;
    const inicio = performance.now() - progreso * DURACION_MS;
    let frame = 0;
    const tick = () => {
      const p = (performance.now() - inicio) / DURACION_MS;
      if (p >= 1) { siguiente(); return; }
      setProgreso(p);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [h?.id, pausa]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!grupo || !h) return null;

  return (
    <div className="visor-historias" onPointerDown={() => setPausa(true)} onPointerUp={() => setPausa(false)} onPointerLeave={() => setPausa(false)}>
      <div className="historia-contenido" style={{ background: h.foto ? '#000' : h.fondo }}>
        {h.foto && <Foto id={h.foto} className="historia-foto" />}
        {h.texto && <p className={h.foto ? 'texto-sobre-foto' : 'texto-historia'}>{h.texto}</p>}
      </div>
      <div className="historia-barras">
        {grupo.historias.map((x, k) => (
          <span key={x.id}><i style={{ width: `${k < i ? 100 : k === i ? progreso * 100 : 0}%` }} /></span>
        ))}
      </div>
      <div className="historia-cabecera">
        <Avatar usuarioId={grupo.autorId} nombre={grupo.autor} />
        <b>{grupo.autor}</b> <span>{hace(h.creado)}</span>
        <button className="cerrar-historia" onClick={(e) => { e.stopPropagation(); onCerrar(); }} aria-label="Cerrar">✕</button>
      </div>
      <button className="zona-tap izquierda" onClick={anterior} aria-label="Anterior" />
      <button className="zona-tap derecha" onClick={siguiente} aria-label="Siguiente" />
      {mia && (
        <div className="historia-pie">
          <span>👁️ {h.vistas.length} vecino(s) la vieron</span>
          <button onClick={(e) => { e.stopPropagation(); if (confirm('¿Borrar esta historia?')) { acciones.borrarHistoria(h.id); onCerrar(); } }}>🗑️ Borrar</button>
        </div>
      )}
    </div>
  );
}

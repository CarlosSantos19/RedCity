import { useEffect, useState } from 'react';
import type { Usuario } from '../types';
import { formatoDistancia } from '../geo';
import { acciones } from '../store';
import { CATEGORIAS_LUGAR, type CategoriaLugarId, type Lugar, buscarLugares, comoLlegar, horarioLegible } from '../directorio';
import { FilaDesplazable } from './FilaDesplazable';

/** Directorio "Cerca de mí": panaderías, droguerías, tiendas… alrededor del vecino. */
export function Cerca({ usuario, inicial }: { usuario: Usuario; inicial?: CategoriaLugarId }) {
  const [cat, setCat] = useState<CategoriaLugarId>(inicial ?? 'panaderia');
  const [lugares, setLugares] = useState<Lugar[] | null>(null);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  // Usa el mismo radio del barrio (selector de arriba)
  const radio = usuario.radioKm;

  useEffect(() => { if (inicial) setCat(inicial); }, [inicial]);

  useEffect(() => {
    let vigente = true;
    setLugares(null);
    setError(false);
    buscarLugares(cat, usuario.lat, usuario.lng, radio)
      .then((l) => { if (vigente) setLugares(l); })
      .catch(() => { if (vigente) setError(true); });
    return () => { vigente = false; };
  }, [cat, radio, usuario.lat, usuario.lng, intento]);

  const c = CATEGORIAS_LUGAR[cat];

  return (
    <div className="cerca">
      <FilaDesplazable className="filtros" etiqueta="tipos de lugar">
        {(Object.keys(CATEGORIAS_LUGAR) as CategoriaLugarId[]).map((id) => (
          <button key={id} className={cat === id ? 'activo' : ''} onClick={() => setCat(id)}>
            {CATEGORIAS_LUGAR[id].icono} {CATEGORIAS_LUGAR[id].nombre}
          </button>
        ))}
      </FilaDesplazable>

      <div className="feed">
        <div className="cerca-cabeza">
          <h2>{c.icono} {c.nombre} cerca de ti</h2>
        </div>

        {error ? (
          <div className="vacio">
            <p>No pudimos cargar los lugares. Revisa tu conexión.</p>
            <button className="btn secondary chico" onClick={() => setIntento((n) => n + 1)}>Reintentar</button>
          </div>
        ) : !lugares ? (
          <div className="vacio"><p className="muted">Buscando {c.nombre.toLowerCase()}…</p></div>
        ) : lugares.length === 0 ? (
          <div className="vacio">
            <p>No encontramos {c.nombre.toLowerCase()} a {radio < 1 ? `${radio * 1000} m` : `${radio} km`} en el mapa.</p>
            {radio < 2 && <button className="btn secondary chico" onClick={() => acciones.cambiarRadio(2)}>Buscar a 2 km</button>}
            <p className="muted">En muchos barrios el mapa aún está incompleto. Pronto podrás agregar los negocios que conoces.</p>
          </div>
        ) : (
          <>
            <p className="muted">{lugares.length} {lugares.length === 1 ? 'lugar' : 'lugares'} a menos de {radio < 1 ? `${radio * 1000} m` : `${radio} km`}, del más cercano al más lejano.</p>
            {lugares.map((l) => (
              <article key={l.id} className={`lugar ${l.sinNombre ? 'sin-nombre' : ''}`}>
                <div className="lugar-icono">{c.icono}</div>
                <div className="lugar-datos">
                  <b>{l.nombre}</b>
                  <small>{formatoDistancia(l.distanciaKm)}{l.direccion ? ` · ${l.direccion}` : ''}</small>
                  {l.horario && <small>🕒 {horarioLegible(l.horario)}</small>}
                  <div className="lugar-acciones">
                    <a className="btn secondary chico" href={comoLlegar(l)} target="_blank" rel="noreferrer">🧭 Cómo llegar</a>
                    {l.telefono && <a className="btn secondary chico" href={`tel:${l.telefono.split(/[;,]/)[0].replace(/[^\d+]/g, '')}`}>📞 Llamar</a>}
                    {l.web && <a className="btn secondary chico" href={l.web.startsWith('http') ? l.web : `https://${l.web}`} target="_blank" rel="noreferrer">🌐 Web</a>}
                  </div>
                </div>
              </article>
            ))}
          </>
        )}

        <p className="muted centro atribucion">
          Lugares del mapa abierto © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">colaboradores de OpenStreetMap</a>.
          Los horarios pueden no estar al día.
        </p>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import type { Empresa, Usuario } from '../types';
import { acciones, useEstado, type DatosEmpresa } from '../store';
import { GRUPOS, RUBRO, RUBROS, type GrupoId } from '../servicios';
import { ORDEN_REDES, REDES, celularColombia, enlaceAEditable, type EnlacesSociales, type RedSocial } from '../redesSociales';
import { distanciaKm, formatoDistancia, hace } from '../geo';
import { nav } from '../ui';
import { Foto, SelectorFotos } from './Fotos';
import { Reputacion } from './Estrellas';
import { Avatar } from './Avatar';

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nombreRubro = (id: string) => (id === 'otro' ? 'Otro negocio' : RUBRO[id]?.nombre ?? id);
const iconoRubro = (id: string) => RUBRO[id]?.icono ?? '🏢';

/** Botones de redes sociales (solo enlaces ya validados). */
export function EnlacesRedes({ redes, compacto = false }: { redes?: EnlacesSociales; compacto?: boolean }) {
  const lista = ORDEN_REDES.filter((r) => redes?.[r]);
  if (lista.length === 0) return null;
  return (
    <div className={`enlaces-redes ${compacto ? 'compacto' : ''}`}>
      {lista.map((r) => (
        <a key={r} href={redes![r]} target="_blank" rel="noopener noreferrer nofollow" className="enlace-red" title={REDES[r].nombre}>
          <span className="icono-red-social" style={{ background: REDES[r].color }}>{REDES[r].icono}</span>
          {!compacto && REDES[r].nombre}
        </a>
      ))}
    </div>
  );
}

/** Campos para escribir los enlaces a redes, con error por campo. */
export function EditorRedes({ valores, errores, onChange }: {
  valores: Partial<Record<RedSocial, string>>; errores: Partial<Record<RedSocial, string>>; onChange: (v: Partial<Record<RedSocial, string>>) => void;
}) {
  return (
    <div className="editor-redes">
      {ORDEN_REDES.map((r) => (
        <label key={r} className="campo-red">
          <span className="icono-red-social" style={{ background: REDES[r].color }}>{REDES[r].icono}</span>
          <span className="campo-red-input">
            <input value={valores[r] ?? ''} onChange={(e) => onChange({ ...valores, [r]: e.target.value })}
              placeholder={`${REDES[r].nombre}: ${REDES[r].placeholder}`} autoCapitalize="none" inputMode={r === 'whatsapp' ? 'tel' : 'url'} />
            {errores[r] && <small className="error">{errores[r]}</small>}
          </span>
        </label>
      ))}
    </div>
  );
}

export const editablesDe = (redes?: EnlacesSociales) =>
  Object.fromEntries(ORDEN_REDES.map((r) => [r, enlaceAEditable(r, redes?.[r])])) as Partial<Record<RedSocial, string>>;

/** Directorio: negocios cerca de mí, con búsqueda y filtro por tipo. */
export function DirectorioEmpresas({ usuario, onCerrar, onCrear }: { usuario: Usuario; onCerrar: () => void; onCrear: () => void }) {
  const { empresas, cuentas } = useEstado();
  const [q, setQ] = useState('');
  const [grupo, setGrupo] = useState<GrupoId | 'todos'>('todos');
  const alcance = Math.max(usuario.radioKm, 2); // los negocios se buscan al menos a 2 km

  const lista = useMemo(() => {
    const t = normalizar(q.trim());
    return empresas
      .map((e) => ({ e, d: distanciaKm(usuario.lat, usuario.lng, e.lat, e.lng) }))
      .filter(({ e, d }) => (d <= alcance || e.duenoId === usuario.id)
        && (grupo === 'todos' || RUBRO[e.rubro]?.grupo === grupo)
        && (!t || normalizar(`${e.nombre} ${nombreRubro(e.rubro)} ${e.descripcion}`).includes(t)))
      .sort((a, b) => a.d - b.d);
  }, [empresas, usuario, q, grupo, alcance]);

  // Vecinos que registraron oficios o habilidades en su perfil (sin necesidad de tener negocio)
  const vecinos = useMemo(() => {
    const t = normalizar(q.trim());
    return cuentas
      .filter((c) => c.id !== usuario.id && c.oficios?.length)
      .map((c) => ({ c, d: distanciaKm(usuario.lat, usuario.lng, c.lat, c.lng) }))
      .filter(({ c, d }) => d <= alcance && (!t || normalizar(`${c.nombre} ${c.oficios!.join(' ')}`).includes(t)))
      .sort((a, b) => a.d - b.d);
  }, [cuentas, usuario, q, alcance]);

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <h2>🏢 Negocios y oficios del barrio</h2>
        <p className="muted">A {alcance} km o menos, del más cercano al más lejano.</p>
        <div className="buscador sin-padding">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Panadería, contador, ferretería…" />
        </div>
        <nav className="filtros sin-padding">
          <button className={grupo === 'todos' ? 'activo' : ''} onClick={() => setGrupo('todos')}>Todos</button>
          {(Object.keys(GRUPOS) as GrupoId[]).map((g) => (
            <button key={g} className={grupo === g ? 'activo' : ''} onClick={() => setGrupo(g)}>{GRUPOS[g]}</button>
          ))}
        </nav>
        {lista.length === 0 && <p className="muted">No encontramos negocios. ¿Tienes uno? ¡Créale su página!</p>}
        {lista.map(({ e, d }) => (
          <button key={e.id} className="tarjeta-empresa" onClick={() => nav.empresa(e.id)}>
            {e.logo ? <Foto id={e.logo} className="logo-empresa" /> : <span className="logo-empresa">{iconoRubro(e.rubro)}</span>}
            <span className="fila-titulo">
              <b>{e.nombre}</b>{e.verificacion === 'verificada' && <span className="insignia-negocio" title="Negocio verificado"> ✔</span>}
              <small className="muted"><br />{nombreRubro(e.rubro)} · {formatoDistancia(d)} · {e.seguidores.length} seguidores</small>
              {e.horario && <small className="muted"><br />🕒 {e.horario}</small>}
            </span>
            <EnlacesRedes redes={e.redes} compacto />
          </button>
        ))}
        <button className="btn primary" onClick={onCrear}>＋ Crear la página de mi negocio</button>

        <h4>🛠️ Vecinos que saben de… ({vecinos.length})</h4>
        {vecinos.length === 0 && <p className="muted">{q ? `Ningún vecino registró “${q}” como oficio.` : 'Cuando los vecinos agreguen sus oficios en su perfil, aparecerán aquí.'}</p>}
        {vecinos.map(({ c, d }) => (
          <button key={c.id} className="tarjeta-empresa" onClick={() => nav.perfil(c.id)}>
            <Avatar usuarioId={c.id} nombre={c.nombre} />
            <span className="fila-titulo">
              <b>{c.nombre}</b>{c.documentos?.cedula === 'verificado' && <span className="insignia-negocio" title="Identidad verificada"> ✔</span>}
              <small className="muted"><br />{c.oficios!.join(' · ')} · {formatoDistancia(d)}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Página pública de un negocio. */
export function PaginaEmpresa({ empresa, usuario, onEditar }: { empresa: Empresa; usuario: Usuario; onEditar: () => void }) {
  const { posts, barrios } = useEstado();
  const [aviso, setAviso] = useState('');
  const mia = empresa.duenoId === usuario.id;
  const sigo = empresa.seguidores.includes(usuario.id);
  const susPosts = posts.filter((p) => p.empresaId === empresa.id && !p.oculta).sort((a, b) => b.creado - a.creado);
  const barrio = barrios.find((b) => b.id === empresa.barrioId);
  const cel = celularColombia(empresa.telefono);

  return (
    <div className="modal-fondo" onClick={() => nav.empresa(null)}>
      <div className="modal sin-padding-top" onClick={(e) => e.stopPropagation()}>
        <div className="portada-empresa">
          {empresa.portada ? <Foto id={empresa.portada} className="portada-img" /> : null}
          <button className="cerrar" onClick={() => nav.empresa(null)} aria-label="Cerrar">✕</button>
        </div>
        <div className="cabecera-empresa">
          {empresa.logo ? <Foto id={empresa.logo} className="logo-empresa grande" /> : <span className="logo-empresa grande">{iconoRubro(empresa.rubro)}</span>}
          <div>
            <h2>{empresa.nombre}</h2>
            <p className="muted">{nombreRubro(empresa.rubro)} · {barrio?.nombre}</p>
            {empresa.verificacion === 'verificada' && <span className="insignia">✔ Negocio verificado (NIT)</span>}
          </div>
        </div>

        <div className="acciones-empresa">
          {!mia && (
            <button className={`btn ${sigo ? 'secondary' : 'primary'}`} onClick={() => acciones.seguirEmpresa(empresa.id, usuario.id)}>
              {sigo ? '✔ Siguiendo' : '＋ Seguir'} · {empresa.seguidores.length}
            </button>
          )}
          {!mia && <button className="btn secondary" onClick={() => { nav.empresa(null); nav.chat(acciones.abrirConversacion(usuario, empresa.duenoId, empresa.nombre)); }}>💬 Mensaje</button>}
          {cel && <a className="btn secondary" href={`tel:+${cel}`}>📞 Llamar</a>}
          {mia && <button className="btn primary" onClick={onEditar}>✏️ Editar página</button>}
        </div>

        {empresa.descripcion && <p>{empresa.descripcion}</p>}
        <div className="caja">
          {empresa.horario && <>🕒 {empresa.horario}<br /></>}
          {empresa.direccion && <>📍 {empresa.direccion}<br /></>}
          {empresa.telefono && <>📞 {empresa.telefono}<br /></>}
          <span className="muted">En RedCity {hace(empresa.creado).replace('hace', 'desde hace')} · Dueño: </span>
          <button className="enlace-nombre" onClick={() => { nav.empresa(null); nav.perfil(empresa.duenoId); }}>ver perfil</button> <Reputacion usuarioId={empresa.duenoId} />
        </div>

        <h4>Redes y contacto</h4>
        <EnlacesRedes redes={empresa.redes} />
        {Object.keys(empresa.redes).length === 0 && <p className="muted">Este negocio aún no ha enlazado sus redes.</p>}

        {mia && empresa.verificacion !== 'verificada' && (
          <div className="aviso">
            {empresa.verificacion === 'en-revision'
              ? '⏳ Verificando tu NIT/RUT…'
              : <>Verifica tu negocio con el NIT o RUT para obtener la insignia <b>✔ Negocio verificado</b>.{' '}
                <button className="btn secondary chico" onClick={() => setAviso(acciones.verificarEmpresa(empresa.id) ?? '')}>Verificar</button></>}
            {aviso && <><br /><small className="error">{aviso}</small></>}
          </div>
        )}

        <h4>Publicaciones ({susPosts.length})</h4>
        {susPosts.length === 0 && <p className="muted">{mia ? 'Publica ofertas, servicios o eventos y elige “Publicar como” este negocio.' : 'Todavía no hay publicaciones.'}</p>}
        {susPosts.map((p) => (
          <button key={p.id} className="fila-servicio" onClick={() => { nav.empresa(null); nav.post(p.id); }}>
            <span className="fila-titulo">{p.titulo}<small className="muted"><br />{hace(p.creado)}</small></span>
          </button>
        ))}

        {mia && (
          <button className="btn link" onClick={() => { if (confirm(`¿Eliminar la página de "${empresa.nombre}"? Sus publicaciones quedarán a tu nombre.`)) { acciones.eliminarEmpresa(empresa.id, usuario.id); nav.empresa(null); } }}>
            Eliminar página del negocio
          </button>
        )}
      </div>
    </div>
  );
}

/** Formulario para crear o editar un negocio. */
export function FormEmpresa({ usuario, empresa, onCerrar }: { usuario: Usuario; empresa?: Empresa; onCerrar: () => void }) {
  const [d, setD] = useState<DatosEmpresa>({
    nombre: empresa?.nombre ?? '', rubro: empresa?.rubro ?? '', descripcion: empresa?.descripcion ?? '',
    logo: empresa?.logo, portada: empresa?.portada, direccion: empresa?.direccion ?? '', telefono: empresa?.telefono ?? '',
    horario: empresa?.horario ?? '', nit: empresa?.nit ?? '', redes: editablesDe(empresa?.redes),
  });
  const [error, setError] = useState('');
  const [errores, setErrores] = useState<Partial<Record<RedSocial, string>>>({});
  const cambiar = (c: Partial<DatosEmpresa>) => setD({ ...d, ...c });

  function guardar() {
    const r = acciones.guardarEmpresa(usuario, d, empresa?.id);
    setError(r.error ?? '');
    setErrores(r.errores ?? {});
    if (r.errores) setError('Revisa los enlaces de redes sociales marcados en rojo.');
    if (r.id) { onCerrar(); nav.empresa(r.id); }
  }

  return (
    <div className="modal-fondo encima" onClick={onCerrar}>
      <div className="modal form" onClick={(e) => e.stopPropagation()}>
        <button className="cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <h2>🏢 {empresa ? 'Editar negocio' : 'Crear página de negocio'}</h2>
        <label>Nombre del negocio
          <input value={d.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} maxLength={60} placeholder="Ej: Panadería La Esquina" />
        </label>
        <label>Tipo de negocio
          <select value={d.rubro} onChange={(e) => cambiar({ rubro: e.target.value })}>
            <option value="">Selecciona…</option>
            {(Object.keys(GRUPOS) as GrupoId[]).map((g) => (
              <optgroup key={g} label={GRUPOS[g]}>
                {RUBROS.filter((r) => r.grupo === g).map((r) => <option key={r.id} value={r.id}>{r.icono} {r.nombre}</option>)}
              </optgroup>
            ))}
            <option value="otro">🏢 Otro</option>
          </select>
        </label>
        <label>Descripción
          <textarea rows={3} maxLength={500} value={d.descripcion} onChange={(e) => cambiar({ descripcion: e.target.value })} placeholder="Qué vendes u ofreces, qué te hace especial" />
        </label>
        <div className="fila">
          <div><label>Logo</label><SelectorFotos fotos={d.logo ? [d.logo] : []} onChange={(f) => cambiar({ logo: f[0] })} max={1} texto="📷 Logo" /></div>
          <div><label>Portada</label><SelectorFotos fotos={d.portada ? [d.portada] : []} onChange={(f) => cambiar({ portada: f[0] })} max={1} texto="🖼️ Portada" /></div>
        </div>
        <label>Horario
          <input value={d.horario} onChange={(e) => cambiar({ horario: e.target.value })} maxLength={120} placeholder="Ej: Lun a sáb 7 a. m. – 7 p. m." />
        </label>
        <label>Dirección
          <input value={d.direccion} onChange={(e) => cambiar({ direccion: e.target.value })} maxLength={120} placeholder="Ej: Cra 7 # 45-10, local 2" />
        </label>
        <div className="fila">
          <label>Teléfono
            <input value={d.telefono} onChange={(e) => cambiar({ telefono: e.target.value })} inputMode="tel" placeholder="300 123 4567" />
          </label>
          <label>NIT o RUT <small className="muted">(opcional)</small>
            <input value={d.nit} onChange={(e) => cambiar({ nit: e.target.value })} placeholder="900123456-7" />
          </label>
        </div>

        <h4>Redes sociales</h4>
        <small className="muted">Escribe tu usuario (@minegocio) o pega el enlace. Solo se aceptan enlaces del sitio de cada red.</small>
        <EditorRedes valores={d.redes} errores={errores} onChange={(redes) => cambiar({ redes })} />

        {error && <p className="aviso peligro">{error}</p>}
        <button className="btn primary" onClick={guardar}>{empresa ? 'Guardar cambios' : 'Crear página'}</button>
      </div>
    </div>
  );
}

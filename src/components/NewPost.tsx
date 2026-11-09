import { useState } from 'react';
import type { Categoria, Frecuencia, ModoServicio, NivelAlerta, Post, Usuario } from '../types';
import { acciones, nuevoId } from '../store';
import { CATEGORIAS } from './categorias';
import { difuminar } from '../geo';
import { FRECUENCIAS, GRUPOS, NOMBRE_DOCUMENTO, RUBROS, RUBROS_DOMESTICOS, UNIDADES, documentosFaltantes, requiereFoto, rubroPausado, type GrupoId } from '../servicios';
import { Desglose } from './Desglose';
import { SelectorFotos } from './Fotos';
import { borrarFoto } from '../fotos';
import type { ArticuloGaraje } from '../types';
import { EditorArticulos, SelectorMediosPago } from './Garaje';
import { useEstado } from '../store';

interface Props {
  usuario: Usuario;
  categoriaInicial?: Categoria;
  onCerrar: () => void;
}

export function NewPost({ usuario, categoriaInicial = 'servicio', onCerrar }: Props) {
  const [cat, setCat] = useState<Categoria>(categoriaInicial);
  const [modo, setModo] = useState<ModoServicio>('necesito');
  const [rubro, setRubro] = useState('');
  const [valor, setValor] = useState('');
  const [unidad, setUnidad] = useState(UNIDADES[0]);
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('una-vez');
  const [dia, setDia] = useState('');
  const valorNum = Number(valor) || 0;
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [ofrece, setOfrece] = useState('');
  const [busca, setBusca] = useState('');
  const [nivel, setNivel] = useState<NivelAlerta>('precaucion');
  const [negocio, setNegocio] = useState('');
  const [precio, setPrecio] = useState('');
  const [vence, setVence] = useState('');
  const [fecha, setFecha] = useState('');
  const [lugar, setLugar] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  const misEmpresas = useEstado().empresas.filter((e) => e.duenoId === usuario.id);
  /** '' = publicar a mi nombre; si no, id del negocio */
  const [comoEmpresa, setComoEmpresa] = useState('');
  const [inicioVenta, setInicioVenta] = useState('');
  const [finVenta, setFinVenta] = useState('');
  const [direccion, setDireccion] = useState('');
  const [mediosPago, setMediosPago] = useState<string[]>(['Efectivo']);
  const [articulos, setArticulos] = useState<ArticuloGaraje[]>([]);
  const errorHorario = inicioVenta && finVenta && finVenta <= inicioVenta ? 'La hora de cierre debe ser después de la de inicio.'
    : finVenta && new Date(finVenta).getTime() <= Date.now() ? 'La venta debe terminar en el futuro.' : '';
  // Para OFRECER servicios de riesgo (entrar a casas, cuidar niños…) se exige verificación
  const faltan = cat === 'servicio' && modo === 'ofrezco' && rubro ? documentosFaltantes(usuario, rubro) : [];
  const faltaFoto = cat === 'servicio' && modo === 'ofrezco' && !!rubro && requiereFoto(rubro) && !usuario.foto;

  /** Al cerrar sin publicar, se borran las fotos que se alcanzaron a subir. */
  function cancelar() {
    fotos.forEach(borrarFoto);
    articulos.forEach((a) => a.foto && borrarFoto(a.foto));
    onCerrar();
  }

  const extraOk =
    // Una necesidad debe tener valor; una oferta puede quedar "a convenir" (valor 0)
    cat === 'servicio' ? rubro && (modo === 'ofrezco' || valorNum > 0) :
    cat === 'garaje' ? inicioVenta && finVenta && !errorHorario && articulos.length > 0 :
    cat === 'trueque' ? ofrece && busca :
    cat === 'oferta' ? negocio && precio && vence :
    cat === 'evento' ? fecha && lugar : true;
  const valido = titulo.trim().length >= 4 && !!extraOk && faltan.length === 0 && !faltaFoto;

  function publicar() {
    const empresa = misEmpresas.find((e) => e.id === comoEmpresa);
    const base = {
      id: nuevoId(), titulo: titulo.trim(), descripcion: descripcion.trim(),
      autorId: usuario.id, autor: empresa?.nombre ?? usuario.nombre, autorVerificado: usuario.verificado, empresaId: empresa?.id,
      barrioId: usuario.barrioId, creado: Date.now(), respuestas: [], fotos,
      ...difuminar(usuario.lat, usuario.lng),
    };
    let post: Post;
    switch (cat) {
      case 'servicio':
        post = {
          ...base, categoria: 'servicio', modo, rubro, valor: valorNum, unidad, frecuencia, dia: dia.trim(),
          estado: 'abierta', postulaciones: [], realizados: 0,
        };
        break;
      case 'garaje':
        post = { ...base, categoria: 'garaje', inicio: inicioVenta, fin: finVenta, direccion: direccion.trim(), mediosPago, articulos, asistentes: [] };
        break;
      case 'trueque': post = { ...base, categoria: 'trueque', ofrece, busca, estado: 'disponible' }; break;
      case 'seguridad': post = { ...base, categoria: 'seguridad', nivel, confirmaciones: [] }; break;
      case 'oferta': post = { ...base, categoria: 'oferta', negocio, precio, vence }; break;
      case 'evento': post = { ...base, categoria: 'evento', fecha, lugar, asistentes: [usuario.id] }; break;
    }
    acciones.publicar(post);
    onCerrar();
  }

  return (
    <div className="modal-fondo" onClick={cancelar}>
      <div className="modal form" onClick={(e) => e.stopPropagation()}>
        <button className="cerrar" onClick={cancelar} aria-label="Cerrar">✕</button>
        <h2>Nueva publicación</h2>
        {misEmpresas.length > 0 && (
          <label>Publicar como
            <select value={comoEmpresa} onChange={(e) => setComoEmpresa(e.target.value)}>
              <option value="">👤 {usuario.nombre} (yo)</option>
              {misEmpresas.map((e) => <option key={e.id} value={e.id}>🏢 {e.nombre}</option>)}
            </select>
          </label>
        )}
        <div className="selector-cat">
          {(Object.keys(CATEGORIAS) as Categoria[]).map((c) => (
            <button key={c} className={c === cat ? 'activo' : ''} style={c === cat ? { background: CATEGORIAS[c].color } : {}} onClick={() => setCat(c)}>
              {CATEGORIAS[c].icono} {CATEGORIAS[c].nombre}
            </button>
          ))}
        </div>

        {cat === 'servicio' && (
          <>
            <div className="toggle-modo">
              <button className={modo === 'necesito' ? 'activo' : ''} onClick={() => setModo('necesito')}>🙋 Necesito un servicio</button>
              <button className={modo === 'ofrezco' ? 'activo' : ''} onClick={() => setModo('ofrezco')}>💼 Ofrezco mi servicio / negocio</button>
            </div>
            <label>Tipo de servicio
              <select value={rubro} onChange={(e) => setRubro(e.target.value)}>
                <option value="">Selecciona…</option>
                {(Object.keys(GRUPOS) as GrupoId[]).map((g) => (
                  <optgroup key={g} label={GRUPOS[g]}>
                    {RUBROS.filter((r) => r.grupo === g && !rubroPausado(r.id)).map((r) => <option key={r.id} value={r.id}>{r.icono} {r.nombre}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            {faltaFoto && (
              <p className="aviso">📷 Para ofrecer este servicio necesitas una <b>foto de perfil real</b>, para que las familias reconozcan a quien llega a su casa. Súbela en <b>👤 Perfil</b>.</p>
            )}
            {faltan.length > 0 && (
              <p className="aviso">🛡️ Para ofrecer este servicio necesitas verificar: <b>{faltan.map((d) => NOMBRE_DOCUMENTO[d]).join(' y ')}</b>. Hazlo en <b>👤 Perfil → Verificación</b> (toma 1 minuto).</p>
            )}
          </>
        )}

        {cat === 'seguridad' && (
          <>
            <label>Nivel de la alerta
              <select value={nivel} onChange={(e) => setNivel(e.target.value as NivelAlerta)}>
                <option value="info">Informativo (daño, poste, basuras)</option>
                <option value="precaucion">Precaución (actividad sospechosa)</option>
                <option value="urgente">Urgente (hecho en curso)</option>
              </select>
            </label>
            {nivel === 'urgente' && <p className="aviso peligro">Si hay riesgo para la vida, llama primero a la <a href="tel:123">Línea 123</a>. Las alertas urgentes notifican a todos los vecinos en tu radio.</p>}
            {!usuario.verificado && <p className="aviso">Tu cuenta no está verificada; tu alerta se mostrará con esa etiqueta.</p>}
          </>
        )}

        <label>Título
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80}
            placeholder={{ servicio: modo === 'necesito' ? 'Ej: Se necesita aseo de casa los jueves' : 'Ej: Cerrajería 24 horas', garaje: 'Ej: Venta de garaje por mudanza', trueque: 'Ej: Cambio licuadora por plantas', seguridad: 'Ej: Robo de celular en el paradero', oferta: 'Ej: 20% en almuerzos', evento: 'Ej: Bazar navideño' }[cat]} />
        </label>

        {cat === 'servicio' && (
          <>
            <div className="fila">
              <label>{modo === 'necesito' ? '¿Cuánto pagas? (COP)' : 'Tarifa desde (COP)'}
                <input type="number" inputMode="numeric" min={0} step={1000} value={valor} onChange={(e) => setValor(e.target.value)}
                  placeholder={modo === 'necesito' ? '100000' : '0 = a convenir'} />
              </label>
              <label>Unidad
                <select value={unidad} onChange={(e) => setUnidad(e.target.value)}>
                  {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                </select>
              </label>
            </div>
            {modo === 'necesito' && (
              <div className="fila">
                <label>¿Cada cuánto?
                  <select value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as Frecuencia)}>
                    {(Object.keys(FRECUENCIAS) as Frecuencia[]).map((f) => <option key={f} value={f}>{FRECUENCIAS[f]}</option>)}
                  </select>
                </label>
                <label>Día / horario
                  <input value={dia} onChange={(e) => setDia(e.target.value)} placeholder="Ej: Jueves 8 a. m." />
                </label>
              </div>
            )}
            {valorNum > 0 && <Desglose valor={valorNum} quien={modo === 'necesito' ? 'cliente' : 'proveedor'} />}
            {modo === 'necesito' && frecuencia !== 'una-vez' && RUBROS_DOMESTICOS.includes(rubro) && (
              <p className="aviso">ℹ️ Si es un trabajo fijo y recurrente en tu casa, en Colombia puede configurar una relación laboral de servicio doméstico (afiliación a seguridad social y prestaciones). Infórmate antes de acordarlo.</p>
            )}
          </>
        )}

        {cat === 'garaje' && (
          <>
            <div className="fila">
              <label>Empieza<input type="datetime-local" value={inicioVenta} onChange={(e) => setInicioVenta(e.target.value)} /></label>
              <label>Termina<input type="datetime-local" value={finVenta} onChange={(e) => setFinVenta(e.target.value)} min={inicioVenta} /></label>
            </div>
            {errorHorario && <small className="error">{errorHorario}</small>}
            <label>Dirección o referencia <small className="muted">(opcional)</small>
              <input value={direccion} onChange={(e) => setDireccion(e.target.value)} maxLength={120} placeholder="Ej: Cra 7 # 45-10, o 'casa de reja verde frente al parque'" />
              <small className="muted">🔒 Si prefieres, déjala vacía y dásela por privado a quien te escriba.</small>
            </label>
            <label>¿Cómo te pueden pagar?</label>
            <SelectorMediosPago valor={mediosPago} onChange={setMediosPago} />
            <label>Artículos ({articulos.length}) <small className="muted">— agrega al menos uno</small></label>
            <EditorArticulos articulos={articulos} onChange={setArticulos} />
          </>
        )}

        {cat === 'trueque' && (
          <>
            <label>¿Qué ofreces?<input value={ofrece} onChange={(e) => setOfrece(e.target.value)} placeholder="Objeto, servicio o habilidad" /></label>
            <label>¿Qué buscas a cambio?<input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Escribe “Abierto a propuestas” si no sabes" /></label>
          </>
        )}
        {cat === 'oferta' && (
          <>
            <label>Negocio<input value={negocio} onChange={(e) => setNegocio(e.target.value)} placeholder="Nombre de la tienda" /></label>
            <label>Precio o descuento<input value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Ej: $8.000 o 2x1" /></label>
            <label>Válido hasta<input type="date" value={vence} onChange={(e) => setVence(e.target.value)} /></label>
          </>
        )}
        {cat === 'evento' && (
          <>
            <label>Fecha y hora<input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
            <label>Lugar<input value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Ej: Salón comunal" /></label>
          </>
        )}

        <label>Descripción
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} maxLength={500} />
        </label>
        <label>Fotos <small className="muted">(opcional, hasta 4)</small></label>
        <SelectorFotos fotos={fotos} onChange={setFotos} />
        {cat === 'seguridad' && <small className="muted">⚠️ No publiques fotos de rostros ni placas de personas que no han cometido un delito comprobado.</small>}
        <small className="muted">🔒 Tu publicación se ubica de forma aproximada (±150 m), nunca en tu dirección exacta.</small>
        <button className="btn primary" disabled={!valido} onClick={publicar}>Publicar a mis vecinos</button>
      </div>
    </div>
  );
}

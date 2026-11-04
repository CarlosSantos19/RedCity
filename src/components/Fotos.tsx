import { useRef, useState } from 'react';
import { MAX_FOTOS, borrarFoto, guardarFoto, useFoto } from '../fotos';

export function Foto({ id, className, onClick }: { id: string; className?: string; onClick?: () => void }) {
  const url = useFoto(id);
  return url
    ? <img src={url} className={className} alt="" loading="lazy" onClick={onClick} />
    : <div className={`${className ?? ''} foto-cargando`} />;
}

/** Botón para tomar o elegir fotos + miniaturas con opción de quitar. */
export function SelectorFotos({ fotos, onChange, max = MAX_FOTOS, texto = '📷 Agregar fotos' }: {
  fotos: string[]; onChange: (f: string[]) => void; max?: number; texto?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  async function elegir(archivos: FileList | null) {
    if (!archivos) return;
    setCargando(true);
    setError('');
    const nuevas: string[] = [];
    try {
      for (const a of Array.from(archivos).slice(0, max - fotos.length)) nuevas.push(await guardarFoto(a));
    } catch (e) {
      setError((e as Error).message);
    }
    onChange([...fotos, ...nuevas]);
    setCargando(false);
    if (input.current) input.current.value = '';
  }

  return (
    <div className="selector-fotos">
      {fotos.map((id) => (
        <div key={id} className="mini">
          <Foto id={id} className="mini-img" />
          <button type="button" aria-label="Quitar foto" onClick={() => { borrarFoto(id); onChange(fotos.filter((f) => f !== id)); }}>✕</button>
        </div>
      ))}
      {fotos.length < max && (
        <button type="button" className="mini agregar" onClick={() => input.current?.click()} disabled={cargando}>
          {cargando ? '⏳' : texto}
        </button>
      )}
      <input ref={input} type="file" accept="image/*" multiple={max > 1} hidden onChange={(e) => elegir(e.target.files)} />
      {error && <small className="error">{error}</small>}
    </div>
  );
}

/** Galería deslizable con visor a pantalla completa. */
export function Galeria({ fotos }: { fotos: string[] }) {
  const [grande, setGrande] = useState<string | null>(null);
  if (fotos.length === 0) return null;
  return (
    <>
      <div className="galeria">
        {fotos.map((id) => <Foto key={id} id={id} className="galeria-img" onClick={() => setGrande(id)} />)}
      </div>
      {grande && (
        <div className="visor" onClick={() => setGrande(null)}>
          <Foto id={grande} className="visor-img" />
        </div>
      )}
    </>
  );
}

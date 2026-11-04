import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Fila horizontal que se puede recorrer con dedo, mouse o teclado:
 * - Flechas ‹ › cuando hay contenido escondido a ese lado (solo en equipos con mouse).
 * - La rueda del mouse desplaza hacia los lados mientras quede contenido por ver.
 * - Difuminado en el borde para indicar que hay más (útil en celular).
 */
export function FilaDesplazable({ className, children, etiqueta }: { className: string; children: ReactNode; etiqueta: string }) {
  const fila = useRef<HTMLDivElement>(null);
  const [izq, setIzq] = useState(false);
  const [der, setDer] = useState(false);

  useEffect(() => {
    const el = fila.current;
    if (!el) return;
    const medir = () => {
      setIzq(el.scrollLeft > 2);
      setDer(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    };
    // Rueda vertical → desplazamiento horizontal, solo si aún queda contenido hacia ese lado
    const rueda = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const puede = e.deltaY > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0;
      if (!puede) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    medir();
    el.addEventListener('scroll', medir, { passive: true });
    el.addEventListener('wheel', rueda, { passive: false });
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => { el.removeEventListener('scroll', medir); el.removeEventListener('wheel', rueda); obs.disconnect(); };
  }, []);

  // Al cambiar el contenido (p. ej. nuevas historias) se vuelve a medir
  useEffect(() => {
    const el = fila.current;
    if (el) { setIzq(el.scrollLeft > 2); setDer(el.scrollLeft + el.clientWidth < el.scrollWidth - 2); }
  });

  const mover = (dir: 1 | -1) => fila.current?.scrollBy({ left: dir * fila.current.clientWidth * 0.7, behavior: 'smooth' });

  return (
    <div className={`fila-desplazable ${izq ? 'hay-izq' : ''} ${der ? 'hay-der' : ''}`}>
      {izq && <button className="flecha-fila izquierda" onClick={() => mover(-1)} aria-label={`Ver ${etiqueta} anteriores`}>‹</button>}
      <div ref={fila} className={className} role="group" aria-label={etiqueta}>{children}</div>
      {der && <button className="flecha-fila derecha" onClick={() => mover(1)} aria-label={`Ver más ${etiqueta}`}>›</button>}
    </div>
  );
}

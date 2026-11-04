import { useRef, useState, type ReactNode } from 'react';

/**
 * Botón que solo se activa si se mantiene presionado `ms` milisegundos.
 * Evita SOS enviados por error (en el bolsillo, un toque accidental).
 */
export function BotonMantener({ ms = 3000, onCompleto, children, className = '', disabled }: {
  ms?: number; onCompleto: () => void; children: ReactNode; className?: string; disabled?: boolean;
}) {
  const [progreso, setProgreso] = useState(0);
  const frame = useRef(0);

  function empezar() {
    if (disabled) return;
    const inicio = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - inicio) / ms);
      setProgreso(p);
      if (p >= 1) {
        navigator.vibrate?.(300);
        setProgreso(0);
        onCompleto();
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }

  function cancelar() {
    cancelAnimationFrame(frame.current);
    setProgreso(0);
  }

  const segundos = Math.ceil((ms * (1 - progreso)) / 1000);
  return (
    <button
      type="button"
      className={`${className} mantener`}
      disabled={disabled}
      style={{ background: `linear-gradient(90deg, #450a0a ${progreso * 100}%, #b91c1c ${progreso * 100}%)` }}
      onPointerDown={empezar}
      onPointerUp={cancelar}
      onPointerLeave={cancelar}
      onPointerCancel={cancelar}
      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); empezar(); } }}
      onKeyUp={cancelar}
      onContextMenu={(e) => e.preventDefault()}
    >
      {progreso > 0 ? `Sigue… ${segundos}` : children}
    </button>
  );
}

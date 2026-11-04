import { useEffect, useRef, useState } from 'react';
import { guardarBlob } from '../fotos';

const VISOR = 260;   // tamaño del recuadro en pantalla
const SALIDA = 400;  // la foto guardada es de 400 × 400 px

/** Recorta la foto de perfil: arrastra para encuadrar y usa el zoom. Devuelve el id de la imagen guardada. */
export function RecortarFoto({ archivo, onListo, onCancelar }: { archivo: File; onListo: (id: string) => void; onCancelar: () => void }) {
  const [url, setUrl] = useState('');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [guardando, setGuardando] = useState(false);
  const arrastre = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // El enlace temporal se crea y se libera en el mismo efecto: así sobrevive al doble montaje
  // de React en desarrollo y no queda memoria colgando al cerrar.
  useEffect(() => {
    const u = URL.createObjectURL(archivo);
    let vivo = true;
    const i = new Image();
    i.onload = () => { if (vivo) { setUrl(u); setImg(i); } };
    i.onerror = () => { if (vivo) setError('No se pudo abrir la imagen. Prueba con una foto JPG o PNG.'); };
    i.src = u;
    return () => { vivo = false; URL.revokeObjectURL(u); };
  }, [archivo]);

  // La imagen siempre cubre todo el recuadro: escala base = lado corto ocupa el visor
  const escala = img ? (VISOR / Math.min(img.width, img.height)) * zoom : 1;
  const ancho = img ? img.width * escala : 0;
  const alto = img ? img.height * escala : 0;
  const limiteX = Math.max(0, (ancho - VISOR) / 2);
  const limiteY = Math.max(0, (alto - VISOR) / 2);
  const x = Math.max(-limiteX, Math.min(limiteX, pos.x));
  const y = Math.max(-limiteY, Math.min(limiteY, pos.y));
  const izquierda = (VISOR - ancho) / 2 + x;
  const arriba = (VISOR - alto) / 2 + y;

  async function guardar() {
    if (!img) return;
    setGuardando(true);
    const canvas = document.createElement('canvas');
    canvas.width = SALIDA;
    canvas.height = SALIDA;
    const k = SALIDA / VISOR;
    canvas.getContext('2d')!.drawImage(img, izquierda * k, arriba * k, ancho * k, alto * k);
    canvas.toBlob(async (b) => {
      if (!b) { setError('No se pudo procesar la foto.'); setGuardando(false); return; }
      onListo(await guardarBlob(b));
    }, 'image/jpeg', 0.85);
  }

  return (
    <div className="modal-fondo encima" onClick={onCancelar}>
      <div className="modal form" onClick={(e) => e.stopPropagation()}>
        <h2>Ajusta tu foto</h2>
        <p className="muted">Arrastra para encuadrar tu cara y usa el zoom.</p>
        {error ? <p className="aviso peligro">{error}</p> : (
          <div
            className="recorte"
            style={{ width: VISOR, height: VISOR }}
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); arrastre.current = { x: e.clientX, y: e.clientY, px: x, py: y }; }}
            onPointerMove={(e) => { const a = arrastre.current; if (a) setPos({ x: a.px + e.clientX - a.x, y: a.py + e.clientY - a.y }); }}
            onPointerUp={() => { arrastre.current = null; }}
            onPointerCancel={() => { arrastre.current = null; }}
          >
            {img && <img src={url} alt="" draggable={false} style={{ width: ancho, height: alto, left: izquierda, top: arriba }} />}
            <div className="mascara-circulo" />
          </div>
        )}
        <label>Zoom
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        </label>
        <button className="btn primary" disabled={!img || guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Usar esta foto'}</button>
        <button className="btn link neutro" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

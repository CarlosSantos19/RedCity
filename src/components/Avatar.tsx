import { fotoVisible, useEstado } from '../store';
import { useFoto } from '../fotos';

/**
 * Foto de perfil de un vecino en círculo, respetando su privacidad:
 * si no puedo verla (o no tiene), se muestra la inicial de su nombre.
 */
export function Avatar({ usuarioId, nombre, tamano = '', className = '' }: {
  usuarioId: string; nombre: string; tamano?: '' | 'chico' | 'grande'; className?: string;
}) {
  const s = useEstado();
  const foto = fotoVisible(s, usuarioId, s.usuario?.id) ? s.cuentas.find((c) => c.id === usuarioId)?.foto : undefined;
  const url = useFoto(foto);
  return (
    <span className={`avatar ${tamano} ${className}`} aria-hidden>
      {url ? <img src={url} alt="" /> : (nombre.trim()[0] ?? '?')}
    </span>
  );
}

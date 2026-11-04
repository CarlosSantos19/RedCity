import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Post, Usuario } from '../types';
import { CATEGORIAS } from './categorias';

interface Props {
  usuario: Usuario;
  posts: Post[];
  onAbrir: (id: string) => void;
}

export function MapView({ usuario, posts, onAbrir }: Props) {
  const zoom = usuario.radioKm <= 0.5 ? 16 : usuario.radioKm <= 1 ? 15 : 14;
  return (
    <div className="mapa">
      <MapContainer key={usuario.radioKm} center={[usuario.lat, usuario.lng]} zoom={zoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Circle center={[usuario.lat, usuario.lng]} radius={usuario.radioKm * 1000} pathOptions={{ color: '#d91e2b', fillOpacity: 0.06 }} />
        <CircleMarker center={[usuario.lat, usuario.lng]} radius={7} pathOptions={{ color: '#fff', fillColor: '#d91e2b', fillOpacity: 1, weight: 3 }}>
          <Tooltip>Tú (aprox.)</Tooltip>
        </CircleMarker>
        {posts.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={p.categoria === 'seguridad' && p.nivel === 'urgente' ? 12 : 9}
            pathOptions={{ color: '#fff', weight: 2, fillColor: CATEGORIAS[p.categoria].color, fillOpacity: 0.9 }}
            eventHandlers={{ click: () => onAbrir(p.id) }}
          >
            <Tooltip>{CATEGORIAS[p.categoria].icono} {p.titulo}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

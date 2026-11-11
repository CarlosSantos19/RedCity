import { distanciaKm } from './geo';

/**
 * Directorio "Cerca de mí": lugares reales del mapa abierto OpenStreetMap (datos © colaboradores de OSM, licencia ODbL).
 * Los lugares se extraen una vez con scripts/extraer-lugares.py y se publican con la app en public/lugares/,
 * repartidos en celdas de 0,05° (~5,5 km). Así la búsqueda es inmediata y la ubicación del vecino no sale a terceros.
 * El orden de CATEGORIAS_LUGAR debe ser el mismo del script (cada fila guarda el índice de su categoría).
 */

export interface CategoriaLugar {
  nombre: string;
  /** Singular para "Panadería sin nombre" */
  singular: string;
  icono: string;
  /** Filtros de Overpass (clave=valor de OSM) */
  filtros: string[];
  /** Palabras con las que alguien lo busca en el buscador del barrio */
  palabras: string[];
}

export const CATEGORIAS_LUGAR = {
  panaderia: { nombre: 'Panaderías', singular: 'Panadería', icono: '🥖', filtros: ['shop=bakery', 'shop=pastry'], palabras: ['panader', 'pan ', 'pasteler'] },
  tienda: { nombre: 'Tiendas y mercados', singular: 'Tienda', icono: '🛒', filtros: ['shop=convenience', 'shop=supermarket', 'shop=greengrocer', 'shop=butcher'], palabras: ['tienda', 'mercado', 'supermercado', 'fruver', 'carnicer', 'minimercado'] },
  drogueria: { nombre: 'Droguerías', singular: 'Droguería', icono: '💊', filtros: ['amenity=pharmacy', 'shop=chemist'], palabras: ['droguer', 'farmacia', 'medicamento'] },
  restaurante: { nombre: 'Restaurantes y cafés', singular: 'Restaurante', icono: '🍽️', filtros: ['amenity=restaurant', 'amenity=fast_food', 'amenity=cafe'], palabras: ['restaurante', 'comida', 'almuerzo', 'cafe', 'café', 'corrientazo'] },
  ferreteria: { nombre: 'Ferreterías', singular: 'Ferretería', icono: '🔧', filtros: ['shop=hardware', 'shop=doityourself', 'shop=paint'], palabras: ['ferreter', 'pintura', 'tornill'] },
  belleza: { nombre: 'Peluquerías', singular: 'Peluquería', icono: '💇', filtros: ['shop=hairdresser', 'shop=beauty', 'shop=barber'], palabras: ['peluquer', 'barber', 'salón de belleza', 'uñas', 'manicure'] },
  mascotas: { nombre: 'Veterinarias', singular: 'Veterinaria', icono: '🐾', filtros: ['amenity=veterinary', 'shop=pet'], palabras: ['veterinar', 'mascota', 'perro', 'gato'] },
  salud: { nombre: 'Salud', singular: 'Centro de salud', icono: '🏥', filtros: ['amenity=clinic', 'amenity=hospital', 'amenity=doctors', 'amenity=dentist'], palabras: ['hospital', 'clínica', 'clinica', 'médico', 'medico', 'odontolog', 'dentista', 'eps'] },
  taller: { nombre: 'Talleres', singular: 'Taller', icono: '🚗', filtros: ['shop=car_repair', 'shop=bicycle', 'shop=motorcycle', 'shop=tyres'], palabras: ['taller', 'mecánic', 'mecanic', 'bicicleta', 'llanta', 'moto'] },
  banco: { nombre: 'Cajeros y bancos', singular: 'Cajero', icono: '🏧', filtros: ['amenity=atm', 'amenity=bank'], palabras: ['cajero', 'banco'] },
  papeleria: { nombre: 'Papelerías', singular: 'Papelería', icono: '📎', filtros: ['shop=stationery', 'shop=copyshop'], palabras: ['papeler', 'fotocopia', 'impresi'] },
  gasolina: { nombre: 'Gasolineras', singular: 'Gasolinera', icono: '⛽', filtros: ['amenity=fuel'], palabras: ['gasolin', 'bomba', 'combustible'] },
} satisfies Record<string, CategoriaLugar>;

export type CategoriaLugarId = keyof typeof CATEGORIAS_LUGAR;

export interface Lugar {
  id: string;
  nombre: string;
  /** true si OSM no tiene nombre (se muestra "Panadería sin nombre") */
  sinNombre: boolean;
  lat: number;
  lng: number;
  distanciaKm: number;
  direccion?: string;
  horario?: string;
  telefono?: string;
  web?: string;
}

/** Categoría que corresponde a lo que alguien escribió en el buscador ("panadería" → panaderias). */
export function categoriaDeBusqueda(texto: string): CategoriaLugarId | null {
  const t = ` ${texto.toLowerCase().trim()} `;
  if (t.trim().length < 3) return null;
  for (const [id, c] of Object.entries(CATEGORIAS_LUGAR) as [CategoriaLugarId, CategoriaLugar][]) {
    if (c.palabras.some((p) => t.includes(p))) return id;
  }
  return null;
}

const CELDA = 0.05;
/** Fila de public/lugares/<i>_<j>.json: [categoría, lat, lng, nombre, dirección?, horario?, teléfono?, web?] */
type Fila = [number, number, number, string, string?, string?, string?, string?];
const celdas = new Map<string, Promise<Fila[]>>();

function celda(i: number, j: number): Promise<Fila[]> {
  const clave = `${i}_${j}`;
  let p = celdas.get(clave);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}lugares/${clave}.json`).then((r) => {
      if (r.status === 404) return [];  // zona sin lugares en el mapa
      if (!r.ok) throw new Error(`lugares ${r.status}`);
      return r.json() as Promise<Fila[]>;
    });
    p.catch(() => celdas.delete(clave));
    celdas.set(clave, p);
  }
  return p;
}

const IDS = Object.keys(CATEGORIAS_LUGAR) as CategoriaLugarId[];

/** Lugares de una categoría alrededor del vecino, ordenados por distancia. */
export async function buscarLugares(id: CategoriaLugarId, lat: number, lng: number, radioKm: number): Promise<Lugar[]> {
  const cat: CategoriaLugar = CATEGORIAS_LUGAR[id];
  const indice = IDS.indexOf(id);
  // Celdas que toca el círculo (1° de latitud ≈ 111 km)
  const dLat = radioKm / 111;
  const dLng = radioKm / (111 * Math.cos((lat * Math.PI) / 180));
  const pedidos: Promise<Fila[]>[] = [];
  for (let i = Math.floor((lat - dLat) / CELDA); i <= Math.floor((lat + dLat) / CELDA); i++) {
    for (let j = Math.floor((lng - dLng) / CELDA); j <= Math.floor((lng + dLng) / CELDA); j++) pedidos.push(celda(i, j));
  }
  const filas = (await Promise.all(pedidos)).flat();
  return filas
    .filter((f) => f[0] === indice)
    .map(([, la, lo, crudo, direccion, horario, telefono, web]) => {
      // Algunos lugares del mapa tienen de nombre solo signos ("???")
      const nombre = /[\p{L}\p{N}]/u.test(crudo) ? crudo : '';
      return {
        id: `${la},${lo},${crudo}`,
        nombre: nombre || `${cat.singular} sin nombre`,
        sinNombre: !nombre,
        lat: la, lng: lo,
        direccion: direccion || undefined,
        horario: horario || undefined,
        telefono: telefono || undefined,
        web: web || undefined,
        distanciaKm: distanciaKm(lat, lng, la, lo),
      };
    })
    .filter((l) => l.distanciaKm <= radioKm)
    // Primero los que tienen nombre; dentro de cada grupo, el más cercano
    .sort((a, b) => Number(a.sinNombre) - Number(b.sinNombre) || a.distanciaKm - b.distanciaKm);
}

/** Traduce lo más común del formato de horarios de OSM ("Mo-Fr 08:00-19:00; Sa 09:00-13:00"). */
export function horarioLegible(h: string): string {
  const dias: Record<string, string> = { Mo: 'Lun', Tu: 'Mar', We: 'Mié', Th: 'Jue', Fr: 'Vie', Sa: 'Sáb', Su: 'Dom', PH: 'Festivos' };
  if (h.trim() === '24/7') return 'Abierto 24 horas';
  return h.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => dias[d]).replace(/\boff\b/g, 'cerrado').replace(/;\s*/g, ' · ');
}

export const comoLlegar = (l: Lugar) => `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`;

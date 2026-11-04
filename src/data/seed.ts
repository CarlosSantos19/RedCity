import type { Barrio, Calificacion, Empresa, Historia, MiembroRed, Nota, Post, Red } from '../types';
import { difuminar } from '../geo';
import { aleatorioHex } from '../auth';

export const generarCodigo = () => aleatorioHex(3).toUpperCase();

export const DIA_MS = 24 * 3600_000;

/** Negocios de ejemplo: los que ya publican en cada barrio. */
export const EMPRESAS_DEMO = [
  {
    clave: 'panaderia', autor: 'Panadería La Esquina', rubro: 'panaderia', horario: 'Lun a sáb 6 a. m. – 8 p. m. · Dom 7 a. m. – 1 p. m.',
    descripcion: 'Pan artesanal horneado tres veces al día. Almojábanas, pandebono y tortas por encargo para cumpleaños.',
    telefono: '3001234567', redes: { whatsapp: 'https://wa.me/573001234567', facebook: 'https://www.facebook.com/panaderialaesquina', instagram: 'https://www.instagram.com/panaderialaesquina' },
  },
  {
    clave: 'ferreteria', autor: 'Ferretería El Tornillo', rubro: 'ferreteria', horario: 'Lun a sáb 7 a. m. – 7 p. m.',
    descripcion: 'Todo para tu casa: pinturas, tubería, eléctricos, herramienta y cerrajería. Domicilio gratis en el barrio.',
    telefono: '3109876543', redes: { whatsapp: 'https://wa.me/573109876543', facebook: 'https://www.facebook.com/ferreteriaeltornillo', web: 'https://www.ferreteriaeltornillo.com/' },
  },
];

export const idEmpresaDemo = (clave: string, barrioId: string) => `emp-${clave}-${barrioId}`;

export function empresasSemilla(barrios: Barrio[]): Empresa[] {
  return barrios.flatMap((b) => EMPRESAS_DEMO.map((e): Empresa => ({
    id: idEmpresaDemo(e.clave, b.id), duenoId: 'seed-' + e.autor, nombre: e.autor, rubro: e.rubro, descripcion: e.descripcion,
    barrioId: b.id, ...difuminar(b.lat, b.lng, 400), direccion: `Calle principal de ${b.nombre}`, telefono: e.telefono,
    horario: e.horario, redes: e.redes, nit: '900123456-7', verificacion: 'verificada',
    seguidores: ['seed-1', 'seed-2', 'seed-3', 'seed-4'].slice(0, 2 + (b.nombre.length % 3)), creado: Date.now() - 90 * DIA_MS,
  })));
}

/** Liga las publicaciones de ejemplo de esos negocios a su página. */
export function vincularPostsDemo<T extends { autor: string; barrioId: string; empresaId?: string }>(posts: T[]): T[] {
  return posts.map((p) => {
    const e = EMPRESAS_DEMO.find((x) => x.autor === p.autor);
    return e && !p.empresaId ? { ...p, empresaId: idEmpresaDemo(e.clave, p.barrioId) } : p;
  });
}

/** Próximo sábado de 8 a. m. a 2 p. m. (hoy, si es sábado y aún no termina). */
function proximoSabado(): { inicio: string; fin: string } {
  const d = new Date();
  const faltan = (6 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + (faltan === 0 && d.getHours() >= 14 ? 7 : faltan));
  const f = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { inicio: `${f}T08:00`, fin: `${f}T14:00` };
}

/** Una venta de garaje de ejemplo por barrio. */
export function garajeSemilla(barrios: Barrio[]): Post[] {
  const { inicio, fin } = proximoSabado();
  return barrios.map((b): Post => {
    const art = (nombre: string, precio: number, estado: 'disponible' | 'apartado' | 'vendido' = 'disponible') =>
      ({ id: id(), nombre, precio, estado, ...(estado === 'apartado' ? { apartadoPorId: 'seed-Paula S.', apartadoPor: 'Paula S.' } : {}) });
    return {
      id: id(), categoria: 'garaje', autorId: 'seed-Familia Gómez', autor: 'Familia Gómez', autorVerificado: true, barrioId: b.id,
      creado: Date.now() - 10 * H, respuestas: [], ...difuminar(b.lat, b.lng, 500),
      titulo: 'Venta de garaje por mudanza: ¡todo debe irse!',
      descripcion: 'Nos vamos del barrio y vendemos muebles, electrodomésticos, ropa y juguetes en buen estado. Se aceptan ofertas.',
      inicio, fin, direccion: `Calle principal de ${b.nombre}, casa esquinera de reja verde`,
      mediosPago: ['Efectivo', 'Nequi'], asistentes: ['seed-1', 'seed-2', 'seed-3'],
      articulos: [
        art('Sofá de 3 puestos', 250000),
        art('Bicicleta rin 26', 180000),
        art('Licuadora', 40000, 'apartado'),
        art('Juego de ollas', 60000),
        art('Ropa de niño (talla 6-8), por prenda', 10000),
        art('Libros variados, cada uno', 5000),
        art('Lámpara de mesa', 25000, 'vendido'),
      ],
    };
  });
}
export const FONDOS_HISTORIA = ['#d91e2b', '#7c3aed', '#0f766e', '#d97706', '#0284c7', '#15803d', '#0f172a'];

/** Historias de texto de ejemplo (duran 24 h desde que se crean). */
export function historiasSemilla(barrios: Barrio[]): Historia[] {
  const ahora = Date.now();
  return barrios.flatMap((b) => {
    const h = (autor: string, texto: string, fondo: string, horas: number): Historia => ({
      id: id(), autorId: 'seed-' + autor, autor, barrioId: b.id, ...difuminar(b.lat, b.lng, 400),
      texto, fondo, creado: ahora - horas * H, expira: ahora - horas * H + DIA_MS, vistas: [],
    });
    return [
      h('Panadería La Esquina', '🥖 ¡Pan caliente recién salido del horno! Hasta las 7 p. m.', FONDOS_HISTORIA[3], 1),
      h('Junta de Acción Comunal', `🌱 Este sábado: jornada de siembra en el parque de ${b.nombre}. ¡Los esperamos!`, FONDOS_HISTORIA[5], 4),
      h('Junta de Acción Comunal', '📢 Reunión de vecinos el jueves 7 p. m. en el salón comunal.', FONDOS_HISTORIA[4], 3),
    ];
  });
}

/** Notas de ejemplo que aparecen sobre la foto de los vecinos. */
export function notasSemilla(barrios: Barrio[]): Nota[] {
  const ahora = Date.now();
  return barrios.flatMap((b) => {
    const n = (autor: string, texto: string, horas: number): Nota => ({
      id: id(), autorId: 'seed-' + autor, autor, barrioId: b.id, ...difuminar(b.lat, b.lng, 400),
      texto, creado: ahora - horas * H, expira: ahora - horas * H + DIA_MS,
    });
    return [n('Marta R.', '¿Alguien me presta una escalera? 🪜', 2), n('Andrés G.', 'Hoy partido en el parque ⚽ 5 p. m.', 5)];
  });
}

/** Reseñas de ejemplo para los proveedores de muestra (en la app real solo existen tras un pago). */
export function calificacionesSemilla(): Calificacion[] {
  const r = (para: string, de: string, estrellas: number, comentario: string, dias: number): Calificacion => ({
    id: id(), pagoId: 'seed-pago-' + id(), deId: 'seed-' + de, deNombre: de, paraId: 'seed-' + para,
    estrellas, comentario, creado: Date.now() - dias * 24 * H,
  });
  return [
    r('Jhon el Plomero', 'Marta R.', 5, 'Llegó en 10 minutos y arregló la fuga del lavaplatos. Muy honesto con el precio.', 3),
    r('Jhon el Plomero', 'Carlos M.', 5, 'Destapó el sanitario sin hacer reguero. Lo recomiendo.', 12),
    r('Jhon el Plomero', 'Paula S.', 4, 'Buen trabajo, se demoró un poco más de lo acordado.', 30),
    r('Contadora Liliana R.', 'Andrés G.', 5, 'Me explicó todo con paciencia y me ahorró una multa de la DIAN.', 20),
    r('Contadora Liliana R.', 'Luisa P.', 5, 'Súper profesional y puntual.', 45),
    r('Confecciones Mary', 'Andrés G.', 4, 'Cumplieron la entrega de 300 camisetas a tiempo.', 60),
    r('Ferretería El Tornillo', 'Don Hernando', 5, 'El domicilio llegó rapidísimo.', 8),
  ];
}

/** Redes de ejemplo: una de seguridad y una de apoyo por barrio. */
export function redesSemilla(barrios: Barrio[]): Red[] {
  const ahora = Date.now();
  const m = (nombre: string, rol: MiembroRed['rol'] = 'miembro'): MiembroRed =>
    ({ usuarioId: 'seed-' + nombre, nombre, rol, unido: ahora - 30 * 24 * H });
  return barrios.flatMap((b): Red[] => [
    {
      id: `red-seg-${b.id}`, tipo: 'seguridad', nombre: `Seguridad ${b.nombre}: cuadra principal`,
      descripcion: 'Vecinos de la cuadra que nos cuidamos entre todos. Usen el SOS solo en emergencias reales y SIEMPRE llamen primero al 123.',
      barrioId: b.id, privada: false, codigo: generarCodigo(), creadorId: 'seed-Junta de Acción Comunal', creado: ahora - 60 * 24 * H,
      miembros: [m('Junta de Acción Comunal', 'coordinador'), m('Marta R.'), m('Carlos M.'), m('Luisa P.'), m('Don Hernando')],
      mensajes: [
        { id: id(), autorId: 'seed-Junta de Acción Comunal', autor: 'Junta de Acción Comunal', tipo: 'mensaje', creado: ahora - 48 * H, respuestas: [],
          texto: 'Bienvenidos a la red. Recuerden: en emergencia, primero el 123 y después el SOS para que los vecinos estemos pendientes.' },
        { id: id(), autorId: 'seed-Carlos M.', autor: 'Carlos M.', tipo: 'mensaje', creado: ahora - 6 * H, respuestas: [],
          texto: 'Ojo que el poste de la esquina del parque sigue sin luz. Ya lo reporté otra vez.' },
        { id: id(), autorId: 'seed-Luisa P.', autor: 'Luisa P.', tipo: 'llegue-bien', creado: ahora - 3 * H, respuestas: [], texto: 'Llegué bien a casa ✅' },
      ],
    },
    {
      id: `red-apoyo-${b.id}`, tipo: 'apoyo', nombre: `Apoyo a adultos mayores de ${b.nombre}`,
      descripcion: 'Acompañamos a nuestros vecinos mayores: mercado, citas médicas, trámites o simplemente una visita para conversar.',
      barrioId: b.id, privada: false, codigo: generarCodigo(), creadorId: 'seed-Luisa P.', creado: ahora - 40 * 24 * H,
      miembros: [m('Luisa P.', 'coordinador'), m('Don Hernando'), m('Andrés G.'), m('Paula S.')],
      mensajes: [
        { id: id(), autorId: 'seed-Don Hernando', autor: 'Don Hernando', tipo: 'ayuda', creado: ahora - 5 * H,
          texto: '¿Alguien me puede acompañar el viernes a la cita en la EPS a las 9 a. m.? Me queda difícil ir solo.',
          respuestas: [{ usuarioId: 'seed-Andrés G.', nombre: 'Andrés G.', accion: 'ayudo', creado: ahora - 4 * H }] },
      ],
    },
  ]);
}

const H = 3600_000;
const id = () => Math.random().toString(36).slice(2, 10);

function enDias(d: number, hora = '17:00') {
  const f = new Date(Date.now() + d * 24 * H);
  return `${f.toISOString().slice(0, 10)}T${hora}`;
}

/** Publicaciones de ejemplo alrededor de cada barrio para que el demo no se vea vacío. */
export function postsSemilla(barrios: Barrio[]): Post[] {
  const posts: Post[] = [];
  for (const b of barrios) {
    const p = () => difuminar(b.lat, b.lng, 600);
    const base = (autor: string, horas: number) => ({
      id: id(), autorId: 'seed-' + autor, autor, autorVerificado: true, barrioId: b.id,
      creado: Date.now() - horas * H, respuestas: [], ...p(),
    });
    const servicio = { categoria: 'servicio' as const, estado: 'abierta' as const, postulaciones: [], realizados: 0, dia: '' };
    posts.push(
      {
        ...base('Doña Carmen', 1), ...servicio, modo: 'necesito', rubro: 'servicios-generales',
        titulo: 'Se necesita servicios generales para aseo de casa',
        descripcion: 'Casa de 3 habitaciones. Todos los jueves de 8 a. m. a 4 p. m. Preferiblemente con referencias del barrio.',
        valor: 100000, unidad: 'por día', frecuencia: 'semanal', dia: 'Jueves',
      },
      {
        ...base('Paula S.', 2), ...servicio, modo: 'necesito', rubro: 'cuidado-mascotas',
        titulo: 'Paseador para mi perro (golden, muy juicioso)',
        descripcion: 'Una hora diaria al mediodía, de lunes a viernes.',
        valor: 15000, unidad: 'por hora', frecuencia: 'semanal', dia: 'Lunes a viernes',
      },
      {
        ...base('Jhon el Plomero', 8), ...servicio, modo: 'ofrezco', rubro: 'plomeria',
        titulo: 'Plomería y destapes, llego en 15 minutos',
        descripcion: 'Arreglo fugas, cambio grifería, destapo sifones y sanitarios. Vivo en el barrio.',
        valor: 60000, unidad: 'por visita', frecuencia: 'una-vez',
      },
      {
        ...base('Contadora Liliana R.', 40), ...servicio, modo: 'ofrezco', rubro: 'contador',
        titulo: 'Declaración de renta para personas naturales',
        descripcion: 'Contadora pública con tarjeta profesional. Reviso tu caso sin costo antes de empezar.',
        valor: 150000, unidad: 'por servicio', frecuencia: 'una-vez',
      },
      {
        ...base('Ferretería El Tornillo', 12), ...servicio, modo: 'ofrezco', rubro: 'ferreteria',
        titulo: 'Ferretería con domicilio gratis en el barrio',
        descripcion: 'Pinturas, tubería, eléctricos y herramienta. Pide por la app y te llevamos.',
        valor: 0, unidad: 'por servicio', frecuencia: 'una-vez',
      },
      {
        ...base('Confecciones Mary', 60), ...servicio, modo: 'ofrezco', rubro: 'satelite',
        titulo: 'Satélite de confección: 500 prendas por semana',
        descripcion: 'Taller con 6 máquinas planas y fileteadora. Trabajamos para marcas y emprendimientos.',
        valor: 0, unidad: 'por servicio', frecuencia: 'una-vez',
      },
      {
        ...base('Marta R.', 0.5), categoria: 'seguridad', nivel: 'precaucion',
        titulo: 'Moto sin placa rondando la cuadra',
        descripcion: `Dos personas en moto negra sin placa dando vueltas por ${b.nombre} desde hace 20 min. Ya avisé al cuadrante. Estén pendientes.`,
        confirmaciones: ['seed-1', 'seed-2'],
      },
      {
        ...base('Andrés G.', 3), categoria: 'trueque', estado: 'disponible',
        titulo: 'Cambio bicicleta infantil rin 16',
        descripcion: 'En buen estado, mi hijo ya creció. Se puede ver acá cerca.',
        ofrece: 'Bicicleta infantil rin 16', busca: 'Libros escolares de 5.º o patines talla 34',
      },
      {
        ...base('Panadería La Esquina', 5), categoria: 'oferta',
        titulo: '2x1 en pan aliñado después de las 6 p. m.',
        descripcion: 'Solo para vecinos: muestren la app en caja.',
        negocio: 'Panadería La Esquina', precio: '2x1', vence: enDias(7).slice(0, 10),
      },
      {
        ...base('Junta de Acción Comunal', 20), categoria: 'evento',
        titulo: 'Jornada de siembra en el parque',
        descripcion: 'Traigan guantes y agua. La JAC pone las plántulas. ¡Niños bienvenidos!',
        fecha: enDias(3, '09:00'), lugar: `Parque principal de ${b.nombre}`, asistentes: ['seed-3', 'seed-4', 'seed-5'],
      },
      {
        ...base('Luisa P.', 30), categoria: 'trueque', estado: 'disponible',
        titulo: 'Ofrezco clases de inglés por arreglos de costura',
        descripcion: 'Soy profesora, puedo dar 2 horas semanales.',
        ofrece: 'Clases de inglés (2 h/semana)', busca: 'Arreglos de ropa / costura',
      },
      {
        ...base('Carlos M.', 50), categoria: 'seguridad', nivel: 'info',
        titulo: 'Poste de luz dañado en la esquina del parque',
        descripcion: 'Ya se reportó a la empresa de energía. Mientras tanto, eviten pasar solos de noche.',
        confirmaciones: ['seed-6'],
      },
    );
  }
  return posts;
}

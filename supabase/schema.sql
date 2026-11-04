-- =====================================================================
-- RedCity · Esquema de producción (Supabase / PostgreSQL + PostGIS)
-- Fase 1: Bogotá. El campo `ciudad` permite expandir sin migraciones.
-- =====================================================================
create extension if not exists postgis;

-- ---------- Barrios (polígonos oficiales IDECA) ----------
create table barrios (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  localidad   text not null,
  ciudad      text not null default 'Bogotá',
  limite      geography(MultiPolygon, 4326),       -- polígono del barrio
  centro      geography(Point, 4326) not null,
  creado_por_vecinos boolean not null default false, -- barrios propuestos por usuarios, pendientes de revisión
  unique (ciudad, localidad, nombre)
);
create index barrios_limite_idx on barrios using gist (limite);

-- ---------- Perfiles (1:1 con auth.users) ----------
create table perfiles (
  id           uuid primary key references auth.users on delete cascade,
  nombre       text not null check (char_length(nombre) between 2 and 40),
  barrio_id    uuid not null references barrios,
  ubicacion    geography(Point, 4326) not null,    -- PRIVADA: nunca se expone a otros usuarios
  radio_m      int not null default 1000 check (radio_m between 200 and 3000),
  verificado   boolean not null default false,     -- GPS dentro del barrio (+ en fase 2: recibo de servicios / vecino que avala)
  habeas_data_aceptado_en timestamptz not null,    -- Ley 1581 de 2012
  creado_en    timestamptz not null default now()
);

-- ---------- Publicaciones ----------
create type categoria as enum ('servicio', 'trueque', 'seguridad', 'oferta', 'evento');
create type nivel_alerta as enum ('info', 'precaucion', 'urgente');

create table publicaciones (
  id          uuid primary key default gen_random_uuid(),
  autor_id    uuid not null references perfiles on delete cascade,
  barrio_id   uuid not null references barrios,
  categoria   categoria not null,
  titulo      text not null check (char_length(titulo) between 4 and 80),
  descripcion text not null default '' check (char_length(descripcion) <= 500),
  ubicacion   geography(Point, 4326) not null,     -- ya difuminada ±150 m en el cliente/servidor
  -- Campos por categoría (jsonb validado por check):
  --   servicio:  {modo: necesito|ofrezco, rubro, valor_cop, unidad, frecuencia, dia, estado}
  --   trueque:   {ofrece, busca, estado}
  --   seguridad: {nivel}
  --   oferta:    {negocio, precio, vence}
  --   evento:    {fecha, lugar}
  datos       jsonb not null default '{}',
  oculta      boolean not null default false,      -- moderación
  creado_en   timestamptz not null default now(),
  expira_en   timestamptz                           -- ofertas/eventos/alertas caducan solas
);
create index publicaciones_ubicacion_idx on publicaciones using gist (ubicacion);
create index publicaciones_creado_idx on publicaciones (creado_en desc);

create table respuestas (
  id          uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references publicaciones on delete cascade,
  autor_id    uuid not null references perfiles on delete cascade,
  texto       text not null check (char_length(texto) between 1 and 500),
  creado_en   timestamptz not null default now()
);

-- Confirmaciones de alertas y asistencia a eventos (una por vecino)
create table reacciones (
  publicacion_id uuid references publicaciones on delete cascade,
  perfil_id      uuid references perfiles on delete cascade,
  tipo           text not null check (tipo in ('confirma', 'asiste')),
  primary key (publicacion_id, perfil_id, tipo)
);

create table reportes (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references publicaciones on delete cascade,
  reportado_por  uuid not null references perfiles,
  motivo         text not null,
  creado_en      timestamptz not null default now(),
  unique (publicacion_id, reportado_por)
);

-- Auto-ocultar con 3 reportes de vecinos distintos (hasta revisión humana)
create or replace function auto_ocultar() returns trigger language plpgsql as $$
begin
  if (select count(*) from reportes where publicacion_id = new.publicacion_id) >= 3 then
    update publicaciones set oculta = true where id = new.publicacion_id;
  end if;
  return new;
end $$;
create trigger reportes_auto_ocultar after insert on reportes for each row execute function auto_ocultar();

-- ---------- Servicios: propuestas, pagos y comisión ----------
create table configuracion (
  clave text primary key,
  valor numeric not null
);
insert into configuracion values ('comision_servicios', 0.02);  -- 2 % para la plataforma

create table postulaciones (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references publicaciones on delete cascade,
  proveedor_id   uuid not null references perfiles on delete cascade,
  precio_cop     bigint not null check (precio_cop > 0),
  mensaje        text not null default '' check (char_length(mensaje) <= 500),
  estado         text not null default 'enviada' check (estado in ('enviada', 'aceptada', 'rechazada')),
  creado_en      timestamptz not null default now(),
  unique (publicacion_id, proveedor_id)
);

-- Cada cobro de un servicio (los recurrentes generan un pago por ocurrencia).
-- El dinero queda retenido EN LA PASARELA hasta que el cliente confirma; la plataforma
-- nunca custodia fondos en cuentas propias.
create table pagos (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references publicaciones,
  postulacion_id uuid not null references postulaciones,
  cliente_id     uuid not null references perfiles,
  proveedor_id   uuid not null references perfiles,
  valor_cop      bigint not null check (valor_cop > 0),
  comision_pct   numeric(5,4) not null,                      -- se copia de `configuracion` al crear el pago
  comision_cop   bigint generated always as (round(valor_cop * comision_pct)) stored,
  neto_proveedor_cop bigint generated always as (valor_cop - round(valor_cop * comision_pct)) stored,
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente', 'retenido', 'liberado', 'reembolsado', 'en_disputa')),
  pasarela       text,                                       -- 'wompi', 'mercadopago', …
  referencia_pasarela text unique,
  creado_en      timestamptz not null default now(),
  liberado_en    timestamptz
);
create index pagos_proveedor_idx on pagos (proveedor_id, estado);

-- Calificaciones después de un servicio completado (construyen reputación en el barrio)
create table calificaciones (
  pago_id      uuid primary key references pagos,
  de_id        uuid not null references perfiles,
  para_id      uuid not null references perfiles,
  estrellas    int not null check (estrellas between 1 and 5),
  comentario   text check (char_length(comentario) <= 300),
  creado_en    timestamptz not null default now()
);

-- ---------- Feed cercano SIN algoritmo ----------
-- Solo radio + orden cronológico; las alertas urgentes de las últimas 24 h van primero.
create or replace function feed_cercano(p_categoria categoria default null, p_limite int default 50)
returns table (
  id uuid, categoria categoria, titulo text, descripcion text, datos jsonb,
  autor text, autor_verificado boolean, barrio text,
  lat double precision, lng double precision, distancia_m double precision, creado_en timestamptz
) language sql stable security definer set search_path = public as $$
  with yo as (select ubicacion, radio_m from perfiles where id = auth.uid())
  select p.id, p.categoria, p.titulo, p.descripcion, p.datos,
         pf.nombre, pf.verificado, b.nombre,
         st_y(p.ubicacion::geometry), st_x(p.ubicacion::geometry),
         st_distance(p.ubicacion, yo.ubicacion), p.creado_en
  from publicaciones p
  join perfiles pf on pf.id = p.autor_id
  join barrios b on b.id = p.barrio_id
  cross join yo
  where not p.oculta
    and (p.expira_en is null or p.expira_en > now())
    and st_dwithin(p.ubicacion, yo.ubicacion, yo.radio_m)
    and (p_categoria is null or p.categoria = p_categoria)
  order by (p.categoria = 'seguridad' and p.datos->>'nivel' = 'urgente' and p.creado_en > now() - interval '24 hours') desc,
           p.creado_en desc
  limit p_limite;
$$;

-- ---------- Seguridad (Row Level Security) ----------
alter table perfiles      enable row level security;
alter table publicaciones enable row level security;
alter table respuestas    enable row level security;
alter table reacciones    enable row level security;
alter table reportes      enable row level security;
alter table barrios       enable row level security;
alter table postulaciones enable row level security;
alter table pagos         enable row level security;
alter table calificaciones enable row level security;
alter table configuracion enable row level security;

create policy "leer configuracion" on configuracion for select using (true);

-- El proveedor ve su propuesta; el dueño de la publicación ve todas las de su necesidad
create policy "postularse" on postulaciones for insert with check (proveedor_id = auth.uid());
create policy "ver postulaciones" on postulaciones for select using (
  proveedor_id = auth.uid()
  or exists (select 1 from publicaciones p where p.id = publicacion_id and p.autor_id = auth.uid())
);

-- Los pagos solo los crea/actualiza el backend (webhook de la pasarela, con service_role).
-- Cliente y proveedor pueden consultarlos.
create policy "ver mis pagos" on pagos for select using (auth.uid() in (cliente_id, proveedor_id));

create policy "calificar" on calificaciones for insert with check (
  de_id = auth.uid()
  and exists (select 1 from pagos pg where pg.id = pago_id and pg.estado = 'liberado' and auth.uid() in (pg.cliente_id, pg.proveedor_id))
);
create policy "ver calificaciones" on calificaciones for select using (true);

create policy "barrios visibles" on barrios for select using (true);

-- Cada quien ve y edita solo su perfil (la ubicación nunca sale de aquí; el feed usa la función de arriba)
create policy "perfil propio" on perfiles for all using (id = auth.uid()) with check (id = auth.uid());

-- Publicaciones: lectura vía feed_cercano(); el autor gestiona las suyas
create policy "publicar propio" on publicaciones for insert with check (autor_id = auth.uid());
create policy "editar propio"   on publicaciones for update using (autor_id = auth.uid());
create policy "borrar propio"   on publicaciones for delete using (autor_id = auth.uid());

create policy "responder" on respuestas for insert with check (autor_id = auth.uid());
create policy "leer respuestas" on respuestas for select using (true);
create policy "reaccionar" on reacciones for all using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());
create policy "reportar" on reportes for insert with check (reportado_por = auth.uid());

-- =====================================================================
-- Redes de seguridad y de apoyo
-- =====================================================================
create type tipo_red as enum ('seguridad', 'apoyo');
create type tipo_mensaje_red as enum ('mensaje', 'llegue-bien', 'sos', 'ayuda');

create table redes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (char_length(nombre) between 4 and 60),
  tipo        tipo_red not null,
  descripcion text not null default '' check (char_length(descripcion) <= 400),
  barrio_id   uuid not null references barrios,
  privada     boolean not null default true,
  codigo      text not null unique default upper(substr(md5(random()::text), 1, 6)),
  creado_por  uuid not null references perfiles,
  creado_en   timestamptz not null default now()
);

create table miembros_red (
  red_id     uuid references redes on delete cascade,
  perfil_id  uuid references perfiles on delete cascade,
  rol        text not null default 'miembro' check (rol in ('coordinador', 'miembro')),
  unido_en   timestamptz not null default now(),
  primary key (red_id, perfil_id)
);

create table mensajes_red (
  id         uuid primary key default gen_random_uuid(),
  red_id     uuid not null references redes on delete cascade,
  autor_id   uuid not null references perfiles on delete cascade,
  tipo       tipo_mensaje_red not null default 'mensaje',
  texto      text not null check (char_length(texto) <= 500),
  ubicacion  geography(Point, 4326),        -- solo en SOS, compartida voluntariamente con la red
  resuelta   boolean not null default false,
  creado_en  timestamptz not null default now()
);
create index mensajes_red_idx on mensajes_red (red_id, creado_en desc);

create table respuestas_alerta (
  mensaje_id uuid references mensajes_red on delete cascade,
  perfil_id  uuid references perfiles on delete cascade,
  accion     text not null check (accion in ('voy', 'llame-123', 'ayudo')),
  creado_en  timestamptz not null default now(),
  primary key (mensaje_id, perfil_id, accion)
);

create or replace function es_miembro(p_red uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros_red where red_id = p_red and perfil_id = auth.uid());
$$;

alter table redes             enable row level security;
alter table miembros_red      enable row level security;
alter table mensajes_red      enable row level security;
alter table respuestas_alerta enable row level security;

-- Las redes públicas se pueden descubrir; las privadas solo las ven sus miembros
-- (unirse con código se hace por una función RPC que valida el código).
create policy "ver redes" on redes for select using (not privada or es_miembro(id));
create policy "crear red" on redes for insert with check (creado_por = auth.uid());
create policy "ver miembros" on miembros_red for select using (es_miembro(red_id));
create policy "salir de red" on miembros_red for delete using (perfil_id = auth.uid());
-- Mensajes, SOS y su ubicación: SOLO miembros de la red
create policy "leer mensajes" on mensajes_red for select using (es_miembro(red_id));
create policy "escribir mensajes" on mensajes_red for insert with check (autor_id = auth.uid() and es_miembro(red_id));
create policy "responder alerta" on respuestas_alerta for insert with check (
  perfil_id = auth.uid() and exists (select 1 from mensajes_red m where m.id = mensaje_id and es_miembro(m.red_id))
);
create policy "ver respuestas" on respuestas_alerta for select using (
  exists (select 1 from mensajes_red m where m.id = mensaje_id and es_miembro(m.red_id))
);
-- Al insertar un SOS, una Edge Function envía notificación push a todos los miembros.

-- =====================================================================
-- Chat privado, verificación de documentos y costo de pasarela
-- =====================================================================
create table conversaciones (
  id          uuid primary key default gen_random_uuid(),
  perfil_a    uuid not null references perfiles on delete cascade,
  perfil_b    uuid not null references perfiles on delete cascade,
  publicacion_id uuid references publicaciones on delete set null,
  creado_en   timestamptz not null default now(),
  check (perfil_a < perfil_b),               -- una sola conversación por pareja
  unique (perfil_a, perfil_b)
);

create table mensajes_privados (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones on delete cascade,
  autor_id        uuid not null references perfiles on delete cascade,
  texto           text not null default '' check (char_length(texto) <= 1000),
  foto_path       text,                       -- ruta en Supabase Storage (bucket privado "chat")
  creado_en       timestamptz not null default now()
);
create index mensajes_privados_idx on mensajes_privados (conversacion_id, creado_en);

create table lecturas (
  conversacion_id uuid references conversaciones on delete cascade,
  perfil_id       uuid references perfiles on delete cascade,
  leido_en        timestamptz not null default now(),
  primary key (conversacion_id, perfil_id)
);

-- Documentos de verificación (cédula, antecedentes). Las imágenes van a un bucket
-- PRIVADO al que solo accede el equipo de verificación (service_role). Datos sensibles: Ley 1581.
create table verificaciones (
  perfil_id   uuid references perfiles on delete cascade,
  tipo        text not null check (tipo in ('cedula', 'antecedentes')),
  estado      text not null default 'en-revision' check (estado in ('en-revision', 'verificado', 'rechazado')),
  archivos    text[] not null,                -- rutas en el bucket privado "verificaciones"
  revisado_por uuid,
  motivo_rechazo text,
  enviado_en  timestamptz not null default now(),
  revisado_en timestamptz,
  vence_en    timestamptz,                    -- los antecedentes deben renovarse periódicamente
  primary key (perfil_id, tipo)
);

-- Fotos de publicaciones (bucket público "publicaciones", máx. 4 por publicación)
alter table publicaciones add column fotos text[] not null default '{}' check (cardinality(fotos) <= 4);

-- Costo de la pasarela a cargo del cliente
alter table pagos add column pasarela_cop bigint not null default 0;
alter table pagos add column total_cop bigint generated always as (valor_cop + pasarela_cop) stored;

alter table conversaciones    enable row level security;
alter table mensajes_privados enable row level security;
alter table lecturas          enable row level security;
alter table verificaciones    enable row level security;

create policy "mis conversaciones" on conversaciones for select using (auth.uid() in (perfil_a, perfil_b));
create policy "iniciar conversacion" on conversaciones for insert with check (auth.uid() in (perfil_a, perfil_b));
create policy "leer mensajes privados" on mensajes_privados for select using (
  exists (select 1 from conversaciones c where c.id = conversacion_id and auth.uid() in (c.perfil_a, c.perfil_b))
);
create policy "enviar mensaje privado" on mensajes_privados for insert with check (
  autor_id = auth.uid()
  and exists (select 1 from conversaciones c where c.id = conversacion_id and auth.uid() in (c.perfil_a, c.perfil_b))
);
create policy "mis lecturas" on lecturas for all using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());
-- El usuario envía y consulta SU verificación; solo el backend (service_role) la aprueba o rechaza.
create policy "enviar verificacion" on verificaciones for insert with check (perfil_id = auth.uid() and estado = 'en-revision');
create policy "ver mi verificacion" on verificaciones for select using (perfil_id = auth.uid());

-- Insignias públicas: los vecinos ven SI está verificado, nunca los documentos
create or replace view insignias_publicas as
  select perfil_id, tipo from verificaciones where estado = 'verificado' and (vence_en is null or vence_en > now());

-- =====================================================================
-- Promociones pagadas (única forma de ganar visibilidad pagando)
-- =====================================================================
create table planes_promocion (
  id          text primary key,              -- 'cuadra', 'barrio', 'localidad'
  nombre      text not null,
  dias        int not null check (dias > 0),
  alcance_m   int not null check (alcance_m between 200 and 10000),
  precio_cop  bigint not null check (precio_cop > 0),
  activo      boolean not null default true
);
insert into planes_promocion values
  ('cuadra', 'Cuadra', 3, 1000, 5000, true),
  ('barrio', 'Barrio', 7, 2000, 15000, true),
  ('localidad', 'Localidad', 14, 5000, 40000, true);

create table promociones (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references publicaciones on delete cascade,
  autor_id       uuid not null references perfiles,
  plan_id        text not null references planes_promocion,
  alcance_m      int not null,
  inicio         timestamptz not null default now(),
  fin            timestamptz not null,        -- en eventos, nunca después de la fecha del evento
  precio_cop     bigint not null,
  pasarela_cop   bigint not null default 0,
  estado         text not null default 'pendiente_pago'
                 check (estado in ('pendiente_pago', 'activa', 'detenida', 'retirada')),
  referencia_pasarela text unique,
  vistas         int not null default 0,
  clics          int not null default 0
);
create index promociones_activas_idx on promociones (estado, fin);
-- Solo una promoción activa por publicación
create unique index una_promo_activa on promociones (publicacion_id) where estado = 'activa';

-- Las alertas de seguridad no se pueden promocionar
create or replace function validar_promocion() returns trigger language plpgsql as $$
begin
  if (select categoria from publicaciones where id = new.publicacion_id) = 'seguridad' then
    raise exception 'Las alertas de seguridad no se pueden promocionar';
  end if;
  return new;
end $$;
create trigger promociones_validar before insert on promociones for each row execute function validar_promocion();

-- Promociones visibles para el usuario actual: activas y dentro del alcance pagado.
-- El cliente toma máximo 2 y las rota.
create or replace function promociones_cercanas()
returns table (promocion_id uuid, publicacion_id uuid, distancia_m double precision)
language sql stable security definer set search_path = public as $$
  select pr.id, p.id, st_distance(p.ubicacion, yo.ubicacion)
  from promociones pr
  join publicaciones p on p.id = pr.publicacion_id
  cross join (select ubicacion from perfiles where id = auth.uid()) yo
  where pr.estado = 'activa' and now() between pr.inicio and pr.fin and not p.oculta
    and st_dwithin(p.ubicacion, yo.ubicacion, pr.alcance_m);
$$;

alter table promociones enable row level security;
alter table planes_promocion enable row level security;
create policy "ver planes" on planes_promocion for select using (activo);
create policy "ver mis promociones" on promociones for select using (autor_id = auth.uid());
-- Crear/activar promociones lo hace el backend tras confirmar el pago (webhook de la pasarela).

-- =====================================================================
-- Interacciones sociales, historias, reels y notas
-- (los "me gusta" NO influyen en el orden del feed: sigue siendo cronológico)
-- =====================================================================
create table me_gusta (
  publicacion_id uuid references publicaciones on delete cascade,
  perfil_id      uuid references perfiles on delete cascade,
  creado_en      timestamptz not null default now(),
  primary key (publicacion_id, perfil_id)
);
create table guardados (
  perfil_id      uuid references perfiles on delete cascade,
  publicacion_id uuid references publicaciones on delete cascade,
  creado_en      timestamptz not null default now(),
  primary key (perfil_id, publicacion_id)
);
alter table publicaciones add column compartidos int not null default 0;

create table historias (
  id         uuid primary key default gen_random_uuid(),
  autor_id   uuid not null references perfiles on delete cascade,
  ubicacion  geography(Point, 4326) not null,   -- difuminada
  foto_path  text,
  texto      text not null default '' check (char_length(texto) <= 150),
  fondo      text not null default '#d91e2b',
  creado_en  timestamptz not null default now(),
  expira_en  timestamptz not null default now() + interval '24 hours'
);
create index historias_ubicacion_idx on historias using gist (ubicacion);
create table vistas_historia (
  historia_id uuid references historias on delete cascade,
  perfil_id   uuid references perfiles on delete cascade,
  primary key (historia_id, perfil_id)
);

create table reels (
  id          uuid primary key default gen_random_uuid(),
  autor_id    uuid not null references perfiles on delete cascade,
  ubicacion   geography(Point, 4326) not null,
  video_path  text not null,                     -- Storage; transcodificar a HLS/MP4 liviano
  descripcion text not null default '' check (char_length(descripcion) <= 300),
  duracion_s  numeric not null check (duracion_s <= 60),
  reproducciones int not null default 0,
  compartidos int not null default 0,
  oculto      boolean not null default false,
  creado_en   timestamptz not null default now()
);
create index reels_ubicacion_idx on reels using gist (ubicacion);
create table me_gusta_reel (
  reel_id   uuid references reels on delete cascade,
  perfil_id uuid references perfiles on delete cascade,
  primary key (reel_id, perfil_id)
);
create table comentarios_reel (
  id        uuid primary key default gen_random_uuid(),
  reel_id   uuid not null references reels on delete cascade,
  autor_id  uuid not null references perfiles on delete cascade,
  texto     text not null check (char_length(texto) between 1 and 500),
  creado_en timestamptz not null default now()
);

-- Una nota activa por vecino
create table notas (
  autor_id  uuid primary key references perfiles on delete cascade,
  ubicacion geography(Point, 4326) not null,
  texto     text not null check (char_length(texto) between 1 and 60),
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null default now() + interval '24 hours'
);

alter table me_gusta enable row level security;
alter table guardados enable row level security;
alter table historias enable row level security;
alter table vistas_historia enable row level security;
alter table reels enable row level security;
alter table me_gusta_reel enable row level security;
alter table comentarios_reel enable row level security;
alter table notas enable row level security;

create policy "dar me gusta" on me_gusta for all using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());
create policy "contar me gusta" on me_gusta for select using (true);
create policy "mis guardados" on guardados for all using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());
create policy "publicar historia" on historias for insert with check (autor_id = auth.uid());
create policy "borrar mi historia" on historias for delete using (autor_id = auth.uid());
create policy "registrar vista" on vistas_historia for insert with check (perfil_id = auth.uid());
-- Solo el autor ve quién vio su historia
create policy "ver vistas de mi historia" on vistas_historia for select using (
  exists (select 1 from historias h where h.id = historia_id and h.autor_id = auth.uid())
);
create policy "publicar reel" on reels for insert with check (autor_id = auth.uid());
create policy "borrar mi reel" on reels for delete using (autor_id = auth.uid());
create policy "dar me gusta reel" on me_gusta_reel for all using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());
create policy "comentar reel" on comentarios_reel for insert with check (autor_id = auth.uid());
create policy "leer comentarios reel" on comentarios_reel for select using (true);
create policy "mi nota" on notas for all using (autor_id = auth.uid()) with check (autor_id = auth.uid());
-- Historias, reels y notas se LEEN por funciones RPC filtradas por radio (como feed_cercano),
-- nunca con un select abierto, para que solo los vean los vecinos cercanos.
-- Un cron (pg_cron) borra cada hora historias y notas vencidas y sus archivos.

-- =====================================================================
-- Ventas de garaje
-- =====================================================================
alter type categoria add value if not exists 'garaje';
-- En publicaciones.datos (jsonb) para 'garaje': {inicio, fin, direccion, medios_pago[]}
-- La publicación vence sola: expira_en = fin de la venta.

create table articulos_garaje (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references publicaciones on delete cascade,
  nombre         text not null check (char_length(nombre) between 1 and 60),
  precio_cop     bigint not null default 0 check (precio_cop >= 0),
  foto_path      text,
  estado         text not null default 'disponible' check (estado in ('disponible', 'apartado', 'vendido')),
  apartado_por   uuid references perfiles on delete set null,
  apartado_en    timestamptz,
  orden          int not null default 0
);
create index articulos_garaje_idx on articulos_garaje (publicacion_id, orden);

create table asistentes_garaje (
  publicacion_id uuid references publicaciones on delete cascade,
  perfil_id      uuid references perfiles on delete cascade,
  primary key (publicacion_id, perfil_id)
);

-- Apartar es atómico: solo funciona si el artículo sigue disponible y la venta no ha terminado
create or replace function apartar_articulo(p_articulo uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare filas int;
begin
  update articulos_garaje a set estado = 'apartado', apartado_por = auth.uid(), apartado_en = now()
  from publicaciones p
  where a.id = p_articulo and p.id = a.publicacion_id and a.estado = 'disponible'
    and p.autor_id <> auth.uid() and (p.expira_en is null or p.expira_en > now());
  get diagnostics filas = row_count;
  return filas = 1;
end $$;

alter table articulos_garaje enable row level security;
alter table asistentes_garaje enable row level security;
create policy "ver articulos" on articulos_garaje for select using (true);
create policy "vendedor gestiona articulos" on articulos_garaje for all using (
  exists (select 1 from publicaciones p where p.id = publicacion_id and p.autor_id = auth.uid())
);
create policy "soltar mi apartado" on articulos_garaje for update using (apartado_por = auth.uid())
  with check (estado = 'disponible' and apartado_por is null);
create policy "ire a la venta" on asistentes_garaje for all using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());
create policy "contar asistentes" on asistentes_garaje for select using (true);

-- =====================================================================
-- Empresas / negocios y redes sociales
-- =====================================================================
alter table perfiles add column bio text check (char_length(bio) <= 160);
alter table perfiles add column redes jsonb not null default '{}';   -- {facebook, instagram, linkedin, ...} ya validados

create table empresas (
  id           uuid primary key default gen_random_uuid(),
  dueno_id     uuid not null references perfiles on delete cascade,
  nombre       text not null check (char_length(nombre) between 3 and 60),
  rubro        text not null,
  descripcion  text not null default '' check (char_length(descripcion) <= 500),
  logo_path    text,
  portada_path text,
  ubicacion    geography(Point, 4326) not null,
  direccion    text not null default '',
  telefono     text not null default '',
  horario      text not null default '',
  redes        jsonb not null default '{}',
  nit          text not null default '',
  verificacion text not null default 'no' check (verificacion in ('no', 'en-revision', 'verificada')),
  creado_en    timestamptz not null default now()
);
create index empresas_ubicacion_idx on empresas using gist (ubicacion);

create table seguidores_empresa (
  empresa_id uuid references empresas on delete cascade,
  perfil_id  uuid references perfiles on delete cascade,
  creado_en  timestamptz not null default now(),
  primary key (empresa_id, perfil_id)
);

alter table publicaciones add column empresa_id uuid references empresas on delete set null;

-- Máximo 3 negocios por persona
create or replace function limite_empresas() returns trigger language plpgsql as $$
begin
  if (select count(*) from empresas where dueno_id = new.dueno_id) >= 3 then
    raise exception 'Máximo 3 negocios por persona';
  end if;
  return new;
end $$;
create trigger empresas_limite before insert on empresas for each row execute function limite_empresas();

-- Los enlaces se validan TAMBIÉN en el servidor (no basta con el cliente): solo https y del dominio de cada red
create or replace function enlaces_validos(r jsonb) returns boolean language sql immutable as $$
  select coalesce(bool_and(
    v ~ '^https://' and case k
      when 'facebook'  then v ~ '^https://([a-z]+\.)?(facebook\.com|fb\.com|fb\.me)/'
      when 'instagram' then v ~ '^https://([a-z]+\.)?(instagram\.com|instagr\.am)/'
      when 'linkedin'  then v ~ '^https://([a-z]+\.)?(linkedin\.com|lnkd\.in)/'
      when 'tiktok'    then v ~ '^https://([a-z]+\.)?tiktok\.com/'
      when 'x'         then v ~ '^https://([a-z]+\.)?(x\.com|twitter\.com)/'
      when 'youtube'   then v ~ '^https://([a-z]+\.)?(youtube\.com|youtu\.be)/'
      when 'whatsapp'  then v ~ '^https://wa\.me/57\d{10}$'
      when 'web'       then true
      else false end
  ), true)
  from jsonb_each_text(r) as e(k, v);
$$;
alter table empresas add constraint empresas_redes_validas check (enlaces_validos(redes));
alter table perfiles add constraint perfiles_redes_validas check (enlaces_validos(redes));

alter table empresas enable row level security;
alter table seguidores_empresa enable row level security;
create policy "ver empresas" on empresas for select using (true);
create policy "crear mi empresa" on empresas for insert with check (dueno_id = auth.uid() and verificacion = 'no');
-- El dueño edita su negocio pero NO puede marcarse como verificado (eso lo hace el backend)
create policy "editar mi empresa" on empresas for update using (dueno_id = auth.uid())
  with check (dueno_id = auth.uid() and verificacion in ('no', 'en-revision'));
create policy "borrar mi empresa" on empresas for delete using (dueno_id = auth.uid());
create policy "seguir" on seguidores_empresa for all using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());
create policy "contar seguidores" on seguidores_empresa for select using (true);

-- =====================================================================
-- Foto de perfil, privacidad de la foto y oficios
-- =====================================================================
alter table perfiles add column foto_path text;                       -- bucket "avatares" (400×400 JPEG)
alter table perfiles add column visibilidad_foto text not null default 'todos'
  check (visibilidad_foto in ('todos', 'redes', 'contactos'));
alter table perfiles add column oficios text[] not null default '{}'
  check (cardinality(oficios) <= 8);

create table reportes_foto (
  perfil_id     uuid references perfiles on delete cascade,
  reportado_por uuid references perfiles on delete cascade,
  creado_en     timestamptz not null default now(),
  primary key (perfil_id, reportado_por)
);
alter table reportes_foto enable row level security;
create policy "reportar foto" on reportes_foto for insert with check (reportado_por = auth.uid() and perfil_id <> auth.uid());

-- ¿Puede el usuario actual ver la foto de `p_dueno`? (misma regla que el cliente)
-- contactos = ambos escribieron en un chat, o hubo un pago entre ellos
create or replace function puede_ver_foto(p_dueno uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() = p_dueno then true
    when (select visibilidad_foto from perfiles where id = p_dueno) = 'todos' then true
    when exists (
      select 1 from conversaciones c
      where (c.perfil_a, c.perfil_b) in ((least(auth.uid(), p_dueno), greatest(auth.uid(), p_dueno)))
        and exists (select 1 from mensajes_privados m where m.conversacion_id = c.id and m.autor_id = auth.uid())
        and exists (select 1 from mensajes_privados m where m.conversacion_id = c.id and m.autor_id = p_dueno)
    ) or exists (
      select 1 from pagos pg where (pg.cliente_id, pg.proveedor_id) in ((auth.uid(), p_dueno), (p_dueno, auth.uid()))
    ) then true
    when (select visibilidad_foto from perfiles where id = p_dueno) = 'redes'
      and exists (select 1 from miembros_red a join miembros_red b on a.red_id = b.red_id
                  where a.perfil_id = p_dueno and b.perfil_id = auth.uid()) then true
    else false
  end;
$$;
-- El bucket "avatares" es PRIVADO: las fotos se entregan con URLs firmadas solo si puede_ver_foto() es verdadero.

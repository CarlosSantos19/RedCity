-- =====================================================================
-- RedCity · Migración 0002 · Etapa 1
-- Cuentas reales, perfiles, publicaciones compartidas, comentarios,
-- me gusta, compartidos, reportes y fotos en Storage.
-- Ejecutar UNA vez en Supabase → SQL Editor, después de schema.sql.
-- =====================================================================

-- ---------- 1. Barrios: identificador legible + barrios semilla de Bogotá ----------
alter table barrios add column if not exists slug text unique;

insert into barrios (slug, nombre, localidad, ciudad, centro) values
  ('bog-santa-barbara',   'Santa Bárbara',    'Usaquén',            'Bogotá', st_setsrid(st_makepoint(-74.0330, 4.6960), 4326)::geography),
  ('bog-cedritos',        'Cedritos',         'Usaquén',            'Bogotá', st_setsrid(st_makepoint(-74.0440, 4.7230), 4326)::geography),
  ('bog-chapinero-alto',  'Chapinero Alto',   'Chapinero',          'Bogotá', st_setsrid(st_makepoint(-74.0577, 4.6486), 4326)::geography),
  ('bog-chico',           'El Chicó',         'Chapinero',          'Bogotá', st_setsrid(st_makepoint(-74.0480, 4.6750), 4326)::geography),
  ('bog-la-macarena',     'La Macarena',      'Santa Fe',           'Bogotá', st_setsrid(st_makepoint(-74.0660, 4.6130), 4326)::geography),
  ('bog-20-de-julio',     '20 de Julio',      'San Cristóbal',      'Bogotá', st_setsrid(st_makepoint(-74.0950, 4.5720), 4326)::geography),
  ('bog-usme-centro',     'Usme Centro',      'Usme',               'Bogotá', st_setsrid(st_makepoint(-74.1260, 4.4760), 4326)::geography),
  ('bog-venecia',         'Venecia',          'Tunjuelito',         'Bogotá', st_setsrid(st_makepoint(-74.1390, 4.5880), 4326)::geography),
  ('bog-bosa-centro',     'Bosa Centro',      'Bosa',               'Bogotá', st_setsrid(st_makepoint(-74.1880, 4.6190), 4326)::geography),
  ('bog-kennedy-central', 'Kennedy Central',  'Kennedy',            'Bogotá', st_setsrid(st_makepoint(-74.1517, 4.6283), 4326)::geography),
  ('bog-castilla',        'Castilla',         'Kennedy',            'Bogotá', st_setsrid(st_makepoint(-74.1430, 4.6420), 4326)::geography),
  ('bog-fontibon-centro', 'Fontibón Centro',  'Fontibón',           'Bogotá', st_setsrid(st_makepoint(-74.1460, 4.6730), 4326)::geography),
  ('bog-normandia',       'Normandía',        'Engativá',           'Bogotá', st_setsrid(st_makepoint(-74.1050, 4.6640), 4326)::geography),
  ('bog-suba-centro',     'Suba Centro',      'Suba',               'Bogotá', st_setsrid(st_makepoint(-74.0836, 4.7409), 4326)::geography),
  ('bog-niza',            'Niza',             'Suba',               'Bogotá', st_setsrid(st_makepoint(-74.0700, 4.7170), 4326)::geography),
  ('bog-doce-de-octubre', 'Doce de Octubre',  'Barrios Unidos',     'Bogotá', st_setsrid(st_makepoint(-74.0790, 4.6700), 4326)::geography),
  ('bog-galerias',        'Galerías',         'Teusaquillo',        'Bogotá', st_setsrid(st_makepoint(-74.0760, 4.6430), 4326)::geography),
  ('bog-la-soledad',      'La Soledad',       'Teusaquillo',        'Bogotá', st_setsrid(st_makepoint(-74.0730, 4.6340), 4326)::geography),
  ('bog-santa-isabel',    'Santa Isabel',     'Los Mártires',       'Bogotá', st_setsrid(st_makepoint(-74.0960, 4.6050), 4326)::geography),
  ('bog-restrepo',        'Restrepo',         'Antonio Nariño',     'Bogotá', st_setsrid(st_makepoint(-74.1030, 4.5900), 4326)::geography),
  ('bog-ciudad-montes',   'Ciudad Montes',    'Puente Aranda',      'Bogotá', st_setsrid(st_makepoint(-74.1170, 4.6090), 4326)::geography),
  ('bog-la-candelaria',   'La Candelaria',    'La Candelaria',      'Bogotá', st_setsrid(st_makepoint(-74.0730, 4.5970), 4326)::geography),
  ('bog-quiroga',         'Quiroga',          'Rafael Uribe Uribe', 'Bogotá', st_setsrid(st_makepoint(-74.1140, 4.5780), 4326)::geography),
  ('bog-lucero',          'Lucero',           'Ciudad Bolívar',     'Bogotá', st_setsrid(st_makepoint(-74.1510, 4.5520), 4326)::geography)
on conflict (slug) do nothing;

-- Lista de barrios para la app (con lat/lng legibles)
create or replace function listar_barrios()
returns table (id uuid, slug text, nombre text, localidad text, ciudad text, lat double precision, lng double precision)
language sql stable security definer set search_path = public as $$
  select id, slug, nombre, localidad, ciudad, st_y(centro::geometry), st_x(centro::geometry) from barrios order by nombre;
$$;

-- ---------- 2. Perfil automático al registrarse ----------
-- La app envía en los metadatos del registro: nombre, barrio (slug) o barrio_nuevo + localidad,
-- lat/lng (si el vecino usó el GPS), gps (true/false) y habeas (true).
-- La verificación NO la decide la app: la calcula el servidor (GPS a ≤ 1,5 km del centro del barrio).
create or replace function crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}');
  b uuid;
  centro_b geography;
  punto geography;
  con_gps boolean := coalesce((m->>'gps')::boolean, false) and m ? 'lat' and m ? 'lng';
begin
  if coalesce((m->>'habeas')::boolean, false) is not true then
    raise exception 'Debe aceptar el tratamiento de datos (Ley 1581 de 2012)';
  end if;
  if con_gps then
    punto := st_setsrid(st_makepoint((m->>'lng')::float8, (m->>'lat')::float8), 4326)::geography;
  end if;

  if nullif(trim(m->>'barrio_nuevo'), '') is not null then
    if punto is null then raise exception 'Para crear un barrio nuevo se necesita la ubicación GPS'; end if;
    insert into barrios (slug, nombre, localidad, ciudad, centro, creado_por_vecinos)
    values ('vec-' || substr(replace(new.id::text, '-', ''), 1, 12), left(trim(m->>'barrio_nuevo'), 60),
            coalesce(nullif(m->>'localidad', ''), 'Sin localidad'), 'Bogotá', punto, true)
    returning id, centro into b, centro_b;
  else
    select id, centro into b, centro_b from barrios where slug = m->>'barrio';
  end if;
  if b is null then raise exception 'Barrio no válido'; end if;

  insert into perfiles (id, nombre, barrio_id, ubicacion, verificado, habeas_data_aceptado_en)
  values (new.id, left(coalesce(nullif(trim(m->>'nombre'), ''), 'Vecino'), 40), b,
          coalesce(punto, centro_b),
          punto is not null and st_dwithin(punto, centro_b, 1500),
          now());
  return new;
end $$;

drop trigger if exists al_registrarse on auth.users;
create trigger al_registrarse after insert on auth.users for each row execute function crear_perfil();

-- Mi perfil completo (incluye mi ubicación, que nadie más puede ver)
create or replace function mi_perfil()
returns table (id uuid, nombre text, barrio_slug text, lat double precision, lng double precision, verificado boolean,
               radio_m int, bio text, redes jsonb, oficios text[], foto_path text, visibilidad_foto text, creado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, b.slug, st_y(p.ubicacion::geometry), st_x(p.ubicacion::geometry), p.verificado,
         p.radio_m, p.bio, p.redes, p.oficios, p.foto_path, p.visibilidad_foto, p.creado_en
  from perfiles p join barrios b on b.id = p.barrio_id where p.id = auth.uid();
$$;

-- Nadie puede auto-verificarse ni cambiar su barrio/ubicación/consentimiento desde la app
create or replace function proteger_perfil() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.verificado := old.verificado;
    new.barrio_id := old.barrio_id;
    new.ubicacion := old.ubicacion;
    new.habeas_data_aceptado_en := old.habeas_data_aceptado_en;
  end if;
  return new;
end $$;
drop trigger if exists perfiles_proteger on perfiles;
create trigger perfiles_proteger before update on perfiles for each row execute function proteger_perfil();

-- Los perfiles solo los crea el servidor al registrarse (evita borrar y recrear el perfil "verificado")
create or replace function bloquear_insert_perfil() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'Los perfiles se crean automáticamente al registrarse';
  end if;
  return new;
end $$;
drop trigger if exists perfiles_solo_servidor on perfiles;
create trigger perfiles_solo_servidor before insert on perfiles for each row execute function bloquear_insert_perfil();

-- Publicaciones: el autor no puede des-ocultar lo que la comunidad reportó ni inflar sus compartidos
create or replace function proteger_publicacion() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.oculta := false;
      new.compartidos := 0;
      new.creado_en := now();
    else
      new.oculta := old.oculta;
      new.compartidos := old.compartidos;
      new.autor_id := old.autor_id;
      new.creado_en := old.creado_en;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists publicaciones_proteger on publicaciones;
create trigger publicaciones_proteger before insert or update on publicaciones for each row execute function proteger_publicacion();

-- Datos públicos de perfiles (nunca correo ni ubicación; la foto solo si su dueño lo permite)
create or replace function perfiles_publicos(ids uuid[])
returns table (id uuid, nombre text, barrio_id uuid, verificado boolean, bio text, redes jsonb, oficios text[],
               foto_path text, creado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.barrio_id, p.verificado, p.bio, p.redes, p.oficios,
         case when puede_ver_foto(p.id) then p.foto_path end, p.creado_en
  from perfiles p where p.id = any(ids);
$$;

-- ---------- 3. Feed completo (reemplaza al de schema.sql) ----------
-- Devuelve lo que la app necesita para pintar las tarjetas: contenido, fotos, autor,
-- comentarios y me gusta. Sigue SIN algoritmo: solo radio + orden cronológico.
drop function if exists feed_cercano(categoria, int);
create or replace function feed_cercano(p_radio_m int default 5000, p_limite int default 300)
returns table (
  id uuid, categoria categoria, titulo text, descripcion text, datos jsonb, fotos text[], empresa_id uuid,
  autor_id uuid, autor text, autor_verificado boolean, barrio_slug text,
  lat double precision, lng double precision, distancia_m double precision, creado_en timestamptz,
  compartidos int, oculta boolean, me_gusta uuid[], respuestas jsonb
) language sql stable security definer set search_path = public as $$
  with yo as (select ubicacion from perfiles where id = auth.uid())
  select p.id, p.categoria, p.titulo, p.descripcion, p.datos, p.fotos, p.empresa_id,
         p.autor_id, pf.nombre, pf.verificado, b.slug,
         st_y(p.ubicacion::geometry), st_x(p.ubicacion::geometry), st_distance(p.ubicacion, yo.ubicacion), p.creado_en,
         p.compartidos, p.oculta,
         coalesce((select array_agg(mg.perfil_id) from me_gusta mg where mg.publicacion_id = p.id), '{}'),
         coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'autor', rp.nombre, 'texto', r.texto,
                                                       'creado', extract(epoch from r.creado_en) * 1000) order by r.creado_en)
                   from respuestas r join perfiles rp on rp.id = r.autor_id where r.publicacion_id = p.id), '[]')
  from publicaciones p
  join perfiles pf on pf.id = p.autor_id
  join barrios b on b.id = p.barrio_id
  cross join yo
  where (not p.oculta or p.autor_id = auth.uid())
    and (p.expira_en is null or p.expira_en > now() or p.autor_id = auth.uid())
    and st_dwithin(p.ubicacion, yo.ubicacion, least(greatest(p_radio_m, 200), 10000))
  order by p.creado_en desc
  limit least(p_limite, 500);
$$;

-- ---------- 4. Comentarios, me gusta y compartidos ----------
create policy "borrar mi comentario" on respuestas for delete using (autor_id = auth.uid());

-- Cualquier vecino con sesión puede sumar un "compartido" (la tabla solo la edita el autor)
create or replace function sumar_compartido(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update publicaciones set compartidos = compartidos + 1 where id = p_id and auth.uid() is not null;
$$;

-- CORRECCIÓN de schema.sql: el ocultamiento automático por reportes corría con los permisos
-- del vecino que reporta, que no puede contar reportes ajenos ni editar publicaciones de otros,
-- así que nunca se activaba. Ahora corre con permisos del servidor (security definer).
create or replace function auto_ocultar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(distinct reportado_por) from reportes where publicacion_id = new.publicacion_id) >= 3 then
    update publicaciones set oculta = true where id = new.publicacion_id;
  end if;
  return new;
end $$;

-- El autor también puede ver sus publicaciones directamente
create policy "ver mis publicaciones" on publicaciones for select using (autor_id = auth.uid());

-- ---------- 5. Fotos en Storage ----------
-- publicaciones: público (las fotos de publicaciones las ve el barrio)
-- avatares: PRIVADO (se entrega con URL firmada solo si puede_ver_foto() lo permite)
-- Cada vecino solo puede subir/borrar dentro de su propia carpeta: <su id>/archivo.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('publicaciones', 'publicaciones', true,  5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatares',      'avatares',      false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "subir mis fotos" on storage.objects for insert to authenticated
  with check (bucket_id in ('publicaciones', 'avatares') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "borrar mis fotos" on storage.objects for delete to authenticated
  using (bucket_id in ('publicaciones', 'avatares') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ver avatares permitidos" on storage.objects for select to authenticated
  using (bucket_id = 'avatares' and puede_ver_foto(((storage.foldername(name))[1])::uuid));

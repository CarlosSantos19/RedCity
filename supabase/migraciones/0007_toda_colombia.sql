-- RedCity · 0007 · Toda Colombia
-- Los barrios dejan de ser solo de Bogotá: cada barrio guarda su municipio (ciudad), su departamento
-- y, opcionalmente, su localidad/comuna. Los 24 barrios de Bogotá se mantienen.

-- ---------- 1. Departamento y código DIVIPOLA del municipio ----------
alter table barrios add column if not exists departamento text not null default 'Bogotá D.C.';
alter table barrios add column if not exists codigo_municipio text;
alter table barrios alter column ciudad drop default;
alter table barrios alter column departamento drop default;
alter table barrios alter column localidad set default '';
update barrios set codigo_municipio = '11001' where ciudad = 'Bogotá' and codigo_municipio is null;
-- "Sin localidad" era un relleno: en municipios pequeños no hay localidades
update barrios set localidad = '' where localidad = 'Sin localidad';

-- ---------- 2. Lista de barrios con departamento ----------
drop function if exists listar_barrios();
create function listar_barrios()
returns table (id uuid, slug text, nombre text, localidad text, ciudad text, departamento text,
               lat double precision, lng double precision)
language sql stable security definer set search_path = public as $$
  select id, slug, nombre, localidad, ciudad, departamento, st_y(centro::geometry), st_x(centro::geometry)
  from barrios order by departamento, ciudad, nombre;
$$;
grant execute on function listar_barrios() to anon, authenticated;

-- ---------- 3. Perfil automático al registrarse (barrio nuevo en cualquier municipio) ----------
-- Metadatos: nombre, barrio (slug) o barrio_nuevo + ciudad + departamento (+ codigo_municipio, localidad opcional),
-- lat/lng y gps si el vecino usó el GPS, y habeas = true.
create or replace function crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}');
  b uuid;
  centro_b geography;
  punto geography;
  con_gps boolean := coalesce((m->>'gps')::boolean, false) and m ? 'lat' and m ? 'lng';
  v_ciudad text := left(trim(coalesce(m->>'ciudad', '')), 60);
  v_depto text := left(trim(coalesce(m->>'departamento', '')), 60);
  v_lat float8;
  v_lng float8;
begin
  if coalesce((m->>'habeas')::boolean, false) is not true then
    raise exception 'Debe aceptar el tratamiento de datos (Ley 1581 de 2012)';
  end if;
  if con_gps then
    v_lat := (m->>'lat')::float8;
    v_lng := (m->>'lng')::float8;
    -- Caja de Colombia continental + San Andrés y Providencia
    if v_lat not between -4.3 and 13.6 or v_lng not between -82 and -66.8 then
      raise exception 'RedCity solo funciona en Colombia';
    end if;
    punto := st_setsrid(st_makepoint(v_lng, v_lat), 4326)::geography;
  end if;

  if nullif(trim(m->>'barrio_nuevo'), '') is not null then
    if punto is null then raise exception 'Para crear un barrio nuevo se necesita la ubicación GPS'; end if;
    if char_length(v_ciudad) < 2 or char_length(v_depto) < 2 then
      raise exception 'Falta el municipio o el departamento del barrio';
    end if;
    insert into barrios (slug, nombre, localidad, ciudad, departamento, codigo_municipio, centro, creado_por_vecinos)
    values ('vec-' || substr(replace(new.id::text, '-', ''), 1, 12), left(trim(m->>'barrio_nuevo'), 60),
            left(trim(coalesce(m->>'localidad', '')), 60), v_ciudad, v_depto,
            nullif(left(trim(coalesce(m->>'codigo_municipio', '')), 5), ''), punto, true)
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

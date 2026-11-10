-- RedCity · 0012 · Crear un barrio nuevo aunque el GPS no responda
-- Si el celular no da la ubicación, la app envía el centro aproximado de la localidad (Bogotá) o del
-- municipio (centro_lat/centro_lng). El barrio se crea ahí y el vecino queda SIN verificar.
-- Con GPS todo sigue igual que en 0007.

create or replace function crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}');
  b uuid;
  centro_b geography;
  punto geography;
  centro_nuevo geography;
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
    centro_nuevo := punto;
    if centro_nuevo is null and m ? 'centro_lat' and m ? 'centro_lng' then
      v_lat := (m->>'centro_lat')::float8;
      v_lng := (m->>'centro_lng')::float8;
      if v_lat not between -4.3 and 13.6 or v_lng not between -82 and -66.8 then
        raise exception 'RedCity solo funciona en Colombia';
      end if;
      centro_nuevo := st_setsrid(st_makepoint(v_lng, v_lat), 4326)::geography;
    end if;
    if centro_nuevo is null then raise exception 'Para crear un barrio nuevo se necesita la ubicación'; end if;
    if char_length(v_ciudad) < 2 or char_length(v_depto) < 2 then
      raise exception 'Falta el municipio o el departamento del barrio';
    end if;
    insert into barrios (slug, nombre, localidad, ciudad, departamento, codigo_municipio, centro, creado_por_vecinos)
    values ('vec-' || substr(replace(new.id::text, '-', ''), 1, 12), left(trim(m->>'barrio_nuevo'), 60),
            left(trim(coalesce(m->>'localidad', '')), 60), v_ciudad, v_depto,
            nullif(left(trim(coalesce(m->>'codigo_municipio', '')), 5), ''), centro_nuevo, true)
    returning id, centro into b, centro_b;
  else
    select id, centro into b, centro_b from barrios where slug = m->>'barrio';
  end if;
  if b is null then raise exception 'Barrio no válido'; end if;

  -- Verificado solo con GPS real cerca del barrio (un centro aproximado nunca verifica)
  insert into perfiles (id, nombre, barrio_id, ubicacion, verificado, habeas_data_aceptado_en)
  values (new.id, left(coalesce(nullif(trim(m->>'nombre'), ''), 'Vecino'), 40), b,
          coalesce(punto, centro_b),
          punto is not null and st_dwithin(punto, centro_b, 1500),
          now());
  return new;
end $$;

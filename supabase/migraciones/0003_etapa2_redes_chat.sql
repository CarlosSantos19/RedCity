-- =====================================================================
-- RedCity · Migración 0003 · Etapa 2
-- Redes de seguridad y apoyo (SOS en tiempo real) + chat privado.
-- Ejecutar UNA vez en Supabase → SQL Editor, después de 0002.
-- =====================================================================

-- ---------- Redes ----------
-- ¿Soy coordinador de esta red? (función aparte para no causar recursión en las reglas RLS)
create or replace function es_coordinador(p_red uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros_red where red_id = p_red and perfil_id = auth.uid() and rol = 'coordinador');
$$;

-- El servidor genera el código de invitación (no lo elige la app)
create or replace function codigo_red() returns trigger language plpgsql as $$
begin
  new.codigo := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  return new;
end $$;
drop trigger if exists redes_codigo on redes;
create trigger redes_codigo before insert on redes for each row execute function codigo_red();

-- Quien crea la red queda como coordinador
create or replace function al_crear_red() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into miembros_red (red_id, perfil_id, rol) values (new.id, new.creado_por, 'coordinador');
  return new;
end $$;
drop trigger if exists redes_coordinador on redes;
create trigger redes_coordinador after insert on redes for each row execute function al_crear_red();

-- Unirse a una red PÚBLICA (las privadas solo con código, por la función de abajo)
create policy "unirme a red publica" on miembros_red for insert
  with check (perfil_id = auth.uid() and rol = 'miembro'
              and exists (select 1 from redes r where r.id = red_id and not r.privada));

-- Unirse con código de invitación (sirve para redes privadas)
create or replace function unirse_por_codigo(p_codigo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para unirte'; end if;
  select id into r from redes where codigo = upper(trim(p_codigo));
  if r is null then return null; end if;
  insert into miembros_red (red_id, perfil_id, rol) values (r, auth.uid(), 'miembro') on conflict do nothing;
  return r;
end $$;

-- El coordinador puede quitar miembros
create policy "coordinador quita miembros" on miembros_red for delete using (es_coordinador(red_id));

-- Si sale el último coordinador, el miembro más antiguo toma el rol; si no queda nadie, la red se borra
create or replace function tras_salir_red() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from redes where id = old.red_id) then return old; end if;
  if not exists (select 1 from miembros_red where red_id = old.red_id) then
    delete from redes where id = old.red_id;
  elsif not exists (select 1 from miembros_red where red_id = old.red_id and rol = 'coordinador') then
    update miembros_red set rol = 'coordinador'
    where (red_id, perfil_id) = (select red_id, perfil_id from miembros_red where red_id = old.red_id order by unido_en limit 1);
  end if;
  return old;
end $$;
drop trigger if exists miembros_tras_salir on miembros_red;
create trigger miembros_tras_salir after delete on miembros_red for each row execute function tras_salir_red();

-- Alertas: el autor (o un coordinador) la marca como resuelta; nadie puede reescribir lo que otro dijo
create policy "resolver alerta" on mensajes_red for update using (autor_id = auth.uid() or es_coordinador(red_id));
-- Al editar una alerta solo se permite cambiar "resuelta"
create or replace function proteger_mensaje_red() returns trigger language plpgsql as $$
declare resuelta_nueva boolean;
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.resuelta := false;
      new.creado_en := now();
      if new.tipo <> 'sos' then new.ubicacion := null; end if; -- la ubicación solo viaja en un SOS
    else
      resuelta_nueva := new.resuelta;
      new := old;
      new.resuelta := resuelta_nueva;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists mensajes_red_proteger on mensajes_red;
create trigger mensajes_red_proteger before insert or update on mensajes_red for each row execute function proteger_mensaje_red();

-- Quitar mi respuesta a una alerta ("Voy en camino" tocado por error)
create policy "quitar mi respuesta" on respuestas_alerta for delete using (perfil_id = auth.uid());

-- Todo lo que la app necesita de las redes en una sola llamada:
-- mis redes (completas) + redes públicas a ≤ 2 km (sin miembros ni mensajes: solo cuántos son)
create or replace function redes_visibles() returns jsonb
language sql stable security definer set search_path = public as $$
  with yo as (select ubicacion from perfiles where id = auth.uid()),
  r as (
    select rd.*, es_miembro(rd.id) as soy_miembro
    from redes rd join barrios b on b.id = rd.barrio_id cross join yo
    where es_miembro(rd.id) or (not rd.privada and st_dwithin(b.centro, yo.ubicacion, 2000))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'nombre', r.nombre, 'tipo', r.tipo, 'descripcion', r.descripcion,
    'barrio', (select slug from barrios where id = r.barrio_id), 'privada', r.privada,
    'codigo', case when r.soy_miembro then r.codigo end,
    'creador', r.creado_por, 'creado', extract(epoch from r.creado_en) * 1000,
    'total', (select count(*) from miembros_red m where m.red_id = r.id),
    'miembros', case when r.soy_miembro then coalesce((
      select jsonb_agg(jsonb_build_object('usuarioId', m.perfil_id, 'nombre', p.nombre, 'rol', m.rol,
                                          'unido', extract(epoch from m.unido_en) * 1000) order by m.unido_en)
      from miembros_red m join perfiles p on p.id = m.perfil_id where m.red_id = r.id), '[]') else '[]'::jsonb end,
    'mensajes', case when r.soy_miembro then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'autorId', x.autor_id, 'autor', p.nombre, 'tipo', x.tipo, 'texto', x.texto,
        'creado', extract(epoch from x.creado_en) * 1000, 'resuelta', x.resuelta,
        'lat', st_y(x.ubicacion::geometry), 'lng', st_x(x.ubicacion::geometry),
        'respuestas', coalesce((
          select jsonb_agg(jsonb_build_object('usuarioId', ra.perfil_id, 'nombre', pp.nombre, 'accion', ra.accion,
                                              'creado', extract(epoch from ra.creado_en) * 1000) order by ra.creado_en)
          from respuestas_alerta ra join perfiles pp on pp.id = ra.perfil_id where ra.mensaje_id = x.id), '[]')
      ) order by x.creado_en)
      from (select * from mensajes_red where red_id = r.id order by creado_en desc limit 100) x
      join perfiles p on p.id = x.autor_id), '[]') else '[]'::jsonb end
  )), '[]'::jsonb) from r;
$$;

-- ---------- Chat privado ----------
-- Abre (o devuelve) LA conversación entre dos vecinos: siempre una sola por pareja
create or replace function abrir_conversacion(p_id uuid, p_otro uuid, p_publicacion uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para escribir'; end if;
  if p_otro = auth.uid() then raise exception 'No puedes escribirte a ti mismo'; end if;
  if not exists (select 1 from perfiles where id = p_otro) then raise exception 'Ese vecino no existe'; end if;
  insert into conversaciones (id, perfil_a, perfil_b, publicacion_id)
  values (p_id, least(auth.uid(), p_otro), greatest(auth.uid(), p_otro),
          case when exists (select 1 from publicaciones where id = p_publicacion) then p_publicacion end)
  on conflict (perfil_a, perfil_b) do update
    set publicacion_id = coalesce(excluded.publicacion_id, conversaciones.publicacion_id)
  returning id into r;
  return r;
end $$;

-- Mis conversaciones con el nombre del otro vecino y el título de la publicación de origen
create or replace function mis_conversaciones() returns table (
  id uuid, otro uuid, otro_nombre text, publicacion_id uuid, publicacion_titulo text, mi_lectura timestamptz
) language sql stable security definer set search_path = public as $$
  select c.id,
         case when c.perfil_a = auth.uid() then c.perfil_b else c.perfil_a end,
         p.nombre, c.publicacion_id, pub.titulo,
         (select leido_en from lecturas l where l.conversacion_id = c.id and l.perfil_id = auth.uid())
  from conversaciones c
  join perfiles p on p.id = case when c.perfil_a = auth.uid() then c.perfil_b else c.perfil_a end
  left join publicaciones pub on pub.id = c.publicacion_id
  where auth.uid() in (c.perfil_a, c.perfil_b);
$$;

-- Nadie puede cambiar ni la hora ni el autor de un mensaje
create or replace function proteger_mensaje_privado() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then new.creado_en := now(); end if;
  return new;
end $$;
drop trigger if exists mensajes_privados_proteger on mensajes_privados;
create trigger mensajes_privados_proteger before insert on mensajes_privados for each row execute function proteger_mensaje_privado();

-- Fotos del chat: bucket PRIVADO; solo los dos participantes pueden subir y ver (carpeta = id de la conversación)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('chat', 'chat', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "subir foto al chat" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and exists (
    select 1 from conversaciones c where c.id::text = (storage.foldername(name))[1] and auth.uid() in (c.perfil_a, c.perfil_b)));
create policy "ver fotos del chat" on storage.objects for select to authenticated
  using (bucket_id = 'chat' and exists (
    select 1 from conversaciones c where c.id::text = (storage.foldername(name))[1] and auth.uid() in (c.perfil_a, c.perfil_b)));

-- ---------- Tiempo real ----------
-- Supabase Realtime avisa a la app al instante de SOS, respuestas y mensajes nuevos.
-- Respeta las reglas RLS: cada vecino solo recibe lo que puede leer.
alter publication supabase_realtime add table mensajes_red, respuestas_alerta, miembros_red, mensajes_privados, conversaciones;

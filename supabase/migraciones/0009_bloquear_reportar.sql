-- RedCity · 0009 · Bloquear y reportar vecinos
-- Un vecino puede bloquear a otro: dejan de verse en el feed y no pueden escribirse, comentarse ni
-- contratarse. Las redes de seguridad NO se filtran: un SOS nunca puede depender de un bloqueo.
-- Los reportes de personas o chats quedan pendientes en `reportes_usuario` para revisión humana.

-- ---------- 1. Bloqueos ----------
create table if not exists bloqueos (
  bloqueador uuid not null references perfiles on delete cascade,
  bloqueado  uuid not null references perfiles on delete cascade,
  creado_en  timestamptz not null default now(),
  primary key (bloqueador, bloqueado),
  check (bloqueador <> bloqueado)
);
create index if not exists bloqueos_bloqueado_idx on bloqueos (bloqueado);
alter table bloqueos enable row level security;
create policy "ver mis bloqueos" on bloqueos for select using (bloqueador = auth.uid());
create policy "bloquear" on bloqueos for insert with check (bloqueador = auth.uid());
create policy "desbloquear" on bloqueos for delete using (bloqueador = auth.uid());
grant select, insert, delete on bloqueos to authenticated;

-- ¿Hay un bloqueo entre dos vecinos, en cualquier sentido? Solo la usa el servidor:
-- nadie debe poder averiguar a quién bloqueó otra persona.
create or replace function hay_bloqueo(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bloqueos
                 where (bloqueador = p_a and bloqueado = p_b) or (bloqueador = p_b and bloqueado = p_a));
$$;
revoke execute on function hay_bloqueo(uuid, uuid) from public, anon, authenticated;

-- Mis bloqueados con su nombre, para poder desbloquearlos desde el perfil
create or replace function mis_bloqueos() returns table (bloqueado uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select b.bloqueado, p.nombre from bloqueos b join perfiles p on p.id = b.bloqueado where b.bloqueador = auth.uid();
$$;

-- ---------- 2. Reportes de personas y chats ----------
create table if not exists reportes_usuario (
  id              uuid primary key default gen_random_uuid(),
  reportado_id    uuid not null references perfiles on delete cascade,
  reportado_por   uuid not null references perfiles on delete cascade,
  conversacion_id uuid references conversaciones on delete set null,
  motivo          text not null check (motivo in ('estafa', 'falso', 'discriminacion', 'ofensivo', 'peligroso', 'otro')),
  detalle         text not null default '' check (char_length(detalle) <= 500),
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'revisado', 'descartado')),
  creado_en       timestamptz not null default now(),
  unique (reportado_id, reportado_por),
  check (reportado_id <> reportado_por)
);
create index if not exists reportes_usuario_pendientes_idx on reportes_usuario (estado, creado_en);
alter table reportes_usuario enable row level security;
-- Solo se ven los propios (para no reportar dos veces); los revisa el equipo desde el panel de Supabase
create policy "ver mis reportes de vecinos" on reportes_usuario for select using (reportado_por = auth.uid());
create policy "reportar vecino" on reportes_usuario for insert with check (
  reportado_por = auth.uid() and estado = 'pendiente' and (
    conversacion_id is null or exists (
      select 1 from conversaciones c
      where c.id = conversacion_id and auth.uid() in (c.perfil_a, c.perfil_b)
        and reportado_id in (c.perfil_a, c.perfil_b))));
grant select, insert on reportes_usuario to authenticated;

-- ---------- 3. El servidor hace cumplir el bloqueo ----------
create or replace function abrir_conversacion(p_id uuid, p_otro uuid, p_publicacion uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para escribir'; end if;
  if p_otro = auth.uid() then raise exception 'No puedes escribirte a ti mismo'; end if;
  if not exists (select 1 from perfiles where id = p_otro) then raise exception 'Ese vecino no existe'; end if;
  if hay_bloqueo(auth.uid(), p_otro) then raise exception 'No puedes escribirle a este vecino'; end if;
  insert into conversaciones (id, perfil_a, perfil_b, publicacion_id)
  values (p_id, least(auth.uid(), p_otro), greatest(auth.uid(), p_otro),
          case when exists (select 1 from publicaciones where id = p_publicacion) then p_publicacion end)
  on conflict (perfil_a, perfil_b) do update
    set publicacion_id = coalesce(excluded.publicacion_id, conversaciones.publicacion_id)
  returning id into r;
  return r;
end $$;

create or replace function validar_mensaje_no_bloqueado() returns trigger
language plpgsql security definer set search_path = public as $$
declare c conversaciones;
begin
  select * into c from conversaciones where id = new.conversacion_id;
  if hay_bloqueo(c.perfil_a, c.perfil_b) then raise exception 'No puedes escribirle a este vecino'; end if;
  return new;
end $$;
drop trigger if exists mensajes_privados_no_bloqueados on mensajes_privados;
create trigger mensajes_privados_no_bloqueados before insert on mensajes_privados
  for each row execute function validar_mensaje_no_bloqueado();

create or replace function validar_respuesta_no_bloqueada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if hay_bloqueo(new.autor_id, (select autor_id from publicaciones where id = new.publicacion_id)) then
    raise exception 'No puedes comentar en esta publicación';
  end if;
  return new;
end $$;
drop trigger if exists respuestas_no_bloqueadas on respuestas;
create trigger respuestas_no_bloqueadas before insert on respuestas
  for each row execute function validar_respuesta_no_bloqueada();

-- También cubre contratar_oferta(), que crea la postulación por dentro
create or replace function validar_postulacion_no_bloqueada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if hay_bloqueo(new.proveedor_id, (select autor_id from publicaciones where id = new.publicacion_id)) then
    raise exception 'No puedes contratar ni postularte con este vecino';
  end if;
  return new;
end $$;
drop trigger if exists postulaciones_no_bloqueadas on postulaciones;
create trigger postulaciones_no_bloqueadas before insert on postulaciones
  for each row execute function validar_postulacion_no_bloqueada();

-- ---------- 4. El feed oculta lo de los vecinos bloqueados ----------
-- Se mantienen visibles los servicios en los que ya participo (para poder cerrarlos o cancelarlos).
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
                   from respuestas r join perfiles rp on rp.id = r.autor_id
                   where r.publicacion_id = p.id and not hay_bloqueo(auth.uid(), r.autor_id)), '[]')
  from publicaciones p
  join perfiles pf on pf.id = p.autor_id
  join barrios b on b.id = p.barrio_id
  cross join yo
  where (not p.oculta or p.autor_id = auth.uid())
    and (p.expira_en is null or p.expira_en > now() or p.autor_id = auth.uid())
    and (coalesce(p.datos->>'privado', 'false') <> 'true' or es_participante_servicio(p.id))
    and (not hay_bloqueo(auth.uid(), p.autor_id) or (p.categoria = 'servicio' and es_participante_servicio(p.id)))
    and (st_dwithin(p.ubicacion, yo.ubicacion, least(greatest(p_radio_m, 200), 10000))
         -- mis servicios (como cliente o proveedor) aparecen aunque estén lejos
         or (p.categoria = 'servicio' and es_participante_servicio(p.id)))
  order by p.creado_en desc
  limit least(p_limite, 500);
$$;

-- RedCity · 0013 · Avisos (campanita 🔔) y notificaciones de actividad y seguridad
-- La base de datos crea un aviso cuando:
--   • alguien comenta tu publicación                       → campanita + notificación
--   • alguien envía una propuesta a tu servicio            → campanita + notificación
--   • aceptan tu propuesta                                 → campanita + notificación
--   • a alguien le gusta tu publicación                    → solo campanita (para no llenar el celular)
--   • publican una alerta de seguridad a menos de 1 km     → urgente: campanita + notificación; precaución: solo campanita
-- Nunca avisa de lo que hace uno mismo ni entre vecinos bloqueados. Solo agrega: no borra nada.

-- ---------- 1. Tabla ----------
create table if not exists avisos (
  id             uuid primary key default gen_random_uuid(),
  perfil_id      uuid not null references perfiles on delete cascade,
  tipo           text not null check (tipo in ('comentario', 'propuesta', 'propuesta_aceptada', 'me_gusta', 'seguridad')),
  titulo         text not null,
  cuerpo         text not null default '',
  publicacion_id uuid references publicaciones on delete cascade,
  actor_id       uuid references perfiles on delete set null,
  push           boolean not null default true,
  leido          boolean not null default false,
  creado_en      timestamptz not null default now()
);
create index if not exists avisos_perfil_idx on avisos (perfil_id, creado_en desc);
alter table avisos enable row level security;
revoke all on avisos from anon, authenticated;
grant select on avisos to authenticated;
drop policy if exists "mis avisos" on avisos;
create policy "mis avisos" on avisos for select using (perfil_id = auth.uid());

do $$ begin
  alter publication supabase_realtime add table avisos;
exception when duplicate_object then null;
end $$;

-- ---------- 2. Marcar como leídos (solo los míos) ----------
create or replace function marcar_avisos_leidos() returns void
language sql security definer set search_path = public as $$
  update avisos set leido = true where perfil_id = auth.uid() and not leido;
$$;
grant execute on function marcar_avisos_leidos() to authenticated;

-- ---------- 3. Crear un aviso (uso interno de los triggers) ----------
create or replace function crear_aviso(p_para uuid, p_tipo text, p_titulo text, p_cuerpo text,
                                       p_publicacion uuid, p_actor uuid, p_push boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_para is null or p_para = p_actor then return; end if;
  if p_actor is not null and hay_bloqueo(p_para, p_actor) then return; end if;
  insert into avisos (perfil_id, tipo, titulo, cuerpo, publicacion_id, actor_id, push)
  values (p_para, p_tipo, left(p_titulo, 120), left(coalesce(p_cuerpo, ''), 160), p_publicacion, p_actor, p_push);
end $$;
revoke execute on function crear_aviso(uuid, text, text, text, uuid, uuid, boolean) from public, anon, authenticated;

create or replace function nombre_de(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nombre from perfiles where id = p_id), 'Un vecino');
$$;
revoke execute on function nombre_de(uuid) from public, anon, authenticated;

-- ---------- 4. Comentarios ----------
create or replace function aviso_comentario() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select autor_id, titulo into p from publicaciones where id = new.publicacion_id;
  perform crear_aviso(p.autor_id, 'comentario', '💬 ' || nombre_de(new.autor_id) || ' comentó tu publicación',
                      p.titulo, new.publicacion_id, new.autor_id, true);
  return new;
exception when others then return new;  -- un aviso nunca puede impedir comentar
end $$;
create or replace trigger respuestas_aviso after insert on respuestas
  for each row execute function aviso_comentario();

-- ---------- 5. Propuestas a servicios ----------
create or replace function aviso_propuesta() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select autor_id, titulo into p from publicaciones where id = new.publicacion_id;
  if tg_op = 'INSERT' then
    perform crear_aviso(p.autor_id, 'propuesta', '💼 ' || nombre_de(new.proveedor_id) || ' te envió una propuesta',
                        p.titulo, new.publicacion_id, new.proveedor_id, true);
  elsif new.estado = 'aceptada' and old.estado is distinct from 'aceptada' then
    perform crear_aviso(new.proveedor_id, 'propuesta_aceptada', '✅ ¡Aceptaron tu propuesta!',
                        p.titulo, new.publicacion_id, p.autor_id, true);
  end if;
  return new;
exception when others then return new;
end $$;
create or replace trigger postulaciones_aviso after insert or update of estado on postulaciones
  for each row execute function aviso_propuesta();

-- ---------- 6. Me gusta (solo campanita, uno por vecino y publicación) ----------
create or replace function aviso_me_gusta() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if exists (select 1 from avisos where tipo = 'me_gusta' and publicacion_id = new.publicacion_id and actor_id = new.perfil_id) then
    return new;
  end if;
  select autor_id, titulo into p from publicaciones where id = new.publicacion_id;
  perform crear_aviso(p.autor_id, 'me_gusta', '👍 A ' || nombre_de(new.perfil_id) || ' le gusta tu publicación',
                      p.titulo, new.publicacion_id, new.perfil_id, false);
  return new;
exception when others then return new;
end $$;
create or replace trigger me_gusta_aviso after insert on me_gusta
  for each row execute function aviso_me_gusta();

-- ---------- 7. Alertas de seguridad a menos de 1 km ----------
create or replace function aviso_seguridad() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nivel text := coalesce(new.datos->>'nivel', '');
  v record;
begin
  if new.categoria <> 'seguridad' or v_nivel not in ('urgente', 'precaucion') or new.oculta then return new; end if;
  for v in
    select id from perfiles
    where id <> new.autor_id and st_dwithin(ubicacion, new.ubicacion, 1000)
    limit 2000
  loop
    perform crear_aviso(v.id, 'seguridad',
                        case when v_nivel = 'urgente' then '🚨 Alerta urgente cerca de ti' else '⚠️ Precaución cerca de ti' end,
                        new.titulo, new.id, new.autor_id, v_nivel = 'urgente');
  end loop;
  return new;
exception when others then return new;
end $$;
create or replace trigger publicaciones_aviso_seguridad after insert on publicaciones
  for each row execute function aviso_seguridad();

-- ---------- 8. Enviar al celular los avisos que lo piden ----------
create or replace trigger avisos_push after insert on avisos
  for each row when (new.push) execute function avisar_push('aviso');

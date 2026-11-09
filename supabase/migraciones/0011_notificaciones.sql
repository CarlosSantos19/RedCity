-- RedCity · 0011 · Notificaciones push (SOS y mensajes privados)
-- Cada celular guarda aquí su suscripción. Cuando entra un SOS o un mensaje privado, la base de datos
-- llama a la función "enviar-push" (supabase/functions/enviar-push), que envía el aviso.
-- Solo agrega reglas y tablas: no borra nada.

create extension if not exists pg_net;

-- ---------- 1. Suscripciones de cada celular ----------
create table if not exists suscripciones_push (
  endpoint  text primary key,
  perfil_id uuid not null references perfiles on delete cascade,
  p256dh    text not null,
  auth      text not null,
  creado_en timestamptz not null default now()
);
create index if not exists suscripciones_push_perfil_idx on suscripciones_push (perfil_id);
alter table suscripciones_push enable row level security;
revoke all on suscripciones_push from anon, authenticated;
-- Sin políticas: solo se usa mediante las dos funciones de abajo y desde el servidor

-- Si en un celular entra otra persona, la suscripción pasa a la cuenta nueva
create or replace function guardar_suscripcion_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then raise exception 'Suscripción no válida'; end if;
  insert into suscripciones_push (endpoint, perfil_id, p256dh, auth)
  values (p_endpoint, auth.uid(), left(p_p256dh, 200), left(p_auth, 100))
  on conflict (endpoint) do update set perfil_id = excluded.perfil_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function quitar_suscripcion_push(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from suscripciones_push where endpoint = p_endpoint and perfil_id = auth.uid();
$$;

-- ---------- 2. Ajustes privados: solo los lee el servidor ----------
create table if not exists ajustes_internos (clave text primary key, valor text not null);
alter table ajustes_internos enable row level security;
revoke all on ajustes_internos from anon, authenticated;
insert into ajustes_internos (clave, valor)
values ('secreto_push', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (clave) do nothing;

-- ---------- 3. Avisar a la función cuando llega algo ----------
-- Si el aviso falla, el SOS o el mensaje se guardan igual: nunca puede bloquearse por esto.
create or replace function avisar_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_secreto text;
begin
  select valor into v_secreto from ajustes_internos where clave = 'secreto_push';
  perform net.http_post(
    url := 'https://wkjtlkknkbcrveuoubbd.supabase.co/functions/v1/enviar-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-redcity-secreto', v_secreto),
    body := jsonb_build_object('tipo', tg_argv[0], 'id', new.id));
  return new;
exception when others then
  return new;
end $$;

create or replace trigger mensajes_red_push after insert on mensajes_red
  for each row when (new.tipo = 'sos') execute function avisar_push('sos');
create or replace trigger mensajes_privados_push after insert on mensajes_privados
  for each row execute function avisar_push('chat');

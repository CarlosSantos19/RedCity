-- =====================================================================
-- RedCity · Migración 0004 · Etapa 2b
-- Servicios compartidos: propuestas, contratación, pagos (simulados hasta
-- conectar la pasarela), confirmación, cancelación y calificaciones.
-- El estado del servicio y el dinero los maneja SOLO el servidor.
-- Ejecutar UNA vez en Supabase → SQL Editor, después de 0003.
-- =====================================================================

-- CORRECCIÓN de schema.sql: la llave de calificaciones era solo el pago, así que cliente y
-- proveedor no podían calificarse mutuamente. Ahora es (pago, quien califica).
alter table calificaciones drop constraint if exists calificaciones_pkey;
alter table calificaciones add primary key (pago_id, de_id);
-- Las calificaciones se crean solo por la función calificar() (que calcula a quién se califica)
drop policy if exists "calificar" on calificaciones;

-- Costo estimado de la pasarela (lo paga el cliente). Reemplazar por la tarifa real contratada.
insert into configuracion values ('pasarela_porcentaje', 0.03), ('pasarela_fijo', 800) on conflict (clave) do nothing;

-- Utilidad: la publicación de servicio, bloqueada para cambiarla de forma segura
create or replace function _servicio(p_id uuid) returns publicaciones
language sql security definer set search_path = public as $$
  select * from publicaciones where id = p_id and categoria = 'servicio' for update;
$$;

-- ---------- Propuestas ----------
create or replace function postular(p_publicacion uuid, p_precio bigint, p_mensaje text) returns uuid
language plpgsql security definer set search_path = public as $$
declare p publicaciones; r uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  p := _servicio(p_publicacion);
  if p.id is null or p.datos->>'modo' <> 'necesito' then raise exception 'Esa publicación no recibe propuestas'; end if;
  if p.datos->>'estado' <> 'abierta' then raise exception 'Ese servicio ya fue asignado'; end if;
  if p.autor_id = auth.uid() then raise exception 'No puedes postularte a tu propia publicación'; end if;
  if p_precio is null or p_precio <= 0 then raise exception 'Escribe un precio válido'; end if;
  insert into postulaciones (publicacion_id, proveedor_id, precio_cop, mensaje)
  values (p_publicacion, auth.uid(), p_precio, left(coalesce(p_mensaje, ''), 500))
  on conflict (publicacion_id, proveedor_id) do update set precio_cop = excluded.precio_cop, mensaje = excluded.mensaje
  returning id into r;
  return r;
end $$;

-- Propuestas que puedo ver: todas las de mis publicaciones + las mías
create or replace function postulaciones_visibles(p_ids uuid[]) returns table (
  id uuid, publicacion_id uuid, proveedor_id uuid, proveedor text, verificado boolean,
  precio bigint, mensaje text, estado text, creado_en timestamptz
) language sql stable security definer set search_path = public as $$
  select po.id, po.publicacion_id, po.proveedor_id, pf.nombre, pf.verificado, po.precio_cop, po.mensaje, po.estado, po.creado_en
  from postulaciones po
  join publicaciones pub on pub.id = po.publicacion_id
  join perfiles pf on pf.id = po.proveedor_id
  where po.publicacion_id = any(p_ids) and (pub.autor_id = auth.uid() or po.proveedor_id = auth.uid())
  order by po.creado_en;
$$;

-- ---------- Contratación ----------
create or replace function contratar(p_postulacion uuid) returns void
language plpgsql security definer set search_path = public as $$
declare po postulaciones; p publicaciones;
begin
  select * into po from postulaciones where id = p_postulacion;
  if po.id is null then raise exception 'La propuesta no existe'; end if;
  p := _servicio(po.publicacion_id);
  if p.id is null or p.autor_id <> auth.uid() then raise exception 'Solo quien publicó puede contratar'; end if;
  if p.datos->>'estado' <> 'abierta' then raise exception 'Este servicio ya fue asignado'; end if;
  update postulaciones set estado = 'aceptada' where id = po.id;
  update publicaciones set datos = datos || jsonb_build_object('estado', 'asignada', 'asignadoId', po.id) where id = p.id;
end $$;

-- Contratar directo a quien publicó "Ofrezco": crea una contratación PRIVADA (no sale en el feed)
create or replace function contratar_oferta(p_oferta uuid, p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare o publicaciones; yo perfiles; po uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  select * into o from publicaciones where id = p_oferta and categoria = 'servicio';
  if o.id is null or o.datos->>'modo' <> 'ofrezco' then raise exception 'Esa oferta no existe'; end if;
  if o.autor_id = auth.uid() then raise exception 'No puedes contratarte a ti mismo'; end if;
  if coalesce((o.datos->>'valor')::bigint, 0) <= 0 then raise exception 'Esta oferta es a convenir: escríbele primero'; end if;
  select * into yo from perfiles where id = auth.uid();
  insert into publicaciones (id, autor_id, barrio_id, categoria, titulo, descripcion, ubicacion, datos)
  values (p_id, auth.uid(), yo.barrio_id, 'servicio', left('Contratación: ' || o.titulo, 80),
          'Contratado desde la oferta publicada.', (select centro from barrios where id = yo.barrio_id),
          jsonb_build_object('modo', 'necesito', 'rubro', o.datos->>'rubro', 'valor', (o.datos->>'valor')::bigint,
                             'unidad', o.datos->>'unidad', 'frecuencia', 'una-vez', 'dia', '', 'estado', 'abierta',
                             'realizados', 0, 'privado', true, 'ofertaId', o.id));
  insert into postulaciones (publicacion_id, proveedor_id, precio_cop, mensaje, estado)
  values (p_id, o.autor_id, (o.datos->>'valor')::bigint, 'Contratado desde su oferta publicada.', 'aceptada')
  returning id into po;
  update publicaciones set datos = datos || jsonb_build_object('estado', 'asignada', 'asignadoId', po) where id = p_id;
  return p_id;
end $$;

-- ---------- Pagos (SIMULADOS: en producción los crea el webhook de la pasarela) ----------
create or replace function pagar_servicio(p_publicacion uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare p publicaciones; po postulaciones; r uuid; pct numeric; pas bigint;
begin
  p := _servicio(p_publicacion);
  if p.id is null or p.autor_id <> auth.uid() then raise exception 'Solo el cliente puede pagar'; end if;
  if p.datos->>'estado' <> 'asignada' then raise exception 'Este servicio no está listo para pagar'; end if;
  select * into po from postulaciones where id = (p.datos->>'asignadoId')::uuid;
  if exists (select 1 from pagos where publicacion_id = p.id and estado = 'retenido') then raise exception 'Ya hay un pago retenido'; end if;
  select valor into pct from configuracion where clave = 'comision_servicios';
  pas := round(po.precio_cop * (select valor from configuracion where clave = 'pasarela_porcentaje')
               + (select valor from configuracion where clave = 'pasarela_fijo'));
  insert into pagos (publicacion_id, postulacion_id, cliente_id, proveedor_id, valor_cop, comision_pct, pasarela_cop, estado, pasarela)
  values (p.id, po.id, p.autor_id, po.proveedor_id, po.precio_cop, pct, pas, 'retenido', 'simulada')
  returning id into r;
  update publicaciones set datos = datos || jsonb_build_object('estado', 'pagada') where id = p.id;
  return r;
end $$;

-- El cliente confirma: se libera el pago (98 % al proveedor, 2 % a RedCity)
create or replace function confirmar_servicio(p_publicacion uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p publicaciones;
begin
  p := _servicio(p_publicacion);
  if p.id is null or p.autor_id <> auth.uid() then raise exception 'Solo el cliente puede confirmar'; end if;
  if p.datos->>'estado' <> 'pagada' then raise exception 'No hay un pago retenido para liberar'; end if;
  update pagos set estado = 'liberado', liberado_en = now() where publicacion_id = p.id and estado = 'retenido';
  update publicaciones set datos = datos || jsonb_build_object(
    'realizados', coalesce((datos->>'realizados')::int, 0) + 1,
    -- los servicios recurrentes vuelven a "asignada" para pagar la siguiente vez
    'estado', case when datos->>'frecuencia' = 'una-vez' then 'completada' else 'asignada' end) where id = p.id;
end $$;

-- Cancelar: si había pago retenido se reembolsa completo
create or replace function cancelar_servicio(p_publicacion uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p publicaciones;
begin
  p := _servicio(p_publicacion);
  if p.id is null or p.autor_id <> auth.uid() then raise exception 'Solo el cliente puede cancelar'; end if;
  if p.datos->>'estado' not in ('abierta', 'asignada', 'pagada') then raise exception 'Este servicio ya no se puede cancelar'; end if;
  update pagos set estado = 'reembolsado' where publicacion_id = p.id and estado = 'retenido';
  update publicaciones set datos = datos || jsonb_build_object('estado', 'cancelada') where id = p.id;
end $$;

-- El autor no puede cambiar a mano el estado del servicio ni el contratado (solo por las funciones de arriba)
create or replace function proteger_estado_servicio() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and new.categoria = 'servicio' then
    if tg_op = 'INSERT' then
      new.datos := (new.datos - 'asignadoId' - 'privado') || jsonb_build_object('estado', 'abierta', 'realizados', 0);
    else
      new.datos := new.datos || jsonb_build_object(
        'estado', old.datos->'estado', 'asignadoId', old.datos->'asignadoId',
        'realizados', old.datos->'realizados', 'privado', old.datos->'privado');
      new.datos := jsonb_strip_nulls(new.datos);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists publicaciones_estado_servicio on publicaciones;
create trigger publicaciones_estado_servicio before insert or update on publicaciones for each row execute function proteger_estado_servicio();

-- Mis pagos (como cliente o proveedor) con el título del servicio y el nombre del proveedor
create or replace function mis_pagos() returns table (
  id uuid, publicacion_id uuid, titulo text, cliente_id uuid, proveedor_id uuid, proveedor text,
  valor bigint, pasarela bigint, total bigint, comision bigint, neto bigint, estado text, creado_en timestamptz
) language sql stable security definer set search_path = public as $$
  select pg.id, pg.publicacion_id, pub.titulo, pg.cliente_id, pg.proveedor_id, pf.nombre,
         pg.valor_cop, pg.pasarela_cop, pg.total_cop, pg.comision_cop, pg.neto_proveedor_cop, pg.estado, pg.creado_en
  from pagos pg join publicaciones pub on pub.id = pg.publicacion_id join perfiles pf on pf.id = pg.proveedor_id
  where auth.uid() in (pg.cliente_id, pg.proveedor_id)
  order by pg.creado_en desc;
$$;

-- ---------- Calificaciones verificadas ----------
create or replace function calificar(p_pago uuid, p_estrellas int, p_comentario text) returns void
language plpgsql security definer set search_path = public as $$
declare pg pagos;
begin
  select * into pg from pagos where id = p_pago;
  if pg.id is null or pg.estado <> 'liberado' then raise exception 'Solo puedes calificar servicios pagados y confirmados'; end if;
  if auth.uid() not in (pg.cliente_id, pg.proveedor_id) then raise exception 'No participaste en este servicio'; end if;
  if p_estrellas not between 1 and 5 then raise exception 'Elige de 1 a 5 estrellas'; end if;
  insert into calificaciones (pago_id, de_id, para_id, estrellas, comentario)
  values (pg.id, auth.uid(), case when auth.uid() = pg.cliente_id then pg.proveedor_id else pg.cliente_id end,
          p_estrellas, left(coalesce(p_comentario, ''), 300));
exception when unique_violation then raise exception 'Ya calificaste este servicio';
end $$;

create or replace function calificaciones_de(p_ids uuid[]) returns table (
  pago_id uuid, de_id uuid, de_nombre text, para_id uuid, estrellas int, comentario text, creado_en timestamptz
) language sql stable security definer set search_path = public as $$
  select c.pago_id, c.de_id, pf.nombre, c.para_id, c.estrellas, c.comentario, c.creado_en
  from calificaciones c join perfiles pf on pf.id = c.de_id
  where c.para_id = any(p_ids) order by c.creado_en desc;
$$;

-- ---------- Feed: las contrataciones privadas no salen para los demás ----------
create or replace function es_participante_servicio(p_pub uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from publicaciones where id = p_pub and autor_id = auth.uid())
      or exists (select 1 from postulaciones where publicacion_id = p_pub and proveedor_id = auth.uid());
$$;

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
    and (coalesce(p.datos->>'privado', 'false') <> 'true' or es_participante_servicio(p.id))
    and (st_dwithin(p.ubicacion, yo.ubicacion, least(greatest(p_radio_m, 200), 10000))
         -- mis servicios (como cliente o proveedor) aparecen aunque estén lejos
         or (p.categoria = 'servicio' and es_participante_servicio(p.id)))
  order by p.creado_en desc
  limit least(p_limite, 500);
$$;

-- ---------- Tiempo real: avisar de propuestas y pagos ----------
alter publication supabase_realtime add table postulaciones, pagos;

-- =====================================================================
-- RedCity · Migración 0005 · Eliminar mi cuenta
-- Google Play exige que quien crea una cuenta pueda borrarla desde la app.
-- Ley 1581 de 2012: derecho a la supresión de los datos personales.
-- Ejecutar UNA vez en Supabase → SQL Editor, después de 0004.
-- =====================================================================

-- Qué pasa con cada dato al borrar una cuenta:
-- · Pagos: se CONSERVAN sin la persona (registro contable obligatorio de la comisión).
alter table pagos alter column cliente_id drop not null;
alter table pagos alter column proveedor_id drop not null;
alter table pagos alter column publicacion_id drop not null;
alter table pagos alter column postulacion_id drop not null;
alter table pagos drop constraint if exists pagos_cliente_id_fkey,
  add constraint pagos_cliente_id_fkey foreign key (cliente_id) references perfiles on delete set null;
alter table pagos drop constraint if exists pagos_proveedor_id_fkey,
  add constraint pagos_proveedor_id_fkey foreign key (proveedor_id) references perfiles on delete set null;
alter table pagos drop constraint if exists pagos_publicacion_id_fkey,
  add constraint pagos_publicacion_id_fkey foreign key (publicacion_id) references publicaciones on delete set null;
alter table pagos drop constraint if exists pagos_postulacion_id_fkey,
  add constraint pagos_postulacion_id_fkey foreign key (postulacion_id) references postulaciones on delete set null;

-- · Calificaciones dadas o recibidas y reportes hechos: se borran.
alter table calificaciones drop constraint if exists calificaciones_de_id_fkey,
  add constraint calificaciones_de_id_fkey foreign key (de_id) references perfiles on delete cascade;
alter table calificaciones drop constraint if exists calificaciones_para_id_fkey,
  add constraint calificaciones_para_id_fkey foreign key (para_id) references perfiles on delete cascade;
alter table reportes drop constraint if exists reportes_reportado_por_fkey,
  add constraint reportes_reportado_por_fkey foreign key (reportado_por) references perfiles on delete cascade;

-- · Redes que creó y promociones que pagó: quedan sin autor (la red sigue para sus miembros).
alter table redes alter column creado_por drop not null;
alter table redes drop constraint if exists redes_creado_por_fkey,
  add constraint redes_creado_por_fkey foreign key (creado_por) references perfiles on delete set null;
alter table promociones alter column autor_id drop not null;
alter table promociones drop constraint if exists promociones_autor_id_fkey,
  add constraint promociones_autor_id_fkey foreign key (autor_id) references perfiles on delete set null;

-- · Todo lo demás (perfil, publicaciones, comentarios, me gusta, chats, membresías, negocios,
--   historias, reels, notas, verificaciones…) ya se borra en cascada con el perfil.

-- El historial de pagos sigue mostrando los pagos aunque la otra persona haya borrado su cuenta
create or replace function mis_pagos() returns table (
  id uuid, publicacion_id uuid, titulo text, cliente_id uuid, proveedor_id uuid, proveedor text,
  valor bigint, pasarela bigint, total bigint, comision bigint, neto bigint, estado text, creado_en timestamptz
) language sql stable security definer set search_path = public as $$
  select pg.id, pg.publicacion_id, coalesce(pub.titulo, 'Servicio'), pg.cliente_id, pg.proveedor_id,
         coalesce(pf.nombre, 'Cuenta eliminada'),
         pg.valor_cop, pg.pasarela_cop, pg.total_cop, pg.comision_cop, pg.neto_proveedor_cop, pg.estado, pg.creado_en
  from pagos pg
  left join publicaciones pub on pub.id = pg.publicacion_id
  left join perfiles pf on pf.id = pg.proveedor_id
  where auth.uid() in (pg.cliente_id, pg.proveedor_id)
  order by pg.creado_en desc;
$$;

-- Quien envió fotos al chat puede borrarlas (lo usa la app al eliminar la cuenta)
create policy "borrar mis fotos del chat" on storage.objects for delete to authenticated
  using (bucket_id = 'chat' and owner = auth.uid());

-- Eliminar mi cuenta: borra el usuario de Auth y, en cascada, todos sus datos personales.
-- (La app borra antes sus archivos de Storage, que solo se pueden borrar por la API de Storage.)
create or replace function eliminar_mi_cuenta() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión para eliminar tu cuenta'; end if;
  -- Los servicios en curso de esta persona se cancelan (y su pago retenido se reembolsa) antes de borrar
  update pagos set estado = 'reembolsado'
  where estado = 'retenido' and (cliente_id = auth.uid() or proveedor_id = auth.uid());
  delete from auth.users where id = auth.uid();
end $$;

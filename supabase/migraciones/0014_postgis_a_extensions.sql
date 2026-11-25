-- 0014: mover PostGIS del esquema public al esquema extensions.
--
-- Por qué: Supabase avisó "Table publicly accessible" (rls_disabled_in_public) por spatial_ref_sys,
-- una tabla de PostGIS. Como PostGIS está en public, la API pública podía modificar o borrar esa tabla
-- (y con ella los sistemas de coordenadas que usan las distancias). El soporte de Supabase recomienda
-- mover la extensión a "extensions", que la API no expone. PostGIS no se puede mover en sitio, así que:
--   1. Se guardan las 9 columnas de ubicación en formato binario exacto (EWKB) y se quitan sus índices.
--   2. Se borra PostGIS y se vuelve a crear en el esquema extensions.
--   3. Se devuelven las columnas a geography (mismos valores, bit a bit) y se recrean los índices.
--   4. Las funciones de la app que fijan search_path = public pasan a "public, extensions"
--      para seguir encontrando ST_DWithin, ST_Distance, geography, etc.
-- Todo va en una sola transacción: si algo falla, no cambia nada.
--
-- IMPORTANTE para migraciones futuras: las funciones nuevas deben usar
--   set search_path = public, extensions
-- (no solo "public"), o no encontrarán las funciones de PostGIS.

begin;

-- 0. Si PostGIS ya está en extensions (migración ya aplicada), no hacer nada
do $$ begin
  if (select extnamespace::regnamespace::text from pg_extension where extname = 'postgis') = 'extensions' then
    raise exception 'PostGIS ya está en el esquema extensions: esta migración ya se aplicó.';
  end if;
end $$;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- 1. Quitar índices geográficos y pasar las columnas a binario exacto
drop index if exists public.barrios_limite_idx;
drop index if exists public.publicaciones_ubicacion_idx;
drop index if exists public.historias_ubicacion_idx;
drop index if exists public.reels_ubicacion_idx;
drop index if exists public.empresas_ubicacion_idx;

alter table public.barrios       alter column centro    type bytea using st_asewkb(centro::geometry);
alter table public.barrios       alter column limite    type bytea using st_asewkb(limite::geometry);
alter table public.perfiles      alter column ubicacion type bytea using st_asewkb(ubicacion::geometry);
alter table public.publicaciones alter column ubicacion type bytea using st_asewkb(ubicacion::geometry);
alter table public.mensajes_red  alter column ubicacion type bytea using st_asewkb(ubicacion::geometry);
alter table public.historias     alter column ubicacion type bytea using st_asewkb(ubicacion::geometry);
alter table public.reels         alter column ubicacion type bytea using st_asewkb(ubicacion::geometry);
alter table public.notas         alter column ubicacion type bytea using st_asewkb(ubicacion::geometry);
alter table public.empresas      alter column ubicacion type bytea using st_asewkb(ubicacion::geometry);

-- 2. Reinstalar PostGIS en el esquema extensions.
--    Sin "cascade" a propósito: si algo no previsto aún depende de PostGIS, falla y se deshace todo.
drop extension postgis;
create extension postgis schema extensions;

-- 3. Devolver las columnas a geography e índices
alter table public.barrios       alter column centro    type extensions.geography(Point, 4326)        using extensions.st_geomfromewkb(centro)::extensions.geography;
alter table public.barrios       alter column limite    type extensions.geography(MultiPolygon, 4326) using extensions.st_geomfromewkb(limite)::extensions.geography;
alter table public.perfiles      alter column ubicacion type extensions.geography(Point, 4326)        using extensions.st_geomfromewkb(ubicacion)::extensions.geography;
alter table public.publicaciones alter column ubicacion type extensions.geography(Point, 4326)        using extensions.st_geomfromewkb(ubicacion)::extensions.geography;
alter table public.mensajes_red  alter column ubicacion type extensions.geography(Point, 4326)        using extensions.st_geomfromewkb(ubicacion)::extensions.geography;
alter table public.historias     alter column ubicacion type extensions.geography(Point, 4326)        using extensions.st_geomfromewkb(ubicacion)::extensions.geography;
alter table public.reels         alter column ubicacion type extensions.geography(Point, 4326)        using extensions.st_geomfromewkb(ubicacion)::extensions.geography;
alter table public.notas         alter column ubicacion type extensions.geography(Point, 4326)        using extensions.st_geomfromewkb(ubicacion)::extensions.geography;
alter table public.empresas      alter column ubicacion type extensions.geography(Point, 4326)        using extensions.st_geomfromewkb(ubicacion)::extensions.geography;

create index barrios_limite_idx          on public.barrios       using gist (limite);
create index publicaciones_ubicacion_idx on public.publicaciones using gist (ubicacion);
create index historias_ubicacion_idx     on public.historias     using gist (ubicacion);
create index reels_ubicacion_idx         on public.reels         using gist (ubicacion);
create index empresas_ubicacion_idx      on public.empresas      using gist (ubicacion);

-- 4. Funciones de la app: search_path = public, extensions
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and 'search_path=public' = any (p.proconfig)
  loop
    execute format('alter function %s set search_path = public, extensions', f);
  end loop;
end $$;

commit;

-- Comprobación (debe decir: postgis | extensions, spatial_ref_sys en public = no, funciones pendientes = 0)
select (select extnamespace::regnamespace::text from pg_extension where extname = 'postgis') as postgis,
       case when to_regclass('public.spatial_ref_sys') is null then 'no' else 'SÍ' end as spatial_ref_sys_en_public,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and 'search_path=public' = any (proconfig)) as funciones_pendientes;

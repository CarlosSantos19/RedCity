-- RedCity · 0010 · Pausar los servicios de cuidado
-- Mientras no exista una revisión real de identidad y antecedentes, no se pueden publicar, ofrecer
-- ni contratar servicios de cuidado de niños o de adultos mayores. Es solo agregar reglas: no borra nada.

create or replace function rubro_pausado(p_rubro text) returns boolean
language sql immutable as $$
  select coalesce(p_rubro in ('ninera', 'adulto-mayor'), false);
$$;

-- Cubre también contratar_oferta(), que crea la contratación por dentro
create or replace function validar_rubro_publicacion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.categoria = 'servicio' and rubro_pausado(new.datos->>'rubro')
     and (tg_op = 'INSERT' or old.datos->>'rubro' is distinct from new.datos->>'rubro') then
    raise exception 'Por ahora RedCity no permite servicios de cuidado de niños o de adultos mayores';
  end if;
  return new;
end $$;
create or replace trigger publicaciones_rubro_pausado before insert or update of datos on publicaciones
  for each row execute function validar_rubro_publicacion();

create or replace function validar_rubro_postulacion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if rubro_pausado((select datos->>'rubro' from publicaciones where id = new.publicacion_id)) then
    raise exception 'Por ahora RedCity no permite servicios de cuidado de niños o de adultos mayores';
  end if;
  return new;
end $$;
create or replace trigger postulaciones_rubro_pausado before insert on postulaciones
  for each row execute function validar_rubro_postulacion();

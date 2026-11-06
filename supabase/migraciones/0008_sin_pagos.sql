-- RedCity · 0008 · Por ahora sin pagos dentro de la app
-- Los vecinos acuerdan y pagan el servicio directamente (efectivo, Nequi, transferencia).
-- RedCity no cobra comisión: solo registra que el servicio se realizó, para que ambos puedan calificarse.
-- Las tablas de pagos se conservan para poder activar una pasarela más adelante.

-- ---------- 1. Comisión y costo de pasarela en cero ----------
insert into configuracion (clave, valor) values
  ('comision_servicios', 0), ('pasarela_porcentaje', 0), ('pasarela_fijo', 0)
on conflict (clave) do update set valor = excluded.valor;

-- ---------- 2. El cliente confirma que el servicio se realizó ----------
-- Crea el registro del servicio (valor acordado, sin comisión, pagado por fuera) y lo deja listo para calificar.
create or replace function registrar_servicio(p_publicacion uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare p publicaciones; po postulaciones; r uuid;
begin
  p := _servicio(p_publicacion);
  if p.id is null or p.autor_id <> auth.uid() then raise exception 'Solo el cliente puede confirmar'; end if;
  if p.datos->>'estado' = 'pagada' then
    -- Servicio que alcanzó a quedar con un pago retenido antes de este cambio: se libera
    update pagos set estado = 'liberado', liberado_en = now() where publicacion_id = p.id and estado = 'retenido' returning id into r;
  elsif p.datos->>'estado' = 'asignada' then
    select * into po from postulaciones where id = (p.datos->>'asignadoId')::uuid;
    if po.id is null then raise exception 'Este servicio no tiene un vecino contratado'; end if;
    insert into pagos (publicacion_id, postulacion_id, cliente_id, proveedor_id, valor_cop, comision_pct, pasarela_cop, estado, pasarela, liberado_en)
    values (p.id, po.id, p.autor_id, po.proveedor_id, po.precio_cop, 0, 0, 'liberado', 'directo', now())
    returning id into r;
  else
    raise exception 'Este servicio no está en curso';
  end if;
  update publicaciones set datos = datos || jsonb_build_object(
    'realizados', coalesce((datos->>'realizados')::int, 0) + 1,
    'estado', case when datos->>'frecuencia' = 'una-vez' then 'completada' else 'asignada' end) where id = p.id;
  return r;
end $$;
grant execute on function registrar_servicio(uuid) to authenticated;

-- ---------- 3. Ya no se puede pagar por la app ----------
create or replace function pagar_servicio(p_publicacion uuid) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Por ahora RedCity no maneja pagos: acuerden el pago directamente';
end $$;

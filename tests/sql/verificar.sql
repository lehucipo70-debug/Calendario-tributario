-- Verificaciones: cualquier fallo lanza una excepción y detiene psql (ON_ERROR_STOP).
\set ON_ERROR_STOP on
\set admin  '''00000000-0000-0000-0000-00000000000a'''
\set ana    '''00000000-0000-0000-0000-0000000000a1'''
\set carlos '''00000000-0000-0000-0000-0000000000c1'''

-- 1. Migración: 4 obligaciones con impuesto → 4 tareas, sin duplicar al repetir
do $$
declare n int; r record;
begin
  select count(*) into n from public.tareas where origen_ref like 'obl:%';
  if n <> 4 then raise exception 'migración: se esperaban 4 tareas, hay %', n; end if;

  select * into r from public.tareas where titulo = 'IVA · Bimestre 5';
  if r.asignado_a is distinct from '00000000-0000-0000-0000-0000000000a1' then raise exception 'IVA debía asignarse a Ana'; end if;
  if r.estado <> 'pendiente' or r.categoria <> 'Tributario' or r.fecha_vencimiento <> '2026-11-10' then raise exception 'IVA mal migrado: %', row_to_json(r); end if;
  if r.etiquetas <> array['JAT'] then raise exception 'grupo/firma no quedó como etiqueta'; end if;

  select * into r from public.tareas where titulo = 'RETEFUENTE · Septiembre';
  if r.estado <> 'completada' or r.completada_at <> '2026-10-08 10:00-05'::timestamptz then raise exception 'presentada mal migrada: %', row_to_json(r); end if;
  if r.descripcion <> 'Radicado 123' or r.asignado_a is null then raise exception 'observaciones/asignación perdidas'; end if;

  select * into r from public.tareas where titulo = 'ICA';
  if r.asignado_a is not null or r.asignado_nombre <> 'PEDRO' or r.descripcion is not null then raise exception 'contador sin perfil mal migrado: %', row_to_json(r); end if;

  select * into r from public.tareas where titulo = 'RENTA · Anual';
  if r.fecha_vencimiento is not null or r.estado <> 'completada' or r.completada_at is null then raise exception 'fecha inválida mal manejada: %', row_to_json(r); end if;
  raise notice 'OK migración';
end $$;

-- 2. Trigger de completada_at
do $$
declare t uuid; c timestamptz;
begin
  insert into public.tareas (titulo, estado) values ('trigger', 'completada') returning id, completada_at into t, c;
  if c is null then raise exception 'insert completada sin completada_at'; end if;
  update public.tareas set estado = 'pendiente' where id = t returning completada_at into c;
  if c is not null then raise exception 'reabrir debía limpiar completada_at'; end if;
  update public.tareas set completada_at = '2020-01-01' where id = t returning completada_at into c;
  if c is not null then raise exception 'el cliente no debe poder fijar completada_at'; end if;
  update public.tareas set estado = 'completada' where id = t returning completada_at into c;
  if c is null then raise exception 'completar debía fijar completada_at'; end if;
  update public.tareas set titulo = 'trigger 2' where id = t;
  if (select completada_at from public.tareas where id = t) <> c then raise exception 'editar otro campo cambió completada_at'; end if;
  begin
    insert into public.tareas (titulo, estado) values ('x', 'inventado');
    raise exception 'debía rechazar un estado inválido';
  exception when check_violation then null;
  end;
  delete from public.tareas where id = t;
  raise notice 'OK trigger';
end $$;

-- 3. Permisos de ejemplo (RLS) por rol
insert into public.tareas (id, titulo, asignado_a, creado_por) values
  ('11111111-0000-0000-0000-000000000001', 'De Carlos (creada por admin)', :carlos, :admin),
  ('11111111-0000-0000-0000-000000000002', 'De Ana (creada por admin)', :ana, :admin);

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';  -- Ana, colaboradora
do $$
declare n int;
begin
  select count(*) into n from public.tareas;
  if n < 6 then raise exception 'Ana debía ver todas las tareas (ve %)', n; end if;
  select count(*) into n from public.perfiles;
  if n <> 3 then raise exception 'Ana debía ver los 3 perfiles'; end if;

  insert into public.tareas (titulo, asignado_a) values ('Mía', '00000000-0000-0000-0000-0000000000a1');
  if (select creado_por from public.tareas where titulo = 'Mía') <> '00000000-0000-0000-0000-0000000000a1' then raise exception 'creado_por debía ser Ana'; end if;
  begin
    insert into public.tareas (titulo, asignado_a) values ('Para Carlos', '00000000-0000-0000-0000-0000000000c1');
    raise exception 'Ana no debía poder asignar a Carlos';
  exception when insufficient_privilege then null;
  end;

  update public.tareas set estado = 'en_progreso' where id = '11111111-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Ana debía poder editar su tarea asignada'; end if;
  update public.tareas set estado = 'en_progreso' where id = '11111111-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Ana no debía editar la tarea de Carlos'; end if;
  delete from public.tareas where id = '11111111-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Ana no debía borrar una tarea creada por el admin'; end if;
  delete from public.tareas where titulo = 'Mía';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Ana debía poder borrar su propia tarea'; end if;

  insert into public.tarea_actividad (tarea_id, texto, autor_nombre) values ('11111111-0000-0000-0000-000000000002', 'Avance', 'Ana');
  -- Si intenta comentar a nombre de otro, el comentario queda a nombre de ella.
  insert into public.tarea_actividad (tarea_id, texto, autor_id) values ('11111111-0000-0000-0000-000000000002', 'falso', '00000000-0000-0000-0000-00000000000a');
  if (select autor_id from public.tarea_actividad where texto = 'falso') <> '00000000-0000-0000-0000-0000000000a1' then
    raise exception 'Ana no debía comentar a nombre de otro';
  end if;
  raise notice 'OK permisos colaborador';
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';  -- administrador
do $$
declare n int;
begin
  update public.tareas set asignado_a = '00000000-0000-0000-0000-0000000000a1' where id = '11111111-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'el admin debía poder reasignar'; end if;
  delete from public.tareas where id = '11111111-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'el admin debía poder borrar'; end if;
  raise notice 'OK permisos administrador';
end $$;

reset role;
set role anon;
do $$
begin
  if (select count(*) from public.tareas) <> 0 then raise exception 'anon no debía ver tareas'; end if;
  raise notice 'OK anon sin acceso';
end $$;
reset role;

-- La actividad se borra en cascada con su tarea
delete from public.tareas where id = '11111111-0000-0000-0000-000000000002';
do $$ begin
  if (select count(*) from public.tarea_actividad) <> 0 then raise exception 'la actividad debía borrarse en cascada'; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tareas') then raise exception 'tareas no está en tiempo real'; end if;
  raise notice 'OK cascada y tiempo real';
end $$;

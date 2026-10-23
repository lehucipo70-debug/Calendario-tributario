-- Ataques de una colaboradora (Ana) hablando directo con la API, sin pasar por la página.
-- Cada uno debe ser bloqueado; si alguno funciona, se lanza una excepción.
\set ON_ERROR_STOP on
reset role;
insert into public.tareas (id, titulo, asignado_a, creado_por) values
  ('22222222-0000-0000-0000-000000000001', 'Del admin asignada a Ana', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a'),
  ('22222222-0000-0000-0000-000000000002', 'Del admin para Carlos', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a')
on conflict do nothing;
-- Política típica de "cada uno edita su propio perfil" (muchos proyectos la tienen).
drop policy if exists "perfiles_editar_propio_prueba" on public.perfiles;
create policy "perfiles_editar_propio_prueba" on public.perfiles for update to authenticated using (id = auth.uid());

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

do $$
declare n int; c uuid; ts timestamptz; nom text; t uuid; admin_id constant uuid := '00000000-0000-0000-0000-00000000000a';
begin
  -- A1: apropiarse de una tarea del admin (cambiar creado_por) para luego borrarla
  update public.tareas set creado_por = auth.uid() where id = '22222222-0000-0000-0000-000000000001';
  delete from public.tareas where id = '22222222-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n > 0 then raise exception 'A1: Ana borró una tarea del admin tras cambiar creado_por'; end if;

  -- A2: crear una tarea a nombre del admin
  insert into public.tareas (titulo, asignado_a, creado_por) values ('falsa', auth.uid(), admin_id) returning creado_por into c;
  if c <> auth.uid() then raise exception 'A2: Ana suplantó el creador'; end if;

  -- A3: crear una tarea propia y pasársela a Carlos
  insert into public.tareas (titulo, asignado_a) values ('para pasar', auth.uid()) returning id into t;
  begin
    update public.tareas set asignado_a = '00000000-0000-0000-0000-0000000000c1' where id = t;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'A3: Ana reasignó una tarea a Carlos'; end if;
  exception when insufficient_privilege then null;
  end;

  -- A4: crear una tarea ya completada con una fecha de completado inventada (infla la puntualidad)
  insert into public.tareas (titulo, asignado_a, estado, fecha_vencimiento, completada_at)
  values ('inflar', auth.uid(), 'completada', '2026-01-10', '2026-01-01') returning completada_at into ts;
  if ts = '2026-01-01'::timestamptz then raise exception 'A4: Ana fijó completada_at a mano'; end if;

  -- A5: comentar en la bitácora con el nombre de otra persona
  insert into public.tarea_actividad (tarea_id, autor_id, autor_nombre, texto)
  values ('22222222-0000-0000-0000-000000000002', auth.uid(), 'Administrador', 'Aprobado') returning autor_nombre into nom;
  if nom = 'Administrador' then raise exception 'A5: Ana comentó con nombre ajeno'; end if;

  -- A6: lista de verificación que no es una lista
  begin
    insert into public.tareas (titulo, asignado_a, checklist) values ('rota', auth.uid(), '{"x": 1}');
    raise exception 'A6: se guardó una checklist que no es lista';
  exception when check_violation then null;
  end;

  -- A7: textos gigantes
  begin
    insert into public.tareas (titulo, asignado_a, descripcion) values ('gigante', auth.uid(), repeat('x', 5000000));
    raise exception 'A7: se guardó una descripción de 5 MB';
  exception when check_violation then null;
  end;

  -- A8: ascender a administradora editando su propio perfil
  begin
    update public.perfiles set rol = 'admin' where id = auth.uid();
  exception when insufficient_privilege then null;
  end;
  if public.es_admin() then raise exception 'A8: Ana se ascendió a administradora'; end if;

  -- A9: cambiar el origen de una tarea importada (bloquearía reimportaciones)
  update public.tareas set origen_ref = 'xls:robado' where id = '22222222-0000-0000-0000-000000000001';
  if exists (select 1 from public.tareas where origen_ref = 'xls:robado') then raise exception 'A9: Ana cambió origen_ref'; end if;

  raise notice 'OK ataques de colaboradora bloqueados';
end $$;

-- El administrador sigue pudiendo todo lo legítimo
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$
declare ts timestamptz; n int;
begin
  insert into public.tareas (titulo, estado, fecha_vencimiento, completada_at, origen_ref)
  values ('importada', 'completada', '2026-01-10', '2026-01-09', 'xls:prueba-admin') returning completada_at into ts;
  if ts <> '2026-01-09'::timestamptz then raise exception 'el admin debe poder importar tareas completadas con su fecha'; end if;
  update public.tareas set asignado_a = '00000000-0000-0000-0000-0000000000c1' where id = '22222222-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'el admin debe poder reasignar'; end if;
  raise notice 'OK administrador conserva sus permisos';
end $$;

reset role;
drop policy "perfiles_editar_propio_prueba" on public.perfiles;

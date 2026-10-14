-- ═══════════════════════════════════════════════════════════════════
-- PERMISOS DE EJEMPLO (opcional): punto de partida para tus políticas RLS.
-- Ajústalo a tu gusto; la página se adapta a lo que la base de datos permita.
--
--   · Todos los usuarios autenticados ven las tareas del equipo.
--   · Cualquiera crea tareas; un colaborador solo puede asignárselas a sí mismo.
--   · Edita una tarea: un administrador, quien la creó o a quien está asignada.
--   · Borra una tarea: un administrador o quien la creó.
--   · Seguimiento: todos leen; cada uno comenta en su propio nombre.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and lower(rol) in ('admin', 'lider', 'supervisor')
  );
$$;

-- La página lee `perfiles` para listar a los colaboradores.
drop policy if exists "perfiles_leer" on public.perfiles;
create policy "perfiles_leer" on public.perfiles for select to authenticated using (true);

drop policy if exists "tareas_leer" on public.tareas;
create policy "tareas_leer" on public.tareas for select to authenticated using (true);

drop policy if exists "tareas_crear" on public.tareas;
create policy "tareas_crear" on public.tareas for insert to authenticated
  with check (public.es_admin() or asignado_a is null or asignado_a = auth.uid());

drop policy if exists "tareas_editar" on public.tareas;
create policy "tareas_editar" on public.tareas for update to authenticated
  using (public.es_admin() or creado_por = auth.uid() or asignado_a = auth.uid())
  with check (public.es_admin() or asignado_a = auth.uid() or creado_por = auth.uid());

drop policy if exists "tareas_borrar" on public.tareas;
create policy "tareas_borrar" on public.tareas for delete to authenticated
  using (public.es_admin() or creado_por = auth.uid());

drop policy if exists "actividad_leer" on public.tarea_actividad;
create policy "actividad_leer" on public.tarea_actividad for select to authenticated using (true);

drop policy if exists "actividad_crear" on public.tarea_actividad;
create policy "actividad_crear" on public.tarea_actividad for insert to authenticated
  with check (autor_id = auth.uid());

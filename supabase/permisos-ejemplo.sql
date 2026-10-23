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

-- ═══════════════════════════════════════════════════════════════════
-- REGLAS QUE NADIE PUEDE SALTARSE DESDE LA API
-- Las políticas deciden QUIÉN toca una fila; estos triggers deciden QUÉ
-- columnas puede cambiar. Sin ellos, una colaboradora con su clave podría
-- apropiarse de tareas ajenas (cambiando creado_por) y borrarlas.
-- En el SQL Editor (sin usuario conectado) no aplican.
-- ═══════════════════════════════════════════════════════════════════
create or replace function public.tareas_proteger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    -- Solo un administrador (al importar) puede fijar cuándo se completó.
    if not public.es_admin() then
      new.completada_at := case when new.estado = 'completada' then now() end;
    end if;
  else
    new.id := old.id;
    new.creado_por := old.creado_por;
    new.origen_ref := old.origen_ref;
    if not public.es_admin() and new.asignado_a is not null
       and new.asignado_a is distinct from old.asignado_a and new.asignado_a <> auth.uid() then
      raise exception 'Solo un administrador puede asignar tareas a otros colaboradores.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- Se llama "tareas_zz_…" para correr después de tareas_antes_de_guardar (orden alfabético).
drop trigger if exists tareas_zz_proteger on public.tareas;
create trigger tareas_zz_proteger
  before insert or update on public.tareas
  for each row execute function public.tareas_proteger();

-- El autor de un comentario es siempre quien está conectado, con su nombre del perfil.
create or replace function public.actividad_autor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  new.autor_id := auth.uid();
  new.autor_nombre := coalesce(
    (select nombre from public.perfiles where id = auth.uid()),
    (select email from auth.users where id = auth.uid()));
  return new;
end $$;

drop trigger if exists actividad_autor on public.tarea_actividad;
create trigger actividad_autor
  before insert on public.tarea_actividad
  for each row execute function public.actividad_autor();

-- Nadie se cambia el rol a sí mismo: solo un administrador cambia roles,
-- aunque `perfiles` tenga una política de "editar mi propio perfil".
create or replace function public.perfiles_proteger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.es_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.rol := 'colaborador';
  elsif new.rol is distinct from old.rol or new.id is distinct from old.id then
    raise exception 'Solo un administrador puede cambiar roles.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists perfiles_proteger on public.perfiles;
create trigger perfiles_proteger
  before insert or update on public.perfiles
  for each row execute function public.perfiles_proteger();

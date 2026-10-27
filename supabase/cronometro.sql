-- ═══════════════════════════════════════════════════════════════════
-- CRONÓMETRO DE TAREAS
-- Tiempo de ejecución: desde que la tarea sale de "Pendiente" hasta que
-- se marca "Completada". Ejecutar una vez en el SQL Editor de Supabase.
-- Se puede volver a ejecutar sin problema.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Columna con el momento en que la tarea empezó a ejecutarse
alter table public.tareas add column if not exists iniciada_at timestamptz;

-- 2. Trigger: mismas reglas que la página (iniciadaAlCambiar en index.html),
--    para que el cronómetro sea correcto aunque el cambio venga de otro lado.
--    pendiente → en progreso / en revisión : empieza ahora
--    pendiente → completada directo        : sin tiempo medido
--    → pendiente                           : se detiene y se borra
--    completada → reabierta                : conserva el inicio original
create or replace function public.tareas_fijar_iniciada_at()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.estado in ('en_progreso', 'en_revision') and new.iniciada_at is null then
      new.iniciada_at := now();
    end if;
  elsif new.estado is distinct from old.estado then
    if new.estado = 'pendiente' then
      new.iniciada_at := null;
    elsif old.estado <> 'pendiente' and old.iniciada_at is not null then
      new.iniciada_at := old.iniciada_at;
    elsif new.estado <> 'completada' and new.iniciada_at is null then
      new.iniciada_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tareas_iniciada_at on public.tareas;
create trigger tareas_iniciada_at
  before insert or update on public.tareas
  for each row execute function public.tareas_fijar_iniciada_at();

-- 3. Tareas que ya estaban en curso: se toma el último paso desde "Pendiente"
--    registrado en el seguimiento; si no hay registro, la fecha de creación.
update public.tareas t
set iniciada_at = coalesce(
  (select max(a.created_at) from public.tarea_actividad a
    where a.tarea_id = t.id and a.tipo = 'estado' and a.texto like 'Cambió el estado: Pendiente → %'
      and a.texto not like '%→ Completada'),
  case when t.estado in ('en_progreso', 'en_revision') then t.created_at end)
where t.iniciada_at is null and t.estado <> 'pendiente';

-- 4. Que la API vea la columna nueva de inmediato
notify pgrst, 'reload schema';

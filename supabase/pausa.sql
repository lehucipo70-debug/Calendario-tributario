-- ═══════════════════════════════════════════════════════════════════
-- PAUSA DEL CRONÓMETRO
-- Permite pausar y reanudar el cronómetro de una tarea (almuerzo,
-- salidas…). El tiempo en pausa no cuenta en el tiempo de ejecución.
-- Requiere haber ejecutado antes supabase/cronometro.sql.
-- Ejecutar una vez en el SQL Editor de Supabase. Se puede volver a
-- ejecutar sin problema.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Columnas: desde cuándo está en pausa (null = corriendo) y cuántos
--    segundos de pausa ya terminados lleva en total.
alter table public.tareas add column if not exists pausada_at timestamptz;
alter table public.tareas add column if not exists pausa_seg integer not null default 0;

do $$ begin
  alter table public.tareas add constraint tareas_pausa_seg_positiva check (pausa_seg >= 0);
exception when duplicate_object then null; end $$;

-- 2. Al volver a "Pendiente" el cronómetro se borra, y la pausa también
--    (mismas reglas que la página, aunque el cambio venga de otro lado).
create or replace function public.tareas_reiniciar_pausa()
returns trigger language plpgsql as $$
begin
  if new.estado = 'pendiente' and new.estado is distinct from old.estado then
    new.pausada_at := null;
    new.pausa_seg := 0;
  end if;
  return new;
end $$;

drop trigger if exists tareas_pausa on public.tareas;
create trigger tareas_pausa
  before update on public.tareas
  for each row execute function public.tareas_reiniciar_pausa();

-- 3. Que la API vea las columnas nuevas de inmediato
notify pgrst, 'reload schema';

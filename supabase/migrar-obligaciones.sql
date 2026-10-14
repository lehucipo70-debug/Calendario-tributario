-- ═══════════════════════════════════════════════════════════════════
-- MIGRACIÓN (opcional): convierte las obligaciones del calendario
-- tributario anterior en tareas del planner.
--
-- Ejecutar DESPUÉS de schema.sql. Es idempotente: cada obligación se
-- marca con origen_ref = 'obl:<id>' y no se duplica si se corre otra vez.
-- La tabla `obligaciones` no se modifica ni se borra.
--
-- El contador de cada obligación se asocia con el perfil del mismo nombre
-- (sin importar mayúsculas). Si no existe, la tarea queda sin asignar y el
-- nombre se guarda en asignado_nombre.
-- ═══════════════════════════════════════════════════════════════════

-- Convierte texto a fecha sin fallar con formatos raros (devuelve null).
create or replace function pg_temp.fecha_segura(t text) returns date language plpgsql as $$
begin
  return t::date;
exception when others then
  return null;
end $$;

insert into public.tareas (
  titulo, descripcion, empresa, categoria, prioridad, estado,
  fecha_vencimiento, asignado_a, asignado_nombre, completada_at, etiquetas, origen_ref
)
select
  left(trim(o.impuesto) || coalesce(' · ' || nullif(trim(o.periodo), ''), ''), 300),
  nullif(trim(o.observaciones), ''),
  o.empresa_nombre,
  'Tributario',
  'alta',
  case when o.estado = 'Presentado' then 'completada' else 'pendiente' end,
  pg_temp.fecha_segura(o.fecha_vencimiento::text),
  p.id,
  case when p.id is null then nullif(trim(o.contador), '') end,
  case when o.estado = 'Presentado'
       then coalesce(o.fecha_presentacion::timestamptz, pg_temp.fecha_segura(o.fecha_vencimiento::text)::timestamptz)
  end,
  array_remove(array[nullif(trim(o.grupo), '')], null),
  'obl:' || o.id::text
from public.obligaciones o
left join lateral (
  select pf.id from public.perfiles pf
  where upper(trim(pf.nombre)) = upper(trim(o.contador))
  limit 1
) p on true
where coalesce(trim(o.impuesto), '') <> ''
on conflict (origen_ref) do nothing;

-- Opcional: renombrar el rol anterior. Si tu tabla `perfiles` tiene una
-- restricción CHECK sobre `rol`, ajústala antes de ejecutar esta línea.
-- update public.perfiles set rol = 'colaborador' where rol = 'contador';

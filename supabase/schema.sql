-- ═══════════════════════════════════════════════════════════════════
-- PLANNER DEL EQUIPO — esquema de base de datos (Supabase / PostgreSQL)
--
-- Ejecutar una vez en Supabase → SQL Editor. Es idempotente: se puede
-- volver a correr sin perder datos.
--
-- Usa la tabla existente `perfiles` (id = auth.users.id, nombre, rol,
-- correo). Roles que la página trata como administrador: admin, lider,
-- supervisor (configurable en js/config.js). Cualquier otro = colaborador.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Tareas ──────────────────────────────────────────────────────────
create table if not exists public.tareas (
  id                uuid primary key default gen_random_uuid(),
  titulo            text not null check (char_length(titulo) between 1 and 300),
  descripcion       text,
  asignado_a        uuid references auth.users(id) on delete set null,
  asignado_nombre   text,          -- nombre importado que aún no tiene perfil
  creado_por        uuid default auth.uid() references auth.users(id) on delete set null,
  empresa           text,
  categoria         text default 'Otro',
  prioridad         text not null default 'media'
                    check (prioridad in ('baja', 'media', 'alta', 'urgente')),
  estado            text not null default 'pendiente'
                    check (estado in ('pendiente', 'en_progreso', 'en_revision', 'completada')),
  fecha_inicio      date,
  fecha_vencimiento date,
  progreso          smallint not null default 0 check (progreso between 0 and 100),
  checklist         jsonb not null default '[]'::jsonb,
  etiquetas         text[] not null default '{}',
  completada_at     timestamptz,
  origen_ref        text unique,   -- evita duplicados al importar Excel / migrar
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists tareas_asignado_idx    on public.tareas (asignado_a);
create index if not exists tareas_vencimiento_idx on public.tareas (fecha_vencimiento);
create index if not exists tareas_estado_idx      on public.tareas (estado);

-- ── Seguimiento (comentarios y cambios de cada tarea) ───────────────
create table if not exists public.tarea_actividad (
  id           uuid primary key default gen_random_uuid(),
  tarea_id     uuid not null references public.tareas(id) on delete cascade,
  autor_id     uuid default auth.uid() references auth.users(id) on delete set null,
  autor_nombre text,
  tipo         text not null default 'comentario'
               check (tipo in ('comentario', 'creacion', 'estado', 'asignacion', 'fecha', 'edicion')),
  texto        text not null check (char_length(texto) between 1 and 2000),
  created_at   timestamptz not null default now()
);

create index if not exists actividad_tarea_idx on public.tarea_actividad (tarea_id, created_at);

-- ── Reglas automáticas ──────────────────────────────────────────────
-- updated_at siempre al día, y completada_at lo fija el servidor (no el
-- navegador) para que la puntualidad del rendimiento sea confiable.
create or replace function public.tareas_antes_de_guardar()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.estado = 'completada' and new.completada_at is null then
      new.completada_at := now();
    elsif new.estado <> 'completada' then
      new.completada_at := null;
    end if;
  elsif new.estado is distinct from old.estado then
    new.completada_at := case when new.estado = 'completada' then now() else null end;
  else
    new.completada_at := old.completada_at;
  end if;
  return new;
end $$;

drop trigger if exists tareas_antes_de_guardar on public.tareas;
create trigger tareas_antes_de_guardar
  before insert or update on public.tareas
  for each row execute function public.tareas_antes_de_guardar();

-- ── Tiempo real ─────────────────────────────────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.tareas;
exception when duplicate_object then null;
end $$;

-- ── Seguridad ───────────────────────────────────────────────────────
-- RLS queda ACTIVADO: sin políticas, nadie puede leer ni escribir.
-- Crea tus políticas (o ejecuta supabase/permisos-ejemplo.sql como punto
-- de partida) para dar acceso.
alter table public.tareas          enable row level security;
alter table public.tarea_actividad enable row level security;

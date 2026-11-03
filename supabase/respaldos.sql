-- ═══════════════════════════════════════════════════════════════════
-- COPIAS DE SEGURIDAD DE LAS TAREAS
-- Ejecutar en Supabase → SQL Editor (se puede volver a ejecutar sin problema).
--
-- Antes de cada importación de Excel (y antes de restaurar) la página guarda
-- una copia completa de las tareas. Se conservan solo las 5 más recientes.
-- Desde Administración → Copias de seguridad se puede volver a cualquiera.
-- Solo los administradores (admin, lider, supervisor) ven, crean y borran copias.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.respaldos (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  autor_id      uuid default auth.uid() references auth.users (id) on delete set null,
  autor_nombre  text,
  motivo        text not null default '',
  archivo       text,
  total         integer not null default 0,
  tareas        jsonb not null default '[]'::jsonb,   -- copia completa de las tareas
  creadas       jsonb not null default '[]'::jsonb    -- ids de las tareas que creó la importación que siguió a la copia
);

create index if not exists respaldos_fecha_idx on public.respaldos (created_at desc);

-- ── Solo se guardan las 5 copias más recientes ───────────────────────
create or replace function public.respaldos_recortar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.respaldos
  where id not in (select id from public.respaldos order by created_at desc, id desc limit 5);  -- igual que RESPALDOS_MAX en index.html
  return null;
end;
$$;

drop trigger if exists respaldos_recortar on public.respaldos;
create trigger respaldos_recortar
  after insert on public.respaldos
  for each statement execute function public.respaldos_recortar();

-- ── Permisos (RLS): solo administradores ─────────────────────────────
alter table public.respaldos enable row level security;

drop policy if exists respaldos_admin on public.respaldos;
create policy respaldos_admin on public.respaldos
  for all to authenticated
  using (exists (
    select 1 from public.perfiles p
    where p.id = auth.uid() and lower(p.rol) in ('admin', 'lider', 'supervisor')
  ))
  with check (exists (
    select 1 from public.perfiles p
    where p.id = auth.uid() and lower(p.rol) in ('admin', 'lider', 'supervisor')
  ));

grant select, insert, update, delete on public.respaldos to authenticated;

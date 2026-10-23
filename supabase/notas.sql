-- ═══════════════════════════════════════════════════════════════════
-- NOTAS PERSONALES del planner
-- Ejecutar una sola vez en Supabase → SQL Editor.
-- Cada usuario solo puede leer, crear, editar y borrar SUS notas
-- (ni el administrador ve las de los demás desde la página).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.notas (
  id           text primary key default gen_random_uuid()::text,
  usuario_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo       text not null default '',
  contenido    text not null default '',
  color        text not null default 'violeta',
  fijada       boolean not null default false,
  favorita     boolean not null default false,
  archivada    boolean not null default false,
  eliminada_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists notas_usuario_idx on public.notas (usuario_id, updated_at desc);

alter table public.notas enable row level security;

drop policy if exists notas_propias on public.notas;
create policy notas_propias on public.notas
  for all
  to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

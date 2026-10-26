-- ═══════════════════════════════════════════════════════════════════
-- GANADEROS: directorio de clientes con sus claves y vencimientos
-- Ejecutar una sola vez en Supabase → SQL Editor.
-- Todos los usuarios con sesión ven, crean y editan (incluidas las claves);
-- solo los administradores (admin, lider, supervisor) pueden eliminar.
--
-- Los datos de la ficha van en "datos" (jsonb) y los vencimientos en
-- "vencimientos" (jsonb: { "certificado": { "inicio": "2026-01-01", "fin": "2027-01-01" }, ... }).
-- Para agregar un campo nuevo a la ficha NO hay que cambiar esta tabla:
-- basta con agregarlo a GANADERO_CAMPOS en index.html.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.ganaderos (
  id           text primary key default gen_random_uuid()::text,
  nombre       text not null default '',
  nit          text,
  datos        jsonb not null default '{}'::jsonb,
  vencimientos jsonb not null default '{}'::jsonb,
  creado_por   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists ganaderos_nombre_idx on public.ganaderos (nombre);
create index if not exists ganaderos_nit_idx on public.ganaderos (nit);

alter table public.ganaderos enable row level security;

drop policy if exists ganaderos_leer on public.ganaderos;
create policy ganaderos_leer on public.ganaderos
  for select to authenticated using (true);

drop policy if exists ganaderos_crear on public.ganaderos;
create policy ganaderos_crear on public.ganaderos
  for insert to authenticated with check (true);

drop policy if exists ganaderos_editar on public.ganaderos;
create policy ganaderos_editar on public.ganaderos
  for update to authenticated using (true) with check (true);

drop policy if exists ganaderos_borrar on public.ganaderos;
create policy ganaderos_borrar on public.ganaderos
  for delete to authenticated
  using (exists (
    select 1 from public.perfiles p
    where p.id = auth.uid() and lower(p.rol) in ('admin', 'lider', 'supervisor')
  ));

grant select, insert, update, delete on public.ganaderos to authenticated;

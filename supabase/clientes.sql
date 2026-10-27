-- ═══════════════════════════════════════════════════════════════════
-- CLIENTES: directorio de clientes con sus claves y vencimientos
-- Ejecutar en Supabase → SQL Editor (se puede volver a ejecutar sin problema).
-- Todos los usuarios con sesión ven, crean y editan (incluidas las claves);
-- solo los administradores (admin, lider, supervisor) pueden eliminar.
--
-- Los datos de la ficha van en "datos" (jsonb) y los vencimientos en
-- "vencimientos" (jsonb: { "certificado": { "inicio": "2026-01-01", "fin": "2027-01-01" }, ... }).
-- Para agregar un campo nuevo a la ficha NO hay que cambiar esta tabla:
-- basta con agregarlo a CLIENTE_CAMPOS en index.html.
--
-- Versiones: cada vez que alguien cambia un cliente, el trigger guarda la
-- versión anterior en "historial" (las 5 más recientes, con fecha y autor).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.clientes (
  id                 text primary key default gen_random_uuid()::text,
  nombre             text not null default '',
  nit                text,
  datos              jsonb not null default '{}'::jsonb,
  vencimientos       jsonb not null default '{}'::jsonb,
  historial          jsonb not null default '[]'::jsonb,
  creado_por         uuid default auth.uid() references auth.users (id) on delete set null,
  actualizado_por    uuid references auth.users (id) on delete set null,
  actualizado_nombre text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Por si la tabla se creó con una versión anterior de este archivo
alter table public.clientes add column if not exists historial jsonb not null default '[]'::jsonb;
alter table public.clientes add column if not exists actualizado_por uuid references auth.users (id) on delete set null;
alter table public.clientes add column if not exists actualizado_nombre text;

create index if not exists clientes_nombre_idx on public.clientes (nombre);
create index if not exists clientes_nit_idx on public.clientes (nit);

-- ── Historial de versiones ───────────────────────────────────────────
create or replace function public.clientes_versionar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.actualizado_por := auth.uid();
  new.actualizado_nombre := coalesce((select p.nombre from public.perfiles p where p.id = auth.uid()), new.actualizado_nombre);
  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.historial := '[]'::jsonb;
    return new;
  end if;

  -- El historial solo lo escribe este trigger
  new.historial := coalesce(old.historial, '[]'::jsonb);
  if (new.nombre, new.nit, new.datos, new.vencimientos) is not distinct from (old.nombre, old.nit, old.datos, old.vencimientos) then
    return new;
  end if;

  select coalesce(jsonb_agg(e.v order by e.n), '[]'::jsonb) into new.historial
  from jsonb_array_elements(
    jsonb_build_array(jsonb_build_object(
      'nombre', old.nombre, 'nit', old.nit, 'datos', old.datos, 'vencimientos', old.vencimientos,
      'fecha', old.updated_at, 'autor', old.actualizado_nombre
    )) || coalesce(old.historial, '[]'::jsonb)
  ) with ordinality as e(v, n)
  where e.n <= 5;  -- versiones que se guardan (igual que CLIENTE_VERSIONES en index.html)

  return new;
end;
$$;

drop trigger if exists clientes_versionar on public.clientes;
create trigger clientes_versionar
  before insert or update on public.clientes
  for each row execute function public.clientes_versionar();

-- ── Permisos (RLS) ───────────────────────────────────────────────────
alter table public.clientes enable row level security;

drop policy if exists clientes_leer on public.clientes;
create policy clientes_leer on public.clientes
  for select to authenticated using (true);

drop policy if exists clientes_crear on public.clientes;
create policy clientes_crear on public.clientes
  for insert to authenticated with check (true);

drop policy if exists clientes_editar on public.clientes;
create policy clientes_editar on public.clientes
  for update to authenticated using (true) with check (true);

drop policy if exists clientes_borrar on public.clientes;
create policy clientes_borrar on public.clientes
  for delete to authenticated
  using (exists (
    select 1 from public.perfiles p
    where p.id = auth.uid() and lower(p.rol) in ('admin', 'lider', 'supervisor')
  ));

grant select, insert, update, delete on public.clientes to authenticated;

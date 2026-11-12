-- ═══════════════════════════════════════════════════════════════════
-- PRESENTACIONES: qué declaraciones DIAN de cada cliente ya se presentaron
-- Ejecutar en Supabase → SQL Editor (se puede volver a ejecutar sin problema).
-- Requiere supabase/clientes.sql.
--
-- Una fila por declaración presentada: cliente + año + obligación + periodo
-- (los mismos valores de la tabla vencimientos / calendario_dian) y la fecha
-- en que se presentó. Si no hay fila, la declaración no se ha presentado.
--
-- Está aparte de "vencimientos" a propósito: esa tabla se recalcula sola
-- (cambio de NIT, de impuestos o del calendario) y sus filas se borran y se
-- vuelven a crear; aquí la marca de "presentada" no se pierde.
--
-- Permisos: todos los usuarios con sesión ven, marcan y cambian la fecha;
-- quitar la marca solo quien la puso o un administrador (admin, lider, supervisor).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.presentaciones (
  cliente_id         text not null references public.clientes (id) on delete cascade,
  anio               integer not null,
  obligacion         text not null,      -- iva_bimestral, retencion, renta_pn, …
  periodo            text not null,      -- igual que en calendario_dian
  fecha_presentacion date not null,
  presentada_por     uuid default auth.uid() references auth.users (id) on delete set null,
  presentada_nombre  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (cliente_id, anio, obligacion, periodo)
);
create index if not exists presentaciones_periodo_idx on public.presentaciones (anio, obligacion, periodo);

-- Quién y cuándo: se llena solo con el usuario que marca o cambia la fecha.
create or replace function public.presentaciones_autor()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  new.presentada_por := auth.uid();
  new.presentada_nombre := coalesce((select p.nombre from public.perfiles p where p.id = auth.uid()), new.presentada_nombre);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists presentaciones_autor on public.presentaciones;
create trigger presentaciones_autor
  before insert or update on public.presentaciones
  for each row execute function public.presentaciones_autor();

-- ── Permisos (RLS) ───────────────────────────────────────────────────
alter table public.presentaciones enable row level security;

drop policy if exists presentaciones_leer on public.presentaciones;
create policy presentaciones_leer on public.presentaciones
  for select to authenticated using (true);

drop policy if exists presentaciones_crear on public.presentaciones;
create policy presentaciones_crear on public.presentaciones
  for insert to authenticated with check (true);

drop policy if exists presentaciones_editar on public.presentaciones;
create policy presentaciones_editar on public.presentaciones
  for update to authenticated using (true) with check (true);

drop policy if exists presentaciones_borrar on public.presentaciones;
create policy presentaciones_borrar on public.presentaciones
  for delete to authenticated
  using (
    presentada_por = auth.uid()
    or exists (
      select 1 from public.perfiles p
      where p.id = auth.uid() and lower(p.rol) in ('admin', 'lider', 'supervisor')
    )
  );

grant select, insert, update, delete on public.presentaciones to authenticated;

-- ── Consulta útil ────────────────────────────────────────────────────
-- Quién falta por presentar un periodo (ejemplo: IVA bimestral Sep–Oct 2026):
--
--   select v.cliente_nombre, v.nit, v.fecha
--   from public.vencimientos v
--   left join public.presentaciones p using (cliente_id, anio, obligacion, periodo)
--   where v.anio = 2026 and v.obligacion = 'iva_bimestral' and v.periodo = 'Sep–Oct'
--     and p.cliente_id is null
--   order by v.cliente_nombre;

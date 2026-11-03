-- ═══════════════════════════════════════════════════════════════════
-- VENCIMIENTOS DIAN DE LOS CLIENTES
-- Ejecutar en Supabase → SQL Editor (se puede volver a ejecutar sin problema).
-- Requiere supabase/clientes.sql.
--
-- calendario_dian: las fechas del Calendario Tributario (una fila por obligación,
--   periodo y dígito del NIT). Cada año se reemplazan las del año nuevo y la
--   página las toma de aquí.
-- vencimientos: los vencimientos de cada cliente. Se mantienen SOLOS:
--   · al crear un cliente, o al cambiarle el NIT o los impuestos asociados,
--     se recalculan sus vencimientos;
--   · al eliminar un cliente, se borran;
--   · al cambiar el calendario, se recalculan los de todos.
-- Impuestos de cada cliente: datos.obligaciones (los que se marcan en la ficha);
-- si nunca se tocaron, los predeterminados: persona natural → IVA bimestral;
-- empresa (NIT de 9 dígitos que empieza por 8 o 9) → IVA bimestral y retención.
-- ═══════════════════════════════════════════════════════════════════

-- ── Calendario ───────────────────────────────────────────────────────
create table if not exists public.calendario_dian (
  anio              integer not null,
  obligacion        text not null,      -- id: iva_bimestral, retencion, renta_pn, …
  obligacion_nombre text not null,
  digitos           integer not null default 1,   -- 1: último dígito del NIT; 2: dos últimos
  orden             integer not null,             -- orden del periodo dentro de la obligación
  periodo           text not null,
  clave             text not null,      -- '1'…'0', o rango de los dos últimos dígitos '01-02'…'99-00'
  fecha             date not null,
  primary key (anio, obligacion, periodo, clave)
);

create table if not exists public.vencimientos (
  id                bigint generated always as identity primary key,
  cliente_id        text not null references public.clientes (id) on delete cascade,
  cliente_nombre    text,
  nit               text,
  anio              integer not null,
  obligacion        text not null,
  obligacion_nombre text not null,
  periodo           text not null,
  fecha             date not null,
  updated_at        timestamptz not null default now(),
  unique (cliente_id, anio, obligacion, periodo)
);
create index if not exists vencimientos_fecha_idx on public.vencimientos (fecha);
create index if not exists vencimientos_cliente_idx on public.vencimientos (cliente_id);

-- ── Cálculo ──────────────────────────────────────────────────────────
-- Impuestos del cliente: los marcados en la ficha o los predeterminados por tipo.
create or replace function public.obligaciones_cliente(p_nit text, p_datos jsonb)
returns text[]
language sql immutable
as $$
  select case
    when jsonb_typeof(p_datos -> 'obligaciones') = 'array'
      then array(select jsonb_array_elements_text(p_datos -> 'obligaciones'))
    when regexp_replace(split_part(coalesce(p_nit, ''), '-', 1), '\D', '', 'g') ~ '^[89][0-9]{8}$'
      then array['iva_bimestral', 'retencion']
    else array['iva_bimestral']
  end;
$$;

-- ¿La clave del calendario corresponde a este NIT? (último dígito o rango de los dos últimos; '00' es el último)
create or replace function public.clave_dian_coincide(p_nit text, p_digitos integer, p_clave text)
returns boolean
language plpgsql immutable
as $$
declare
  base text := regexp_replace(split_part(coalesce(p_nit, ''), '-', 1), '\D', '', 'g');
  n text; desde int; hasta int; v int;
begin
  if base = '' then return false; end if;
  if p_digitos = 2 then n := right('0' || base, 2); else n := right(base, 1); end if;  -- ojo: lpad recorta, no sirve aquí
  if p_clave = n then return true; end if;
  if p_clave !~ '^\d+-\d+$' then return false; end if;
  desde := split_part(p_clave, '-', 1)::int;
  hasta := case when split_part(p_clave, '-', 2) = '00' then 100 else split_part(p_clave, '-', 2)::int end;
  v := case when n = '00' then 100 else n::int end;
  return v between desde and hasta;
end;
$$;

-- Recalcula los vencimientos de un cliente (o de todos si p_cliente es null).
create or replace function public.recalcular_vencimientos(p_cliente text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  -- Lo que ya no aplica (cambió el NIT, se quitó un impuesto o cambió el calendario)
  delete from public.vencimientos v
  where (p_cliente is null or v.cliente_id = p_cliente)
    and not exists (
      select 1 from public.clientes c
      join public.calendario_dian k on k.obligacion = any (public.obligaciones_cliente(c.nit, c.datos))
       and public.clave_dian_coincide(c.nit, k.digitos, k.clave)
      where c.id = v.cliente_id and k.anio = v.anio and k.obligacion = v.obligacion and k.periodo = v.periodo and k.fecha = v.fecha
    );

  -- Lo que aplica: se crea o se actualiza
  insert into public.vencimientos (cliente_id, cliente_nombre, nit, anio, obligacion, obligacion_nombre, periodo, fecha, updated_at)
  select c.id, c.nombre, c.nit, k.anio, k.obligacion, k.obligacion_nombre, k.periodo, k.fecha, now()
  from public.clientes c
  join public.calendario_dian k on k.obligacion = any (public.obligaciones_cliente(c.nit, c.datos))
   and public.clave_dian_coincide(c.nit, k.digitos, k.clave)
  where p_cliente is null or c.id = p_cliente
  on conflict (cliente_id, anio, obligacion, periodo) do update
    set cliente_nombre = excluded.cliente_nombre, nit = excluded.nit, obligacion_nombre = excluded.obligacion_nombre,
        fecha = excluded.fecha, updated_at = now()
    where (vencimientos.cliente_nombre, vencimientos.nit, vencimientos.fecha)
      is distinct from (excluded.cliente_nombre, excluded.nit, excluded.fecha);
end;
$$;

-- ── Automático ───────────────────────────────────────────────────────
create or replace function public.vencimientos_al_cambiar_cliente()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or new.nombre is distinct from old.nombre or new.nit is distinct from old.nit
     or (new.datos -> 'obligaciones') is distinct from (old.datos -> 'obligaciones') then
    perform public.recalcular_vencimientos(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists vencimientos_cliente on public.clientes;
create trigger vencimientos_cliente
  after insert or update on public.clientes
  for each row execute function public.vencimientos_al_cambiar_cliente();

create or replace function public.vencimientos_al_cambiar_calendario()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.recalcular_vencimientos(null);
  return null;
end;
$$;

drop trigger if exists vencimientos_calendario on public.calendario_dian;
create trigger vencimientos_calendario
  after insert or update or delete on public.calendario_dian
  for each statement execute function public.vencimientos_al_cambiar_calendario();

-- ── Permisos (RLS) ───────────────────────────────────────────────────
-- Todos los usuarios con sesión leen. Solo los triggers escriben vencimientos;
-- el calendario lo cambian los administradores (o el SQL Editor).
alter table public.calendario_dian enable row level security;
alter table public.vencimientos enable row level security;

drop policy if exists calendario_leer on public.calendario_dian;
create policy calendario_leer on public.calendario_dian for select to authenticated using (true);
drop policy if exists calendario_admin on public.calendario_dian;
create policy calendario_admin on public.calendario_dian for all to authenticated
  using (exists (select 1 from public.perfiles p where p.id = auth.uid() and lower(p.rol) in ('admin', 'lider', 'supervisor')))
  with check (exists (select 1 from public.perfiles p where p.id = auth.uid() and lower(p.rol) in ('admin', 'lider', 'supervisor')));

drop policy if exists vencimientos_leer on public.vencimientos;
create policy vencimientos_leer on public.vencimientos for select to authenticated using (true);

grant select on public.calendario_dian, public.vencimientos to authenticated;
grant insert, update, delete on public.calendario_dian to authenticated;

-- ── Calendario Tributario 2026 (PDF oficial de la DIAN) ──────────────
-- Para un año nuevo: borrar o conservar las filas del año anterior e insertar las nuevas;
-- los vencimientos de todos los clientes se recalculan solos.
insert into public.calendario_dian (anio, obligacion, obligacion_nombre, digitos, orden, periodo, clave, fecha) values
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 1, 'Ene–Feb', '0', '2026-03-24'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 1, 'Ene–Feb', '1', '2026-03-10'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 1, 'Ene–Feb', '2', '2026-03-11'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 1, 'Ene–Feb', '3', '2026-03-12'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 1, 'Ene–Feb', '4', '2026-03-13'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 1, 'Ene–Feb', '5', '2026-03-16'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 1, 'Ene–Feb', '6', '2026-03-17'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 1, 'Ene–Feb', '7', '2026-03-18'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 1, 'Ene–Feb', '8', '2026-03-19'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 1, 'Ene–Feb', '9', '2026-03-20'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 2, 'Mar–Abr', '0', '2026-05-26'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 2, 'Mar–Abr', '1', '2026-05-12'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 2, 'Mar–Abr', '2', '2026-05-13'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 2, 'Mar–Abr', '3', '2026-05-14'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 2, 'Mar–Abr', '4', '2026-05-15'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 2, 'Mar–Abr', '5', '2026-05-19'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 2, 'Mar–Abr', '6', '2026-05-20'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 2, 'Mar–Abr', '7', '2026-05-21'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 2, 'Mar–Abr', '8', '2026-05-22'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 2, 'Mar–Abr', '9', '2026-05-25'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 3, 'May–Jun', '0', '2026-07-24'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 3, 'May–Jun', '1', '2026-07-09'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 3, 'May–Jun', '2', '2026-07-10'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 3, 'May–Jun', '3', '2026-07-14'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 3, 'May–Jun', '4', '2026-07-15'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 3, 'May–Jun', '5', '2026-07-16'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 3, 'May–Jun', '6', '2026-07-17'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 3, 'May–Jun', '7', '2026-07-21'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 3, 'May–Jun', '8', '2026-07-22'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 3, 'May–Jun', '9', '2026-07-23'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 4, 'Jul–Ago', '0', '2026-09-22'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 4, 'Jul–Ago', '1', '2026-09-09'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 4, 'Jul–Ago', '2', '2026-09-10'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 4, 'Jul–Ago', '3', '2026-09-11'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 4, 'Jul–Ago', '4', '2026-09-14'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 4, 'Jul–Ago', '5', '2026-09-15'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 4, 'Jul–Ago', '6', '2026-09-16'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 4, 'Jul–Ago', '7', '2026-09-17'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 4, 'Jul–Ago', '8', '2026-09-18'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 4, 'Jul–Ago', '9', '2026-09-21'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 5, 'Sep–Oct', '0', '2026-11-25'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 5, 'Sep–Oct', '1', '2026-11-11'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 5, 'Sep–Oct', '2', '2026-11-12'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 5, 'Sep–Oct', '3', '2026-11-13'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 5, 'Sep–Oct', '4', '2026-11-17'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 5, 'Sep–Oct', '5', '2026-11-18'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 5, 'Sep–Oct', '6', '2026-11-19'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 5, 'Sep–Oct', '7', '2026-11-20'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 5, 'Sep–Oct', '8', '2026-11-23'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 5, 'Sep–Oct', '9', '2026-11-24'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 6, 'Nov–Dic', '0', '2027-01-26'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 6, 'Nov–Dic', '1', '2027-01-13'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 6, 'Nov–Dic', '2', '2027-01-14'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 6, 'Nov–Dic', '3', '2027-01-15'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 6, 'Nov–Dic', '4', '2027-01-18'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 6, 'Nov–Dic', '5', '2027-01-19'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 6, 'Nov–Dic', '6', '2027-01-20'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 6, 'Nov–Dic', '7', '2027-01-21'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 6, 'Nov–Dic', '8', '2027-01-22'),
  (2026, 'iva_bimestral', 'IVA bimestral', 1, 6, 'Nov–Dic', '9', '2027-01-25'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 1, 'Enero', '0', '2026-02-23'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 1, 'Enero', '1', '2026-02-10'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 1, 'Enero', '2', '2026-02-11'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 1, 'Enero', '3', '2026-02-12'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 1, 'Enero', '4', '2026-02-13'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 1, 'Enero', '5', '2026-02-16'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 1, 'Enero', '6', '2026-02-17'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 1, 'Enero', '7', '2026-02-18'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 1, 'Enero', '8', '2026-02-19'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 1, 'Enero', '9', '2026-02-20'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 2, 'Febrero', '0', '2026-03-24'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 2, 'Febrero', '1', '2026-03-10'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 2, 'Febrero', '2', '2026-03-11'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 2, 'Febrero', '3', '2026-03-12'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 2, 'Febrero', '4', '2026-03-13'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 2, 'Febrero', '5', '2026-03-16'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 2, 'Febrero', '6', '2026-03-17'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 2, 'Febrero', '7', '2026-03-18'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 2, 'Febrero', '8', '2026-03-19'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 2, 'Febrero', '9', '2026-03-20'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 3, 'Marzo', '0', '2026-04-27'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 3, 'Marzo', '1', '2026-04-13'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 3, 'Marzo', '2', '2026-04-14'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 3, 'Marzo', '3', '2026-04-15'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 3, 'Marzo', '4', '2026-04-16'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 3, 'Marzo', '5', '2026-04-20'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 3, 'Marzo', '6', '2026-04-21'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 3, 'Marzo', '7', '2026-04-22'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 3, 'Marzo', '8', '2026-04-23'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 3, 'Marzo', '9', '2026-04-24'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 4, 'Abril', '0', '2026-05-26'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 4, 'Abril', '1', '2026-05-12'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 4, 'Abril', '2', '2026-05-13'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 4, 'Abril', '3', '2026-05-14'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 4, 'Abril', '4', '2026-05-15'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 4, 'Abril', '5', '2026-05-19'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 4, 'Abril', '6', '2026-05-20'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 4, 'Abril', '7', '2026-05-21'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 4, 'Abril', '8', '2026-05-22'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 4, 'Abril', '9', '2026-05-25'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 5, 'Mayo', '0', '2026-06-24'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 5, 'Mayo', '1', '2026-06-10'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 5, 'Mayo', '2', '2026-06-11'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 5, 'Mayo', '3', '2026-06-12'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 5, 'Mayo', '4', '2026-06-16'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 5, 'Mayo', '5', '2026-06-17'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 5, 'Mayo', '6', '2026-06-18'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 5, 'Mayo', '7', '2026-06-19'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 5, 'Mayo', '8', '2026-06-22'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 5, 'Mayo', '9', '2026-06-23'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 6, 'Junio', '0', '2026-07-24'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 6, 'Junio', '1', '2026-07-09'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 6, 'Junio', '2', '2026-07-10'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 6, 'Junio', '3', '2026-07-14'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 6, 'Junio', '4', '2026-07-15'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 6, 'Junio', '5', '2026-07-16'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 6, 'Junio', '6', '2026-07-17'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 6, 'Junio', '7', '2026-07-21'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 6, 'Junio', '8', '2026-07-22'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 6, 'Junio', '9', '2026-07-23'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 7, 'Julio', '0', '2026-08-26'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 7, 'Julio', '1', '2026-08-12'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 7, 'Julio', '2', '2026-08-13'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 7, 'Julio', '3', '2026-08-14'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 7, 'Julio', '4', '2026-08-18'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 7, 'Julio', '5', '2026-08-19'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 7, 'Julio', '6', '2026-08-20'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 7, 'Julio', '7', '2026-08-21'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 7, 'Julio', '8', '2026-08-24'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 7, 'Julio', '9', '2026-08-25'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 8, 'Agosto', '0', '2026-09-22'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 8, 'Agosto', '1', '2026-09-09'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 8, 'Agosto', '2', '2026-09-10'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 8, 'Agosto', '3', '2026-09-11'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 8, 'Agosto', '4', '2026-09-14'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 8, 'Agosto', '5', '2026-09-15'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 8, 'Agosto', '6', '2026-09-16'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 8, 'Agosto', '7', '2026-09-17'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 8, 'Agosto', '8', '2026-09-18'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 8, 'Agosto', '9', '2026-09-21'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 9, 'Septiembre', '0', '2026-10-23'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 9, 'Septiembre', '1', '2026-10-09'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 9, 'Septiembre', '2', '2026-10-13'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 9, 'Septiembre', '3', '2026-10-14'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 9, 'Septiembre', '4', '2026-10-15'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 9, 'Septiembre', '5', '2026-10-16'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 9, 'Septiembre', '6', '2026-10-19'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 9, 'Septiembre', '7', '2026-10-20'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 9, 'Septiembre', '8', '2026-10-21'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 9, 'Septiembre', '9', '2026-10-22'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 10, 'Octubre', '0', '2026-11-25'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 10, 'Octubre', '1', '2026-11-11'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 10, 'Octubre', '2', '2026-11-12'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 10, 'Octubre', '3', '2026-11-13'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 10, 'Octubre', '4', '2026-11-17'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 10, 'Octubre', '5', '2026-11-18'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 10, 'Octubre', '6', '2026-11-19'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 10, 'Octubre', '7', '2026-11-20'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 10, 'Octubre', '8', '2026-11-23'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 10, 'Octubre', '9', '2026-11-24'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 11, 'Noviembre', '0', '2026-12-23'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 11, 'Noviembre', '1', '2026-12-10'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 11, 'Noviembre', '2', '2026-12-11'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 11, 'Noviembre', '3', '2026-12-14'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 11, 'Noviembre', '4', '2026-12-15'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 11, 'Noviembre', '5', '2026-12-16'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 11, 'Noviembre', '6', '2026-12-17'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 11, 'Noviembre', '7', '2026-12-18'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 11, 'Noviembre', '8', '2026-12-21'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 11, 'Noviembre', '9', '2026-12-22'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 12, 'Diciembre', '0', '2027-01-26'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 12, 'Diciembre', '1', '2027-01-13'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 12, 'Diciembre', '2', '2027-01-14'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 12, 'Diciembre', '3', '2027-01-15'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 12, 'Diciembre', '4', '2027-01-18'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 12, 'Diciembre', '5', '2027-01-19'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 12, 'Diciembre', '6', '2027-01-20'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 12, 'Diciembre', '7', '2027-01-21'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 12, 'Diciembre', '8', '2027-01-22'),
  (2026, 'retencion', 'Retención en la fuente (mensual)', 1, 12, 'Diciembre', '9', '2027-01-25'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 1, 'Ene–Abr', '0', '2026-05-26'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 1, 'Ene–Abr', '1', '2026-05-12'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 1, 'Ene–Abr', '2', '2026-05-13'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 1, 'Ene–Abr', '3', '2026-05-14'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 1, 'Ene–Abr', '4', '2026-05-15'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 1, 'Ene–Abr', '5', '2026-05-19'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 1, 'Ene–Abr', '6', '2026-05-20'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 1, 'Ene–Abr', '7', '2026-05-21'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 1, 'Ene–Abr', '8', '2026-05-22'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 1, 'Ene–Abr', '9', '2026-05-25'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 2, 'May–Ago', '0', '2026-09-22'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 2, 'May–Ago', '1', '2026-09-09'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 2, 'May–Ago', '2', '2026-09-10'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 2, 'May–Ago', '3', '2026-09-11'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 2, 'May–Ago', '4', '2026-09-14'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 2, 'May–Ago', '5', '2026-09-15'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 2, 'May–Ago', '6', '2026-09-16'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 2, 'May–Ago', '7', '2026-09-17'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 2, 'May–Ago', '8', '2026-09-18'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 2, 'May–Ago', '9', '2026-09-21'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 3, 'Sep–Dic', '0', '2027-01-26'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 3, 'Sep–Dic', '1', '2027-01-13'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 3, 'Sep–Dic', '2', '2027-01-14'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 3, 'Sep–Dic', '3', '2027-01-15'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 3, 'Sep–Dic', '4', '2027-01-18'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 3, 'Sep–Dic', '5', '2027-01-19'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 3, 'Sep–Dic', '6', '2027-01-20'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 3, 'Sep–Dic', '7', '2027-01-21'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 3, 'Sep–Dic', '8', '2027-01-22'),
  (2026, 'iva_cuatrimestral', 'IVA cuatrimestral', 1, 3, 'Sep–Dic', '9', '2027-01-25'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '01-02', '2026-08-12'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '03-04', '2026-08-13'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '05-06', '2026-08-14'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '07-08', '2026-08-18'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '09-10', '2026-08-19'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '11-12', '2026-08-20'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '13-14', '2026-08-21'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '15-16', '2026-08-24'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '17-18', '2026-08-25'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '19-20', '2026-08-26'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '21-22', '2026-08-27'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '23-24', '2026-08-28'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '25-26', '2026-08-31'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '27-28', '2026-09-01'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '29-30', '2026-09-02'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '31-32', '2026-09-03'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '33-34', '2026-09-04'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '35-36', '2026-09-07'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '37-38', '2026-09-08'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '39-40', '2026-09-09'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '41-42', '2026-09-10'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '43-44', '2026-09-11'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '45-46', '2026-09-14'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '47-48', '2026-09-15'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '49-50', '2026-09-16'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '51-52', '2026-09-17'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '53-54', '2026-09-18'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '55-56', '2026-09-21'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '57-58', '2026-09-22'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '59-60', '2026-09-23'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '61-62', '2026-09-24'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '63-64', '2026-09-25'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '65-66', '2026-09-28'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '67-68', '2026-10-01'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '69-70', '2026-10-02'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '71-72', '2026-10-05'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '73-74', '2026-10-06'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '75-76', '2026-10-07'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '77-78', '2026-10-08'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '79-80', '2026-10-09'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '81-82', '2026-10-13'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '83-84', '2026-10-14'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '85-86', '2026-10-15'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '87-88', '2026-10-16'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '89-90', '2026-10-19'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '91-92', '2026-10-20'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '93-94', '2026-10-21'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '95-96', '2026-10-22'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '97-98', '2026-10-23'),
  (2026, 'renta_pn', 'Renta personas naturales', 2, 1, 'Año gravable 2025', '99-00', '2026-10-26'),
  (2026, 'simple', 'Régimen Simple', 1, 1, 'Declaración consolidada de IVA · año 2025', '0', '2026-02-20'),
  (2026, 'simple', 'Régimen Simple', 1, 1, 'Declaración consolidada de IVA · año 2025', '1', '2026-02-16'),
  (2026, 'simple', 'Régimen Simple', 1, 1, 'Declaración consolidada de IVA · año 2025', '2', '2026-02-16'),
  (2026, 'simple', 'Régimen Simple', 1, 1, 'Declaración consolidada de IVA · año 2025', '3', '2026-02-17'),
  (2026, 'simple', 'Régimen Simple', 1, 1, 'Declaración consolidada de IVA · año 2025', '4', '2026-02-17'),
  (2026, 'simple', 'Régimen Simple', 1, 1, 'Declaración consolidada de IVA · año 2025', '5', '2026-02-18'),
  (2026, 'simple', 'Régimen Simple', 1, 1, 'Declaración consolidada de IVA · año 2025', '6', '2026-02-18'),
  (2026, 'simple', 'Régimen Simple', 1, 1, 'Declaración consolidada de IVA · año 2025', '7', '2026-02-19'),
  (2026, 'simple', 'Régimen Simple', 1, 1, 'Declaración consolidada de IVA · año 2025', '8', '2026-02-19'),
  (2026, 'simple', 'Régimen Simple', 1, 1, 'Declaración consolidada de IVA · año 2025', '9', '2026-02-20'),
  (2026, 'simple', 'Régimen Simple', 1, 2, 'Declaración anual consolidada · año 2025', '0', '2026-04-24'),
  (2026, 'simple', 'Régimen Simple', 1, 2, 'Declaración anual consolidada · año 2025', '1', '2026-04-20'),
  (2026, 'simple', 'Régimen Simple', 1, 2, 'Declaración anual consolidada · año 2025', '2', '2026-04-20'),
  (2026, 'simple', 'Régimen Simple', 1, 2, 'Declaración anual consolidada · año 2025', '3', '2026-04-21'),
  (2026, 'simple', 'Régimen Simple', 1, 2, 'Declaración anual consolidada · año 2025', '4', '2026-04-21'),
  (2026, 'simple', 'Régimen Simple', 1, 2, 'Declaración anual consolidada · año 2025', '5', '2026-04-22'),
  (2026, 'simple', 'Régimen Simple', 1, 2, 'Declaración anual consolidada · año 2025', '6', '2026-04-22'),
  (2026, 'simple', 'Régimen Simple', 1, 2, 'Declaración anual consolidada · año 2025', '7', '2026-04-23'),
  (2026, 'simple', 'Régimen Simple', 1, 2, 'Declaración anual consolidada · año 2025', '8', '2026-04-23'),
  (2026, 'simple', 'Régimen Simple', 1, 2, 'Declaración anual consolidada · año 2025', '9', '2026-04-24'),
  (2026, 'simple', 'Régimen Simple', 1, 3, 'Anticipo Ene–Feb', '0', '2026-05-26'),
  (2026, 'simple', 'Régimen Simple', 1, 3, 'Anticipo Ene–Feb', '1', '2026-05-12'),
  (2026, 'simple', 'Régimen Simple', 1, 3, 'Anticipo Ene–Feb', '2', '2026-05-13'),
  (2026, 'simple', 'Régimen Simple', 1, 3, 'Anticipo Ene–Feb', '3', '2026-05-14'),
  (2026, 'simple', 'Régimen Simple', 1, 3, 'Anticipo Ene–Feb', '4', '2026-05-15'),
  (2026, 'simple', 'Régimen Simple', 1, 3, 'Anticipo Ene–Feb', '5', '2026-05-19'),
  (2026, 'simple', 'Régimen Simple', 1, 3, 'Anticipo Ene–Feb', '6', '2026-05-20'),
  (2026, 'simple', 'Régimen Simple', 1, 3, 'Anticipo Ene–Feb', '7', '2026-05-21'),
  (2026, 'simple', 'Régimen Simple', 1, 3, 'Anticipo Ene–Feb', '8', '2026-05-22'),
  (2026, 'simple', 'Régimen Simple', 1, 3, 'Anticipo Ene–Feb', '9', '2026-05-25'),
  (2026, 'simple', 'Régimen Simple', 1, 4, 'Anticipo Mar–Abr', '0', '2026-06-24'),
  (2026, 'simple', 'Régimen Simple', 1, 4, 'Anticipo Mar–Abr', '1', '2026-06-10'),
  (2026, 'simple', 'Régimen Simple', 1, 4, 'Anticipo Mar–Abr', '2', '2026-06-11'),
  (2026, 'simple', 'Régimen Simple', 1, 4, 'Anticipo Mar–Abr', '3', '2026-06-12'),
  (2026, 'simple', 'Régimen Simple', 1, 4, 'Anticipo Mar–Abr', '4', '2026-06-16'),
  (2026, 'simple', 'Régimen Simple', 1, 4, 'Anticipo Mar–Abr', '5', '2026-06-17'),
  (2026, 'simple', 'Régimen Simple', 1, 4, 'Anticipo Mar–Abr', '6', '2026-06-18'),
  (2026, 'simple', 'Régimen Simple', 1, 4, 'Anticipo Mar–Abr', '7', '2026-06-19'),
  (2026, 'simple', 'Régimen Simple', 1, 4, 'Anticipo Mar–Abr', '8', '2026-06-22'),
  (2026, 'simple', 'Régimen Simple', 1, 4, 'Anticipo Mar–Abr', '9', '2026-06-23'),
  (2026, 'simple', 'Régimen Simple', 1, 5, 'Anticipo May–Jun', '0', '2026-07-24'),
  (2026, 'simple', 'Régimen Simple', 1, 5, 'Anticipo May–Jun', '1', '2026-07-09'),
  (2026, 'simple', 'Régimen Simple', 1, 5, 'Anticipo May–Jun', '2', '2026-07-10'),
  (2026, 'simple', 'Régimen Simple', 1, 5, 'Anticipo May–Jun', '3', '2026-07-14'),
  (2026, 'simple', 'Régimen Simple', 1, 5, 'Anticipo May–Jun', '4', '2026-07-15'),
  (2026, 'simple', 'Régimen Simple', 1, 5, 'Anticipo May–Jun', '5', '2026-07-16'),
  (2026, 'simple', 'Régimen Simple', 1, 5, 'Anticipo May–Jun', '6', '2026-07-17'),
  (2026, 'simple', 'Régimen Simple', 1, 5, 'Anticipo May–Jun', '7', '2026-07-21'),
  (2026, 'simple', 'Régimen Simple', 1, 5, 'Anticipo May–Jun', '8', '2026-07-22'),
  (2026, 'simple', 'Régimen Simple', 1, 5, 'Anticipo May–Jun', '9', '2026-07-23'),
  (2026, 'simple', 'Régimen Simple', 1, 6, 'Anticipo Jul–Ago', '0', '2026-09-22'),
  (2026, 'simple', 'Régimen Simple', 1, 6, 'Anticipo Jul–Ago', '1', '2026-09-09'),
  (2026, 'simple', 'Régimen Simple', 1, 6, 'Anticipo Jul–Ago', '2', '2026-09-10'),
  (2026, 'simple', 'Régimen Simple', 1, 6, 'Anticipo Jul–Ago', '3', '2026-09-11'),
  (2026, 'simple', 'Régimen Simple', 1, 6, 'Anticipo Jul–Ago', '4', '2026-09-14'),
  (2026, 'simple', 'Régimen Simple', 1, 6, 'Anticipo Jul–Ago', '5', '2026-09-15'),
  (2026, 'simple', 'Régimen Simple', 1, 6, 'Anticipo Jul–Ago', '6', '2026-09-16'),
  (2026, 'simple', 'Régimen Simple', 1, 6, 'Anticipo Jul–Ago', '7', '2026-09-17'),
  (2026, 'simple', 'Régimen Simple', 1, 6, 'Anticipo Jul–Ago', '8', '2026-09-18'),
  (2026, 'simple', 'Régimen Simple', 1, 6, 'Anticipo Jul–Ago', '9', '2026-09-21'),
  (2026, 'simple', 'Régimen Simple', 1, 7, 'Anticipo Sep–Oct', '0', '2026-11-25'),
  (2026, 'simple', 'Régimen Simple', 1, 7, 'Anticipo Sep–Oct', '1', '2026-11-11'),
  (2026, 'simple', 'Régimen Simple', 1, 7, 'Anticipo Sep–Oct', '2', '2026-11-12'),
  (2026, 'simple', 'Régimen Simple', 1, 7, 'Anticipo Sep–Oct', '3', '2026-11-13'),
  (2026, 'simple', 'Régimen Simple', 1, 7, 'Anticipo Sep–Oct', '4', '2026-11-17'),
  (2026, 'simple', 'Régimen Simple', 1, 7, 'Anticipo Sep–Oct', '5', '2026-11-18'),
  (2026, 'simple', 'Régimen Simple', 1, 7, 'Anticipo Sep–Oct', '6', '2026-11-19'),
  (2026, 'simple', 'Régimen Simple', 1, 7, 'Anticipo Sep–Oct', '7', '2026-11-20'),
  (2026, 'simple', 'Régimen Simple', 1, 7, 'Anticipo Sep–Oct', '8', '2026-11-23'),
  (2026, 'simple', 'Régimen Simple', 1, 7, 'Anticipo Sep–Oct', '9', '2026-11-24'),
  (2026, 'simple', 'Régimen Simple', 1, 8, 'Anticipo Nov–Dic', '0', '2027-01-26'),
  (2026, 'simple', 'Régimen Simple', 1, 8, 'Anticipo Nov–Dic', '1', '2027-01-13'),
  (2026, 'simple', 'Régimen Simple', 1, 8, 'Anticipo Nov–Dic', '2', '2027-01-14'),
  (2026, 'simple', 'Régimen Simple', 1, 8, 'Anticipo Nov–Dic', '3', '2027-01-15'),
  (2026, 'simple', 'Régimen Simple', 1, 8, 'Anticipo Nov–Dic', '4', '2027-01-18'),
  (2026, 'simple', 'Régimen Simple', 1, 8, 'Anticipo Nov–Dic', '5', '2027-01-19'),
  (2026, 'simple', 'Régimen Simple', 1, 8, 'Anticipo Nov–Dic', '6', '2027-01-20'),
  (2026, 'simple', 'Régimen Simple', 1, 8, 'Anticipo Nov–Dic', '7', '2027-01-21'),
  (2026, 'simple', 'Régimen Simple', 1, 8, 'Anticipo Nov–Dic', '8', '2027-01-22'),
  (2026, 'simple', 'Régimen Simple', 1, 8, 'Anticipo Nov–Dic', '9', '2027-01-25'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 1, '1a. cuota (declaración y pago)', '0', '2026-05-26'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 1, '1a. cuota (declaración y pago)', '1', '2026-05-12'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 1, '1a. cuota (declaración y pago)', '2', '2026-05-13'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 1, '1a. cuota (declaración y pago)', '3', '2026-05-14'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 1, '1a. cuota (declaración y pago)', '4', '2026-05-15'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 1, '1a. cuota (declaración y pago)', '5', '2026-05-19'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 1, '1a. cuota (declaración y pago)', '6', '2026-05-20'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 1, '1a. cuota (declaración y pago)', '7', '2026-05-21'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 1, '1a. cuota (declaración y pago)', '8', '2026-05-22'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 1, '1a. cuota (declaración y pago)', '9', '2026-05-25'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 2, '2a. cuota', '0', '2026-07-24'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 2, '2a. cuota', '1', '2026-07-09'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 2, '2a. cuota', '2', '2026-07-10'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 2, '2a. cuota', '3', '2026-07-14'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 2, '2a. cuota', '4', '2026-07-15'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 2, '2a. cuota', '5', '2026-07-16'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 2, '2a. cuota', '6', '2026-07-17'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 2, '2a. cuota', '7', '2026-07-21'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 2, '2a. cuota', '8', '2026-07-22'),
  (2026, 'renta_pj', 'Renta personas jurídicas', 1, 2, '2a. cuota', '9', '2026-07-23')
on conflict (anio, obligacion, periodo, clave) do update
  set fecha = excluded.fecha, obligacion_nombre = excluded.obligacion_nombre, digitos = excluded.digitos, orden = excluded.orden;

-- Vencimientos de los clientes que ya existen
select public.recalcular_vencimientos(null);

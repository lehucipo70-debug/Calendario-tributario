-- ═══════════════════════════════════════════════════════════════════
-- CAMBIOS EN CLIENTES: registro de quién creó, modificó o eliminó un cliente
-- Ejecutar en Supabase → SQL Editor (se puede volver a ejecutar sin problema).
-- Requiere supabase/clientes.sql.
--
-- Cada vez que se crea, cambia o elimina un cliente (a mano, al importar un
-- Excel o al vincular un NIT), un trigger guarda una fila con la fecha, el
-- usuario y qué cambió (campo, antes y después). Lo escribe solo el trigger:
-- nadie puede editar ni borrar el registro desde la página.
--
-- Claves (clave_correo, clave_dian, …): se registra QUE cambiaron, pero no
-- su valor, para que el registro no sea otra copia de las contraseñas.
--
-- Solo los administradores (admin, lider, supervisor) leen el registro, en
-- Administración → Cambios en clientes, y reciben los avisos en tiempo real.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.clientes_cambios (
  id             bigint generated always as identity primary key,
  cliente_id     text not null,           -- sin referencia: el registro se conserva aunque se elimine el cliente
  cliente_nombre text,
  nit            text,
  accion         text not null check (accion in ('creado', 'modificado', 'eliminado')),
  cambios        jsonb not null default '[]'::jsonb,   -- [{ "campo": "correo", "antes": "…", "despues": "…" }]
  usuario_id     uuid references auth.users (id) on delete set null,
  usuario_nombre text,
  created_at     timestamptz not null default now()
);
create index if not exists clientes_cambios_fecha_idx on public.clientes_cambios (created_at desc);
create index if not exists clientes_cambios_usuario_idx on public.clientes_cambios (usuario_id, created_at desc);
create index if not exists clientes_cambios_cliente_idx on public.clientes_cambios (cliente_id, created_at desc);

-- ── Qué cambió entre dos versiones del cliente ───────────────────────
create or replace function public.clientes_diferencias(o public.clientes, n public.clientes)
returns jsonb
language plpgsql immutable
as $$
declare
  out jsonb := '[]'::jsonb;
  k text;
  a jsonb; b jsonb;
begin
  if o.nombre is distinct from n.nombre then
    out := out || jsonb_build_object('campo', 'nombre', 'antes', o.nombre, 'despues', n.nombre);
  end if;
  if coalesce(o.nit, '') is distinct from coalesce(n.nit, '') then
    out := out || jsonb_build_object('campo', 'nit', 'antes', o.nit, 'despues', n.nit);
  end if;

  -- Datos de la ficha (correo, cédula, claves, impuestos asociados, otros nombres…)
  for k in select distinct x from (
    select jsonb_object_keys(coalesce(o.datos, '{}'::jsonb)) as x
    union select jsonb_object_keys(coalesce(n.datos, '{}'::jsonb))
  ) t loop
    a := o.datos -> k; b := n.datos -> k;
    if coalesce(a, '""'::jsonb) is distinct from coalesce(b, '""'::jsonb) then
      if k like 'clave%' then
        out := out || jsonb_build_object('campo', k, 'antes', case when coalesce(a #>> '{}', '') = '' then null else '••••' end,
                                                   'despues', case when coalesce(b #>> '{}', '') = '' then null else '••••' end, 'oculto', true);
      else
        out := out || jsonb_build_object('campo', k, 'antes', a, 'despues', b);
      end if;
    end if;
  end loop;

  -- Vencimientos de firma, resolución y documento soporte
  for k in select distinct x from (
    select jsonb_object_keys(coalesce(o.vencimientos, '{}'::jsonb)) as x
    union select jsonb_object_keys(coalesce(n.vencimientos, '{}'::jsonb))
  ) t loop
    a := o.vencimientos -> k; b := n.vencimientos -> k;
    if a is distinct from b then
      out := out || jsonb_build_object('campo', 'venc:' || k, 'antes', a, 'despues', b);
    end if;
  end loop;

  return out;
end;
$$;

-- ── Registro automático ──────────────────────────────────────────────
create or replace function public.clientes_registrar_cambio()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  vacio public.clientes;
  quien text := (select p.nombre from public.perfiles p where p.id = auth.uid());
  dif jsonb;
begin
  if tg_op = 'INSERT' then
    dif := public.clientes_diferencias(vacio, new);
    insert into public.clientes_cambios (cliente_id, cliente_nombre, nit, accion, cambios, usuario_id, usuario_nombre)
    values (new.id, new.nombre, new.nit, 'creado', dif, auth.uid(), quien);
    return new;
  elsif tg_op = 'UPDATE' then
    dif := public.clientes_diferencias(old, new);
    if dif = '[]'::jsonb then return new; end if;   -- solo cambió el historial o la fecha
    insert into public.clientes_cambios (cliente_id, cliente_nombre, nit, accion, cambios, usuario_id, usuario_nombre)
    values (new.id, new.nombre, new.nit, 'modificado', dif, auth.uid(), quien);
    return new;
  else
    insert into public.clientes_cambios (cliente_id, cliente_nombre, nit, accion, cambios, usuario_id, usuario_nombre)
    values (old.id, old.nombre, old.nit, 'eliminado', '[]'::jsonb, auth.uid(), quien);
    return old;
  end if;
end;
$$;

drop trigger if exists clientes_registrar_cambio on public.clientes;
create trigger clientes_registrar_cambio
  after insert or update or delete on public.clientes
  for each row execute function public.clientes_registrar_cambio();

-- ── Permisos (RLS): solo administradores leen; nadie escribe desde la página ──
alter table public.clientes_cambios enable row level security;

drop policy if exists clientes_cambios_leer on public.clientes_cambios;
create policy clientes_cambios_leer on public.clientes_cambios
  for select to authenticated
  using (exists (
    select 1 from public.perfiles p
    where p.id = auth.uid() and lower(p.rol) in ('admin', 'lider', 'supervisor')
  ));

revoke insert, update, delete on public.clientes_cambios from authenticated, anon;
grant select on public.clientes_cambios to authenticated;

-- ── Tiempo real (avisos al instante) ─────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clientes_cambios') then
    alter publication supabase_realtime add table public.clientes_cambios;
  end if;
end $$;

notify pgrst, 'reload schema';

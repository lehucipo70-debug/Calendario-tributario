-- ═══════════════════════════════════════════════════════════════════
-- CHAT DEL EQUIPO
-- Ejecutar una sola vez en Supabase → SQL Editor.
--
-- · Canal general "Equipo": todos los usuarios lo leen y escriben.
-- · Grupos: solo un administrador los crea, edita o borra; solo sus
--   integrantes leen y escriben.
-- · Mensajes directos: privados de verdad. Solo las dos personas de la
--   conversación pueden leerlos (tampoco el administrador).
-- · Cada quien edita o borra solo sus propios mensajes.
-- Usa la función es_admin() que ya existe en el proyecto.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.chat_conversaciones (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('general', 'grupo', 'directo')),
  nombre      text not null default '',
  color       text not null default 'violeta',
  creado_por  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.chat_miembros (
  conversacion_id uuid not null references public.chat_conversaciones (id) on delete cascade,
  usuario_id      uuid not null references auth.users (id) on delete cascade,
  leido_hasta     timestamptz not null default now(),
  primary key (conversacion_id, usuario_id)
);

create table if not exists public.chat_mensajes (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.chat_conversaciones (id) on delete cascade,
  autor_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  texto           text not null check (length(texto) between 1 and 4000),
  created_at      timestamptz not null default now(),
  editado_at      timestamptz
);

create index if not exists chat_mensajes_conv_idx on public.chat_mensajes (conversacion_id, created_at desc);
create index if not exists chat_miembros_usuario_idx on public.chat_miembros (usuario_id);

-- El canal general existe siempre (un solo registro con id fijo)
insert into public.chat_conversaciones (id, tipo, nombre)
values ('00000000-0000-0000-0000-000000000001', 'general', 'Equipo')
on conflict (id) do nothing;

-- ── Funciones auxiliares (security definer: evitan recursión en las políticas) ──
create or replace function public.chat_es_miembro(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from chat_miembros m where m.conversacion_id = conv and m.usuario_id = auth.uid());
$$;

create or replace function public.chat_es_general(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from chat_conversaciones c where c.id = conv and c.tipo = 'general');
$$;

create or replace function public.chat_puede_agregar(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from chat_conversaciones c
    where c.id = conv
      and ((c.tipo = 'directo' and c.creado_por = auth.uid()) or (c.tipo = 'grupo' and public.es_admin()))
  );
$$;

-- Cada mensaje nuevo sube la conversación en la lista
create or replace function public.chat_tocar_conversacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update chat_conversaciones set updated_at = new.created_at where id = new.conversacion_id;
  return new;
end;
$$;

drop trigger if exists chat_mensajes_tocar on public.chat_mensajes;
create trigger chat_mensajes_tocar after insert on public.chat_mensajes
  for each row execute function public.chat_tocar_conversacion();

-- ── Seguridad por filas ──────────────────────────────────────────────
alter table public.chat_conversaciones enable row level security;
alter table public.chat_miembros enable row level security;
alter table public.chat_mensajes enable row level security;

-- Conversaciones
drop policy if exists chat_conv_leer on public.chat_conversaciones;
create policy chat_conv_leer on public.chat_conversaciones for select to authenticated
  using (tipo = 'general' or public.chat_es_miembro(id) or creado_por = auth.uid());

drop policy if exists chat_conv_crear on public.chat_conversaciones;
create policy chat_conv_crear on public.chat_conversaciones for insert to authenticated
  with check (creado_por = auth.uid() and (tipo = 'directo' or (tipo = 'grupo' and public.es_admin())));

drop policy if exists chat_conv_editar on public.chat_conversaciones;
create policy chat_conv_editar on public.chat_conversaciones for update to authenticated
  using (tipo = 'grupo' and public.es_admin()) with check (tipo = 'grupo' and public.es_admin());

drop policy if exists chat_conv_borrar on public.chat_conversaciones;
create policy chat_conv_borrar on public.chat_conversaciones for delete to authenticated
  using (tipo = 'grupo' and public.es_admin());

-- Integrantes
drop policy if exists chat_miembros_leer on public.chat_miembros;
create policy chat_miembros_leer on public.chat_miembros for select to authenticated
  using (usuario_id = auth.uid() or public.chat_es_miembro(conversacion_id) or public.chat_puede_agregar(conversacion_id));

drop policy if exists chat_miembros_agregar on public.chat_miembros;
create policy chat_miembros_agregar on public.chat_miembros for insert to authenticated
  with check (
    (usuario_id = auth.uid() and public.chat_es_general(conversacion_id))
    or public.chat_puede_agregar(conversacion_id)
  );

drop policy if exists chat_miembros_leido on public.chat_miembros;
create policy chat_miembros_leido on public.chat_miembros for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists chat_miembros_quitar on public.chat_miembros;
create policy chat_miembros_quitar on public.chat_miembros for delete to authenticated
  using (public.es_admin() and public.chat_puede_agregar(conversacion_id));

-- Mensajes
drop policy if exists chat_msj_leer on public.chat_mensajes;
create policy chat_msj_leer on public.chat_mensajes for select to authenticated
  using (public.chat_es_general(conversacion_id) or public.chat_es_miembro(conversacion_id));

drop policy if exists chat_msj_enviar on public.chat_mensajes;
create policy chat_msj_enviar on public.chat_mensajes for insert to authenticated
  with check (autor_id = auth.uid() and (public.chat_es_general(conversacion_id) or public.chat_es_miembro(conversacion_id)));

drop policy if exists chat_msj_editar on public.chat_mensajes;
create policy chat_msj_editar on public.chat_mensajes for update to authenticated
  using (autor_id = auth.uid())
  with check (autor_id = auth.uid() and (public.chat_es_general(conversacion_id) or public.chat_es_miembro(conversacion_id)));

drop policy if exists chat_msj_borrar on public.chat_mensajes;
create policy chat_msj_borrar on public.chat_mensajes for delete to authenticated
  using (autor_id = auth.uid());

-- Columnas que se pueden modificar: así nadie mueve su fila de integrante (ni un
-- mensaje) a otra conversación para colarse en un chat privado.
revoke update on public.chat_miembros from anon, authenticated;
grant update (leido_hasta) on public.chat_miembros to authenticated;
revoke update on public.chat_mensajes from anon, authenticated;
grant update (texto, editado_at) on public.chat_mensajes to authenticated;
revoke update on public.chat_conversaciones from anon, authenticated;
grant update (nombre, color) on public.chat_conversaciones to authenticated;

-- ── Tiempo real ──────────────────────────────────────────────────────
-- (Supabase respeta las políticas de arriba: cada quien solo recibe lo que puede leer.)
do $$ begin
  begin alter publication supabase_realtime add table public.chat_mensajes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.chat_conversaciones; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.chat_miembros; exception when duplicate_object then null; end;
end $$;

-- Que la API vea las tablas nuevas de inmediato
notify pgrst, 'reload schema';

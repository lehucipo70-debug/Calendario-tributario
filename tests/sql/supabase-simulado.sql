-- Simulación mínima de Supabase para probar los scripts SQL en un PostgreSQL local:
-- esquema auth, auth.uid(), roles anon/authenticated, publicación de tiempo real
-- y las tablas existentes del calendario anterior (perfiles, obligaciones).
create role anon nologin;
create role authenticated nologin;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;

create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
grant select on auth.users to authenticated;

create publication supabase_realtime;

create table public.perfiles (id uuid primary key references auth.users(id), nombre text, rol text, correo text);
alter table public.perfiles enable row level security;

create table public.obligaciones (
  id bigserial primary key, empresa_nit text, empresa_nombre text, contador text, impuesto text, periodo text,
  fecha_vencimiento text, grupo text, municipio text, campos_extra jsonb, estado text default 'Pendiente',
  presentado_por text, fecha_presentacion timestamptz, observaciones text
);

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'admin@x.co'),
  ('00000000-0000-0000-0000-0000000000a1', 'ana@x.co'),
  ('00000000-0000-0000-0000-0000000000c1', 'carlos@x.co');
insert into public.perfiles values
  ('00000000-0000-0000-0000-00000000000a', 'Administrador', 'admin', 'admin@x.co'),
  ('00000000-0000-0000-0000-0000000000a1', 'Ana Gomez', 'contador', 'ana@x.co'),
  ('00000000-0000-0000-0000-0000000000c1', 'Carlos Ruiz', 'colaborador', 'carlos@x.co');

insert into public.obligaciones (empresa_nit, empresa_nombre, contador, impuesto, periodo, fecha_vencimiento, grupo, estado, fecha_presentacion, observaciones) values
  ('900', 'Textiles SAS', 'ANA GOMEZ', 'IVA', 'Bimestre 5', '2026-11-10', 'JAT', 'Pendiente', null, null),
  ('900', 'Textiles SAS', 'ana gomez ', 'RETEFUENTE', 'Septiembre', '2026-10-09', 'JAT', 'Presentado', '2026-10-08 10:00-05', 'Radicado 123'),
  ('901', 'Agro SAS', 'PEDRO', 'ICA', '', '2026-10-20', null, 'Pendiente', null, ''),
  ('901', 'Agro SAS', 'PEDRO', 'RENTA', 'Anual', 'fecha inválida', 'ILP', 'Presentado', null, null),
  ('902', 'Sin impuesto', 'ANA GOMEZ', '', 'x', '2026-10-01', null, 'Pendiente', null, null);

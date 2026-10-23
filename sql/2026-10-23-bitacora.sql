-- 2026-10-23 · Bitácora de Claude (LOGICA §14): las sesiones de Claude Code se apuntan solas.
-- Una fila por sesión y una por paso (turno humano). La IA asigna cada paso a una hoy_tareas.
-- Escriben el hook y el clasificador del Mac (SUPABASE_DB_URL, owner_id puesto a mano);
-- la app sólo lee y enciende `procesar_pedido`.
begin;

create table if not exists public.hoy_cc_sesiones (
  id              text primary key,
  owner_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cwd             text not null default '',
  carpeta         text not null default '',
  titulo          text not null default '',
  resumen         text not null default '',
  inicio          timestamptz,
  ultimo          timestamptz,
  pasos           integer not null default 0,
  terminada       boolean not null default false,
  procesar_pedido boolean not null default false,
  procesada_en    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists hoy_cc_sesiones_owner_ultimo on public.hoy_cc_sesiones (owner_id, ultimo desc);

create table if not exists public.hoy_cc_pasos (
  id           text primary key,
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sesion_id    text not null references public.hoy_cc_sesiones(id) on delete cascade,
  inicio       timestamptz not null,
  fin          timestamptz not null,
  pedido       text not null default '',
  respuesta    text not null default '',
  herramientas jsonb not null default '{}'::jsonb,
  archivos     text[] not null default '{}',
  comandos     text[] not null default '{}',
  tarea_id     uuid references public.hoy_tareas(id) on delete set null,
  procesado    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists hoy_cc_pasos_sesion on public.hoy_cc_pasos (sesion_id, inicio);
create index if not exists hoy_cc_pasos_pendientes on public.hoy_cc_pasos (owner_id, sesion_id) where not procesado;
create index if not exists hoy_cc_pasos_tarea on public.hoy_cc_pasos (tarea_id) where tarea_id is not null;

alter table public.hoy_cc_sesiones enable row level security;
alter table public.hoy_cc_pasos enable row level security;
drop policy if exists hoy_cc_sesiones_propias on public.hoy_cc_sesiones;
create policy hoy_cc_sesiones_propias on public.hoy_cc_sesiones
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists hoy_cc_pasos_propios on public.hoy_cc_pasos;
create policy hoy_cc_pasos_propios on public.hoy_cc_pasos
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.hoy_cc_sesiones from anon;
revoke all on public.hoy_cc_pasos from anon;
grant select, update, delete on public.hoy_cc_sesiones to authenticated;
grant select, update, delete on public.hoy_cc_pasos to authenticated;

commit;

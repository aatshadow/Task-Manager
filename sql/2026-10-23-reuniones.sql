-- 2026-10-23 · Reuniones de Wispr Flow (LOGICA §14.7) y el tty de cada terminal para el widget (§14.8).
begin;
create table if not exists public.hoy_reuniones (
  id             text primary key,
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo         text not null default '',
  titulo_wispr   text not null default '',
  inicio         timestamptz,
  fin            timestamptz,
  minutos        integer,
  participantes  text not null default '',
  resumen        text not null default '',
  decisiones     jsonb not null default '[]'::jsonb,
  proyecto_id    uuid references public.hoy_proyectos(id) on delete set null,
  resumen_wispr  text not null default '',
  transcripcion  text not null default '',
  procesada_en   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists hoy_reuniones_owner_inicio on public.hoy_reuniones (owner_id, inicio desc);
alter table public.hoy_reuniones enable row level security;
drop policy if exists hoy_reuniones_propias on public.hoy_reuniones;
create policy hoy_reuniones_propias on public.hoy_reuniones
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.hoy_reuniones from anon;
grant select, update, delete on public.hoy_reuniones to authenticated;

alter table public.hoy_proximos add column if not exists reunion_id text references public.hoy_reuniones(id) on delete set null;
alter table public.hoy_cc_sesiones add column if not exists tty text not null default '';
commit;

-- 2026-10-22 · Overview (LOGICA §13): la ficha IA de todo 2day, por versiones.
-- Una fila por generación: las métricas que se mandaron y la ficha que devolvió Claude.
-- Nunca se pisa una versión: regenerar = INSERT. La evolución se lee de aquí.
create table if not exists public.hoy_overview (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  desde       date not null,
  hasta       date not null,
  modelo      text not null,
  metricas    jsonb not null,
  ficha       jsonb not null
);
create index if not exists hoy_overview_owner_fecha on public.hoy_overview (owner_id, created_at desc);
alter table public.hoy_overview enable row level security;
drop policy if exists hoy_overview_propias on public.hoy_overview;
create policy hoy_overview_propias on public.hoy_overview
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.hoy_overview from anon;
grant select, insert, delete on public.hoy_overview to authenticated;

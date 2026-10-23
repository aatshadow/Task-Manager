-- 2026-10-23 · Meetings (LOGICA §15): métricas de habla por reunión y la ficha IA del comunicador, por versiones.
begin;
alter table public.hoy_reuniones add column if not exists metricas jsonb;
alter table public.hoy_reuniones add column if not exists hablantes jsonb not null default '{}'::jsonb;

-- Una fila por versión. La app pide una nueva insertando `estado = 'pedido'`; el Mac la rellena
-- (claude -p con la suscripción) y la deja en 'listo' (o 'error'). Nunca se pisa una versión lista.
create table if not exists public.hoy_meetings_perfil (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  estado      text not null default 'pedido' check (estado in ('pedido','listo','error')),
  desde       date,
  hasta       date,
  modelo      text,
  metricas    jsonb,
  ficha       jsonb,
  error       text
);
create index if not exists hoy_meetings_perfil_owner on public.hoy_meetings_perfil (owner_id, created_at desc);
alter table public.hoy_meetings_perfil enable row level security;
drop policy if exists hoy_meetings_perfil_propias on public.hoy_meetings_perfil;
create policy hoy_meetings_perfil_propias on public.hoy_meetings_perfil
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.hoy_meetings_perfil from anon;
grant select, insert, delete on public.hoy_meetings_perfil to authenticated;
commit;

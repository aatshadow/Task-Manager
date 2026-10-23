-- 2026-10-23 · Próximos pasos (LOGICA §14.6): lo que toca después de cada sesión, para validar.
begin;
create table if not exists public.hoy_proximos (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sesion_id    text references public.hoy_cc_sesiones(id) on delete set null,
  titulo       text not null,
  descripcion  text not null default '',
  proyecto_id  uuid references public.hoy_proyectos(id) on delete set null,
  categoria    text,
  cuadrante    text check (cuadrante in ('q1','q2','q3','q4')),
  dia          date,
  minutos      integer,
  orden        integer not null default 0,
  estado       text not null default 'propuesto' check (estado in ('propuesto','aceptado','descartado')),
  tarea_id     uuid references public.hoy_tareas(id) on delete set null,
  origen       text not null default 'ia' check (origen in ('ia','claude')),
  decidido_en  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists hoy_proximos_propuestos on public.hoy_proximos (owner_id, estado, dia);
create index if not exists hoy_proximos_sesion on public.hoy_proximos (sesion_id);
alter table public.hoy_proximos enable row level security;
drop policy if exists hoy_proximos_propios on public.hoy_proximos;
create policy hoy_proximos_propios on public.hoy_proximos
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.hoy_proximos from anon;
grant select, insert, update, delete on public.hoy_proximos to authenticated;
commit;

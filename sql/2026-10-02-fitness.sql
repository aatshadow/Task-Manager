-- ═══════════════════════════════════════════════════════════════════════════════
-- 2day — Fitness: sesiones por día y medidas
-- 02-10-2026 · decide Alex · ver ~/CORE/2day/LOGICA.md (§11)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- QUÉ ES. Una sesión por FECHA (no por día de la semana, como el plan de §10.3) con los
-- ejercicios del día (`lineas`) y lo que se mide (`pruebas`), y una tabla de medidas
-- (fecha, clave, valor). Las sesiones las escribe CORE; la app las enseña y recoge las
-- medidas. Los tiempos se guardan en segundos.
--
-- IDEMPOTENTE: se puede aplicar dos veces.
-- Misma regla de siempre: `owner_id = auth.uid()` en los cuatro verbos, `revoke` a anon.

begin;

-- ── ① SESIONES: una por fecha ────────────────────────────────────────────────
create table if not exists public.hoy_fit_sesiones (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  fecha      date not null,
  titulo     text not null,
  lineas     jsonb not null default '[]'::jsonb,
  pruebas    jsonb not null default '[]'::jsonb,
  nota       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, fecha)
);

-- ── ② MEDIDAS: (fecha, clave) → valor ────────────────────────────────────────
-- La clave es estable entre re-tests (`sentadilla_5rm`); el valor va en la unidad de la
-- prueba y los tiempos en segundos.
create table if not exists public.hoy_fit_marcas (
  owner_id   uuid not null default auth.uid(),
  fecha      date not null,
  clave      text not null,
  valor      numeric not null,
  marcado_en timestamptz not null default now(),
  primary key (owner_id, fecha, clave)
);
create index if not exists idx_hoy_fit_marcas_clave on public.hoy_fit_marcas(owner_id, clave, fecha);

-- ── ③ updated_at ─────────────────────────────────────────────────────────────
drop trigger if exists trg_hoy_fit_sesiones_touch on public.hoy_fit_sesiones;
create trigger trg_hoy_fit_sesiones_touch before update on public.hoy_fit_sesiones
  for each row execute function public.hoy_touch();

-- ── ④ RLS + EL MURO ──────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['hoy_fit_sesiones','hoy_fit_marcas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists p_%1$s_owner on public.%1$I', t);
    execute format('create policy p_%1$s_owner on public.%1$I for all
                      using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

commit;

-- ── COMPROBACIÓN (tests/forma.mjs · tests/fitness.mjs) ───────────────────────
--   select grantee from information_schema.role_table_grants
--    where table_name in ('hoy_fit_sesiones','hoy_fit_marcas') and grantee='anon';  -- 0 filas

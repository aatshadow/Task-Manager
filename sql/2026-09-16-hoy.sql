-- ═══════════════════════════════════════════════════════════════════════════════
-- 2day — gestor de tareas y hábitos de Alex, sobre la base de GrowthInfo
-- 16-09-2026 · decide Alex · ver ~/CORE/2day/LOGICA.md (§2)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- POR QUÉ ESTÁ EN ESTA BASE. Alex, 16-09: *«que sea bidireccional con las tareas de
-- GrowthInfo […] simplemente utilizan la misma base de datos»*. Una tarea de GrowthInfo no
-- se copia: 2day lee y escribe LA MISMA FILA de `public.tasks` (misma fila, dos puertas,
-- como `✅│task-afiliados`). Lo que `tasks` no sabe guardar de Alex va en `hoy_capa`.
--
-- QUIÉN VE QUÉ: un solo usuario. Todas las `hoy_*` llevan `owner_id = auth.uid()` en los
-- cuatro verbos y `revoke` a `anon` (la RLS es la puerta, el GRANT es el muro — regla de
-- la casa desde `sales`). Nada de esto aparece en el portal: el portal no lee `hoy_*`.

begin;

-- ── ① AJUSTES ────────────────────────────────────────────────────────────────
create table if not exists public.hoy_ajustes (
  owner_id       uuid primary key default auth.uid(),
  hora_reinicio  time not null default '04:00',
  dias_nevera    integer not null default 30 check (dias_nevera >= 0),
  dias_bandeja   integer not null default 7 check (dias_bandeja >= 0),
  -- Eisenhower fijo (4 cuadrantes), etiqueta y color editables (decisión 5).
  cuadrantes     jsonb not null default '{
    "q1": {"nombre": "Urgente e importante",     "color": "#d7263d"},
    "q2": {"nombre": "Importante, no urgente",   "color": "#ff6a1a"},
    "q3": {"nombre": "Urgente, no importante",   "color": "#e8b13a"},
    "q4": {"nombre": "Ni urgente ni importante", "color": "#8a8f98"}
  }'::jsonb,
  updated_at     timestamptz not null default now()
);

-- ── ② PROYECTOS PROPIOS ──────────────────────────────────────────────────────
-- Los clientes de GrowthInfo NO están aquí: entran solos como proyectos «de cliente»
-- leídos de `clients` (una tarea del portal lleva `client_id`, una personal `proyecto_id`).
create table if not exists public.hoy_proyectos (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid(),
  nombre       text not null,
  color        text not null default '#ff6a1a',
  icono        text not null default '',
  posicion     integer not null default 0,
  archivado_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_hoy_proyectos_owner on public.hoy_proyectos(owner_id, posicion);

-- ── ③ CATEGORÍAS ─────────────────────────────────────────────────────────────
-- `clave` es el identificador estable (la tarea guarda la clave, no el nombre). Se
-- siembran las 7 del portal con SUS claves para que una tarea del portal se pinte nativa.
create table if not exists public.hoy_categorias (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid(),
  clave        text not null,
  nombre       text not null,
  color        text not null default '#8a8f98',
  posicion     integer not null default 0,
  archivado_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (owner_id, clave)
);

-- ── ④ PIPELINES Y ETAPAS (solo tareas personales) ────────────────────────────
create table if not exists public.hoy_pipelines (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid(),
  nombre       text not null,
  es_default   boolean not null default false,
  posicion     integer not null default 0,
  archivado_at timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists uq_hoy_pipelines_default on public.hoy_pipelines(owner_id) where es_default;

create table if not exists public.hoy_etapas (
  id          uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.hoy_pipelines(id) on delete cascade,
  nombre      text not null,
  clave       text not null,
  color       text not null default '#8a8f98',
  posicion    integer not null default 0,
  es_terminal boolean not null default false,
  unique (pipeline_id, clave)
);
create index if not exists idx_hoy_etapas_pipeline on public.hoy_etapas(pipeline_id, posicion);

-- ── ⑤ TAREAS PERSONALES ──────────────────────────────────────────────────────
-- Mismo vocabulario de estado que `tasks.status`, a propósito: la vista `hoy_todas` une
-- las dos y una sola columna `estado` tiene que significar lo mismo venga de donde venga.
create table if not exists public.hoy_tareas (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid(),
  titulo         text not null,
  descripcion    text not null default '',
  proyecto_id    uuid references public.hoy_proyectos(id) on delete set null,
  categoria      text,
  pipeline_id    uuid references public.hoy_pipelines(id) on delete set null,
  etapa_id       uuid references public.hoy_etapas(id) on delete set null,
  estado         text not null default 'todo'
                 check (estado in ('todo','in_progress','review','blocked','done')),
  inicio         date,
  vence          date,
  responsable_id uuid references public.team_members(id) on delete set null,
  hecha          boolean not null default false,
  hecha_en       timestamptz,
  posicion       numeric not null default 0,
  archivado_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_hoy_tareas_owner on public.hoy_tareas(owner_id, hecha, vence) where archivado_at is null;
create index if not exists idx_hoy_tareas_etapa on public.hoy_tareas(etapa_id, posicion);

-- ── ⑥ LA CAPA PERSONAL, para cualquier tarea ─────────────────────────────────
-- `tarea_id` apunta a `hoy_tareas.id` o a `tasks.id` según `origen`. Sin FK a propósito:
-- una FK no puede apuntar a dos tablas, y una capa huérfana no cuenta nada de nadie.
create table if not exists public.hoy_capa (
  tarea_id    uuid primary key,
  owner_id    uuid not null default auth.uid(),
  origen      text not null check (origen in ('hoy','portal')),
  cuadrante   text check (cuadrante in ('q1','q2','q3','q4')),
  hoy_para    date,
  orden       numeric not null default 0,
  hora_inicio time,
  hora_fin    time,
  seguida     boolean not null default false,
  notas       text not null default '',
  updated_at  timestamptz not null default now()
);
create index if not exists idx_hoy_capa_hoy on public.hoy_capa(owner_id, hoy_para) where hoy_para is not null;

-- ── ⑦ EL DÍA (lo único que no se puede derivar después) ──────────────────────
create table if not exists public.hoy_dias (
  owner_id     uuid not null default auth.uid(),
  fecha        date not null,
  planificadas integer not null default 0,
  hechas       integer not null default 0,
  nota         text not null default '',
  cerrado_en   timestamptz not null default now(),
  primary key (owner_id, fecha)
);

-- ── ⑧ HÁBITOS ────────────────────────────────────────────────────────────────
-- Cadencia: diario · dias (1=lunes … 7=domingo, ISO) · semana (X veces, el día da igual).
-- Un hábito no se borra: se archiva (regla 6 de LOGICA.md §3).
create table if not exists public.hoy_habitos (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid(),
  nombre       text not null,
  icono        text not null default '',
  color        text not null default '#ff6a1a',
  cadencia     text not null default 'diario' check (cadencia in ('diario','dias','semana')),
  dias         smallint[] not null default '{}',
  veces_semana integer not null default 1 check (veces_semana between 1 and 7),
  posicion     integer not null default 0,
  archivado_at timestamptz,
  created_at   timestamptz not null default now()
);
create table if not exists public.hoy_marcas (
  habito_id uuid not null references public.hoy_habitos(id) on delete cascade,
  fecha     date not null,
  nota      text not null default '',
  marcado_en timestamptz not null default now(),
  primary key (habito_id, fecha)
);

-- ── ⑨ PLANTILLAS ─────────────────────────────────────────────────────────────
create table if not exists public.hoy_plantillas (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid(),
  nombre      text not null,
  descripcion text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table if not exists public.hoy_plantilla_items (
  id           uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references public.hoy_plantillas(id) on delete cascade,
  titulo       text not null,
  descripcion  text not null default '',
  categoria    text,
  cuadrante    text check (cuadrante in ('q1','q2','q3','q4')),
  grupo        text,
  dias_offset  integer not null default 0,
  posicion     integer not null default 0
);
create index if not exists idx_hoy_pi_plantilla on public.hoy_plantilla_items(plantilla_id, posicion);

-- ── ⑩ updated_at + hecha/hecha_en sin depender de la app ─────────────────────
create or replace function public.hoy_touch()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  new.updated_at := now();
  if tg_table_name = 'hoy_tareas' then
    if new.hecha and not coalesce(old.hecha, false) then new.hecha_en := now(); end if;
    if not new.hecha then new.hecha_en := null; end if;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['hoy_ajustes','hoy_proyectos','hoy_tareas','hoy_capa','hoy_plantillas'] loop
    execute format('drop trigger if exists trg_%1$s_touch on public.%1$I', t);
    execute format('create trigger trg_%1$s_touch before update on public.%1$I for each row execute function public.hoy_touch()', t);
  end loop;
end $$;
-- Una personal que nace hecha (raro, pero posible al importar) también lleva hecha_en.
create or replace function public.hoy_tareas_nace()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.hecha and new.hecha_en is null then new.hecha_en := now(); end if;
  return new;
end $$;
drop trigger if exists trg_hoy_tareas_nace on public.hoy_tareas;
create trigger trg_hoy_tareas_nace before insert on public.hoy_tareas
  for each row execute function public.hoy_tareas_nace();

-- ── ⑪ MI FICHA DE EQUIPO ─────────────────────────────────────────────────────
-- La fila de `team_members` con mi `user_id`. La de Accelerator Launch no tiene user_id y
-- Alex no quiere enlazarla («no soy yo»), así que aquí no entra.
create or replace function public.hoy_mi_ficha()
returns uuid language sql stable security definer set search_path to '' as $$
  select id from public.team_members where user_id = auth.uid() and active order by created_at limit 1
$$;

-- ── ⑫ LA VISTA: todas mis tareas, vengan de donde vengan ─────────────────────
-- `security_invoker`: la rama de `tasks` hereda la RLS del portal (sin cabecera x-portal la
-- sesión cae en `growthinfo`, que es exactamente lo decidido: nada de Accelerator Launch).
drop view if exists public.hoy_todas;
create view public.hoy_todas with (security_invoker = on) as
  select t.id, 'hoy'::text as origen, t.titulo, t.descripcion,
         t.proyecto_id, null::text as client_id, t.categoria,
         t.pipeline_id, t.etapa_id, t.estado, t.inicio, t.vence,
         t.responsable_id, '{}'::uuid[] as participantes,
         t.hecha, t.hecha_en, t.archivado_at, t.created_at, t.updated_at, t.posicion,
         c.cuadrante, c.hoy_para, coalesce(c.orden, 0) as orden, c.hora_inicio, c.hora_fin,
         coalesce(c.seguida, false) as seguida, coalesce(c.notas, '') as notas,
         null::text as prioridad_portal, null::text as fase
    from public.hoy_tareas t
    left join public.hoy_capa c on c.tarea_id = t.id and c.owner_id = t.owner_id
   where t.owner_id = auth.uid()
  union all
  select k.id, 'portal'::text, k.title, k.description,
         null::uuid, k.client_id, k.category,
         k.pipeline_id, k.stage_id, k.status, k.start_date, k.due_date,
         k.assignee_id, k.assignees,
         k.completed, k.completed_at, k.archived_at, k.created_at, k.updated_at, k.position,
         c.cuadrante, c.hoy_para, coalesce(c.orden, 0), c.hora_inicio, c.hora_fin,
         coalesce(c.seguida, false), coalesce(c.notas, ''),
         k.priority, k.fase
    from public.tasks k
    left join public.hoy_capa c on c.tarea_id = k.id and c.owner_id = auth.uid()
   where k.assignee_id = public.hoy_mi_ficha()
      or public.hoy_mi_ficha() = any (k.assignees)
      or k.created_by = auth.uid()
      or coalesce(c.seguida, false);

-- ── ⑬ SEMBRAR (idempotente) ──────────────────────────────────────────────────
create or replace function public.hoy_sembrar()
returns void language plpgsql security invoker set search_path to '' as $$
declare v_pipe uuid;
begin
  insert into public.hoy_ajustes (owner_id) values (auth.uid()) on conflict do nothing;
  insert into public.hoy_categorias (owner_id, clave, nombre, color, posicion)
  select auth.uid(), x.clave, x.nombre, x.color, x.pos from (values
    ('proyecto','Proyecto','#4c8dff',0), ('soporte','Soporte','#c77dff',1),
    ('contenido','Contenido','#38bdf8',2), ('ventas','Ventas','#e8b13a',3),
    ('ia','IA','#7f8cff',4), ('afiliados','Afiliados','#e8629a',5),
    ('general','General','#8a8f98',6)) as x(clave, nombre, color, pos)
  on conflict (owner_id, clave) do nothing;
  select id into v_pipe from public.hoy_pipelines where owner_id = auth.uid() and es_default;
  if v_pipe is null then
    insert into public.hoy_pipelines (owner_id, nombre, es_default, posicion)
    values (auth.uid(), 'Principal', true, 0) returning id into v_pipe;
  end if;
  insert into public.hoy_etapas (pipeline_id, nombre, clave, color, posicion, es_terminal)
  select v_pipe, x.nombre, x.clave, x.color, x.pos, x.term from (values
    ('Por hacer','todo','#8a8f98',0,false), ('En curso','in_progress','#4c8dff',1,false),
    ('En revisión','review','#a56bff',2,false), ('Bloqueado','blocked','#f2545b',3,false),
    ('Hecho','done','#3fb950',4,true)) as x(nombre, clave, color, pos, term)
  on conflict (pipeline_id, clave) do nothing;
end $$;

-- ── ⑭ REINICIAR EL DÍA ───────────────────────────────────────────────────────
-- Para cada día planificado anterior a `p_hoy`: apunta planificadas/hechas en `hoy_dias` y
-- quita `hoy_para` a las NO hechas (vuelven a «Siguiente»). Las hechas conservan la fecha:
-- son historia. Idempotente: un día ya cerrado no se reescribe.
create or replace function public.hoy_reiniciar_dia(p_hoy date)
returns setof public.hoy_dias language plpgsql security invoker set search_path to '' as $$
declare f record;
begin
  for f in
    select c.hoy_para as fecha,
           count(*)::int as planificadas,
           count(*) filter (where coalesce(t.hecha, k.completed, false))::int as hechas
      from public.hoy_capa c
      left join public.hoy_tareas t on t.id = c.tarea_id and c.origen = 'hoy'
      left join public.tasks k on k.id = c.tarea_id and c.origen = 'portal'
     where c.owner_id = auth.uid() and c.hoy_para < p_hoy
     group by c.hoy_para
  loop
    insert into public.hoy_dias (owner_id, fecha, planificadas, hechas)
    values (auth.uid(), f.fecha, f.planificadas, f.hechas)
    on conflict (owner_id, fecha) do nothing;
    update public.hoy_capa c set hoy_para = null
     where c.owner_id = auth.uid() and c.hoy_para = f.fecha
       and not coalesce(
         (select t.hecha from public.hoy_tareas t where t.id = c.tarea_id),
         (select k.completed from public.tasks k where k.id = c.tarea_id),
         false);
    return query select * from public.hoy_dias d where d.owner_id = auth.uid() and d.fecha = f.fecha;
  end loop;
end $$;

-- ── ⑮ RLS: un solo dueño ─────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['hoy_ajustes','hoy_proyectos','hoy_categorias','hoy_pipelines',
                           'hoy_tareas','hoy_capa','hoy_dias','hoy_habitos','hoy_plantillas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists p_%1$s_owner on public.%1$I', t);
    execute format('create policy p_%1$s_owner on public.%1$I for all
                      using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;
-- Las hijas heredan el permiso de su madre.
alter table public.hoy_etapas enable row level security;
drop policy if exists p_hoy_etapas_owner on public.hoy_etapas;
create policy p_hoy_etapas_owner on public.hoy_etapas for all
  using (exists (select 1 from public.hoy_pipelines p where p.id = pipeline_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.hoy_pipelines p where p.id = pipeline_id and p.owner_id = auth.uid()));
alter table public.hoy_marcas enable row level security;
drop policy if exists p_hoy_marcas_owner on public.hoy_marcas;
create policy p_hoy_marcas_owner on public.hoy_marcas for all
  using (exists (select 1 from public.hoy_habitos h where h.id = habito_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from public.hoy_habitos h where h.id = habito_id and h.owner_id = auth.uid()));
alter table public.hoy_plantilla_items enable row level security;
drop policy if exists p_hoy_plantilla_items_owner on public.hoy_plantilla_items;
create policy p_hoy_plantilla_items_owner on public.hoy_plantilla_items for all
  using (exists (select 1 from public.hoy_plantillas p where p.id = plantilla_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.hoy_plantillas p where p.id = plantilla_id and p.owner_id = auth.uid()));

-- ── ⑯ EL MURO: anon fuera, authenticated dentro ──────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['hoy_ajustes','hoy_proyectos','hoy_categorias','hoy_pipelines','hoy_etapas',
                           'hoy_tareas','hoy_capa','hoy_dias','hoy_habitos','hoy_marcas',
                           'hoy_plantillas','hoy_plantilla_items','hoy_todas'] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
revoke all on function public.hoy_mi_ficha() from public, anon;
revoke all on function public.hoy_sembrar() from public, anon;
revoke all on function public.hoy_reiniciar_dia(date) from public, anon;
grant execute on function public.hoy_mi_ficha() to authenticated;
grant execute on function public.hoy_sembrar() to authenticated;
grant execute on function public.hoy_reiniciar_dia(date) to authenticated;

-- ── ⑰ REALTIME en `tasks` ─────────────────────────────────────────────────────
-- Para que un cambio hecho en el portal aparezca en 2day sin recargar. Respeta la RLS.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tasks') then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;

commit;

-- ── COMPROBACIÓN (tests/forma.mjs) ───────────────────────────────────────────
--   select relname, relrowsecurity from pg_class where relname like 'hoy\_%' and relkind='r';
--   select grantee from information_schema.role_table_grants where table_name like 'hoy%' and grantee='anon';  -- 0 filas
--   select tablename from pg_publication_tables where pubname='supabase_realtime' and tablename='tasks';       -- 1 fila

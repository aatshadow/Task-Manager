-- 2026-10-25 · Las tareas que me asignan en OTROS portales (EasyBiz) entran en 2day (Alex: «mis tareas de
-- EasyBiz tienen que aparecerme en el 2day, con el proyecto y quien me la ha asignado»).
--
-- Por qué no basta con la vista: 2day entra con alex@growthinfo.io y sin `x-portal`, así que la RLS de
-- `tasks` sólo le deja ver GrowthInfo (decisión 3 de LOGICA). En coreportal Alex entra con
-- superadmin@portalcore.io, que es la ficha a la que Zlati le asigna en EasyBiz. No se toca la RLS del
-- portal: dos funciones SECURITY DEFINER abren SOLO las tareas asignadas a una ficha mía, para leerlas y
-- para moverlas. Misma fila, dos puertas (LOGICA §1): no se copia nada.
--
--   hoy_cuentas            otras cuentas del portal que también soy yo (alex@growthinfo.io → superadmin)
--   hoy_mis_fichas()       mis fichas de equipo, de todas mis cuentas
--   hoy_proyectos.cliente_portal   el proyecto de 2day en el que caen las tareas de ese cliente (IziBizz ← easybiz)
--   hoy_de_otros_portales()        las tareas asignadas a mis fichas que la RLS no me deja ver
--   hoy_todas              + rama 3 con ellas; columnas nuevas al final: de_fuera, cliente_nombre, asignada_por
--   hoy_tarea_fuera_cambiar()      escribir en una de ellas (lista cerrada de columnas)
begin;

create table if not exists public.hoy_cuentas (
  owner_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cuenta_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, cuenta_id)
);
alter table public.hoy_cuentas enable row level security;
drop policy if exists hoy_cuentas_mias on public.hoy_cuentas;
create policy hoy_cuentas_mias on public.hoy_cuentas for select to authenticated using (owner_id = auth.uid());
revoke all on public.hoy_cuentas from anon;
-- Sólo se lee desde 2day; las filas se ponen a mano (enlazar cuentas es decisión de Alex).
insert into public.hoy_cuentas (owner_id, cuenta_id)
select a.id, s.id from auth.users a, auth.users s
 where a.email = 'alex@growthinfo.io' and s.email = 'superadmin@portalcore.io'
on conflict do nothing;

create or replace function public.hoy_mis_fichas()
returns uuid[] language sql stable security definer set search_path to '' as $$
  select coalesce(array_agg(tm.id), '{}'::uuid[])
    from public.team_members tm
   where tm.active
     and (tm.user_id = auth.uid()
          or tm.user_id in (select c.cuenta_id from public.hoy_cuentas c where c.owner_id = auth.uid()))
$$;
revoke all on function public.hoy_mis_fichas() from public, anon;
grant execute on function public.hoy_mis_fichas() to authenticated;

alter table public.hoy_proyectos add column if not exists cliente_portal text;
update public.hoy_proyectos p set cliente_portal = 'easybiz'
  from auth.users u
 where u.id = p.owner_id and u.email = 'alex@growthinfo.io' and p.nombre = 'IziBizz' and p.archivado_at is null;

create or replace function public.hoy_de_otros_portales()
returns table (id uuid, title text, description text, proyecto_id uuid, category text, status text,
               start_date date, due_date date, assignee_id uuid, assignees uuid[], completed boolean,
               completed_at timestamptz, archived_at timestamptz, created_at timestamptz,
               updated_at timestamptz, "position" numeric, priority text, fase text,
               cliente_nombre text, asignada_por text)
language sql stable security definer set search_path to '' as $$
  select k.id, k.title, k.description,
         (select p.id from public.hoy_proyectos p
           where p.owner_id = auth.uid() and p.cliente_portal = k.client_id and p.archivado_at is null
           order by p.created_at limit 1),
         k.category, k.status, k.start_date, k.due_date, k.assignee_id, k.assignees, k.completed,
         k.completed_at, k.archived_at, k.created_at, k.updated_at, k.position::numeric, k.priority, k.fase,
         cl.name, nullif(btrim(coalesce(pr.full_name, split_part(pr.email, '@', 1))), '')
    from public.tasks k
    left join public.clients cl on cl.id = k.client_id
    left join public.profiles pr on pr.id = k.created_by
   where k.assignee_id = any (public.hoy_mis_fichas())
      or k.assignees && public.hoy_mis_fichas()
$$;
revoke all on function public.hoy_de_otros_portales() from public, anon;
grant execute on function public.hoy_de_otros_portales() to authenticated;

-- La vista: ramas 1 y 2 como estaban (la 2 ya con todas mis fichas), columnas nuevas al final, y la rama 3
-- con lo asignado a mí que la RLS no deja ver (el `not exists` corre con la RLS de quien mira).
create or replace view public.hoy_todas with (security_invoker = on) as
 SELECT t.id, 'hoy'::text AS origen, t.titulo, t.descripcion, t.proyecto_id, t.client_id, t.categoria,
    t.pipeline_id, t.etapa_id, t.estado, t.inicio, t.vence, t.responsable_id, '{}'::uuid[] AS participantes,
    t.hecha, t.hecha_en, t.archivado_at, t.created_at, t.updated_at, t.posicion,
    c.cuadrante, c.hoy_para, COALESCE(c.orden, 0::numeric) AS orden, c.hora_inicio, c.hora_fin,
    COALESCE(c.seguida, false) AS seguida, COALESCE(c.notas, ''::text) AS notas,
    NULL::text AS prioridad_portal, NULL::text AS fase, c.repetir,
    false AS de_fuera, NULL::text AS cliente_nombre, NULL::text AS asignada_por
   FROM public.hoy_tareas t
     LEFT JOIN public.hoy_capa c ON c.tarea_id = t.id AND c.owner_id = t.owner_id
  WHERE t.owner_id = auth.uid()
UNION ALL
 SELECT k.id, 'portal'::text, k.title, k.description, NULL::uuid, k.client_id, k.category,
    k.pipeline_id, k.stage_id, k.status, k.start_date, k.due_date, k.assignee_id, k.assignees,
    k.completed, k.completed_at, k.archived_at, k.created_at, k.updated_at, k."position",
    c.cuadrante, c.hoy_para, COALESCE(c.orden, 0::numeric), c.hora_inicio, c.hora_fin,
    COALESCE(c.seguida, false), COALESCE(c.notas, ''::text), k.priority, k.fase, c.repetir,
    false, NULL::text, NULL::text
   FROM public.tasks k
     LEFT JOIN public.hoy_capa c ON c.tarea_id = k.id AND c.owner_id = auth.uid()
  WHERE k.assignee_id = ANY (public.hoy_mis_fichas()) OR k.assignees && public.hoy_mis_fichas()
     OR k.created_by = auth.uid() OR COALESCE(c.seguida, false)
UNION ALL
 SELECT f.id, 'portal'::text, f.title, f.description, f.proyecto_id, NULL::text, f.category,
    NULL::uuid, NULL::uuid, f.status, f.start_date, f.due_date, f.assignee_id, f.assignees,
    f.completed, f.completed_at, f.archived_at, f.created_at, f.updated_at, f."position",
    c.cuadrante, c.hoy_para, COALESCE(c.orden, 0::numeric), c.hora_inicio, c.hora_fin,
    COALESCE(c.seguida, false), COALESCE(c.notas, ''::text), f.priority, f.fase, c.repetir,
    true, f.cliente_nombre, f.asignada_por
   FROM public.hoy_de_otros_portales() f
     LEFT JOIN public.hoy_capa c ON c.tarea_id = f.id AND c.owner_id = auth.uid()
  WHERE NOT EXISTS (SELECT 1 FROM public.tasks v WHERE v.id = f.id);

-- Escribir en una tarea de otro portal asignada a mí: sólo estas columnas, nunca borrar ni reasignar.
create or replace function public.hoy_tarea_fuera_cambiar(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path to '' as $$
declare v_ok boolean;
begin
  select (k.assignee_id = any (public.hoy_mis_fichas()) or k.assignees && public.hoy_mis_fichas())
    into v_ok from public.tasks k where k.id = p_id;
  if not coalesce(v_ok, false) then raise exception 'Esa tarea no está asignada a ti.'; end if;
  if p ? 'status' and (p ->> 'status') not in ('todo', 'in_progress', 'review', 'blocked', 'done') then
    raise exception 'Estado desconocido: «%».', p ->> 'status';
  end if;
  update public.tasks k set
    title        = case when p ? 'title' then coalesce(nullif(btrim(p ->> 'title'), ''), k.title) else k.title end,
    description  = case when p ? 'description' then coalesce(p ->> 'description', '') else k.description end,
    status       = case when p ? 'status' then p ->> 'status' else k.status end,
    completed    = case when p ? 'completed' then (p ->> 'completed')::boolean else k.completed end,
    completed_at = case when not (p ? 'completed') then k.completed_at
                        when (p ->> 'completed')::boolean then coalesce(k.completed_at, now()) else null end,
    start_date   = case when p ? 'start_date' then (p ->> 'start_date')::date else k.start_date end,
    due_date     = case when p ? 'due_date' then (p ->> 'due_date')::date else k.due_date end,
    priority     = case when p ? 'priority' then p ->> 'priority' else k.priority end,
    category     = case when p ? 'category' then p ->> 'category' else k.category end,
    position     = case when p ? 'position' then (p ->> 'position')::numeric else k.position end
  where k.id = p_id;
end $$;
revoke all on function public.hoy_tarea_fuera_cambiar(uuid, jsonb) from public, anon;
grant execute on function public.hoy_tarea_fuera_cambiar(uuid, jsonb) to authenticated;

commit;

-- VUELTA ATRÁS (a mano):
--   begin;
--   <volver a crear hoy_todas con la definición de sql/2026-10-23-cliente-en-personales.sql:
--    las columnas nuevas no se pueden quitar con CREATE OR REPLACE: DROP VIEW hoy_todas y crearla>
--   drop function public.hoy_tarea_fuera_cambiar(uuid, jsonb);
--   drop function public.hoy_de_otros_portales();
--   drop function public.hoy_mis_fichas();
--   alter table public.hoy_proyectos drop column cliente_portal;
--   drop table public.hoy_cuentas;
--   commit;

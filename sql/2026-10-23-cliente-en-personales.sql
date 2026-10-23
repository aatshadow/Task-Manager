-- 2026-10-23 · Tareas personales con cliente de GrowthInfo (LOGICA §14.9): la etiqueta, no el portal.
begin;
alter table public.hoy_tareas   add column if not exists client_id text;
alter table public.hoy_proximos add column if not exists client_id text;
alter table public.hoy_reuniones add column if not exists client_id text;
create or replace view public.hoy_todas with (security_invoker = true) as
 SELECT t.id,
    'hoy'::text AS origen,
    t.titulo,
    t.descripcion,
    t.proyecto_id,
    t.client_id,
    t.categoria,
    t.pipeline_id,
    t.etapa_id,
    t.estado,
    t.inicio,
    t.vence,
    t.responsable_id,
    '{}'::uuid[] AS participantes,
    t.hecha,
    t.hecha_en,
    t.archivado_at,
    t.created_at,
    t.updated_at,
    t.posicion,
    c.cuadrante,
    c.hoy_para,
    COALESCE(c.orden, 0::numeric) AS orden,
    c.hora_inicio,
    c.hora_fin,
    COALESCE(c.seguida, false) AS seguida,
    COALESCE(c.notas, ''::text) AS notas,
    NULL::text AS prioridad_portal,
    NULL::text AS fase,
    c.repetir
   FROM hoy_tareas t
     LEFT JOIN hoy_capa c ON c.tarea_id = t.id AND c.owner_id = t.owner_id
  WHERE t.owner_id = auth.uid()
UNION ALL
 SELECT k.id,
    'portal'::text AS origen,
    k.title AS titulo,
    k.description AS descripcion,
    NULL::uuid AS proyecto_id,
    k.client_id,
    k.category AS categoria,
    k.pipeline_id,
    k.stage_id AS etapa_id,
    k.status AS estado,
    k.start_date AS inicio,
    k.due_date AS vence,
    k.assignee_id AS responsable_id,
    k.assignees AS participantes,
    k.completed AS hecha,
    k.completed_at AS hecha_en,
    k.archived_at AS archivado_at,
    k.created_at,
    k.updated_at,
    k."position" AS posicion,
    c.cuadrante,
    c.hoy_para,
    COALESCE(c.orden, 0::numeric) AS orden,
    c.hora_inicio,
    c.hora_fin,
    COALESCE(c.seguida, false) AS seguida,
    COALESCE(c.notas, ''::text) AS notas,
    k.priority AS prioridad_portal,
    k.fase,
    c.repetir
   FROM tasks k
     LEFT JOIN hoy_capa c ON c.tarea_id = k.id AND c.owner_id = auth.uid()
  WHERE k.assignee_id = hoy_mi_ficha() OR (hoy_mi_ficha() = ANY (k.assignees)) OR k.created_by = auth.uid() OR COALESCE(c.seguida, false);
commit;

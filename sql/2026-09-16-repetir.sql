-- 2day · tareas que se repiten (LOGICA §4.1) — 16-09-2026
--
-- La regla vive en la CAPA (`hoy_capa.repetir`), no en la tarea: así vale igual para una
-- personal y para una de GrowthInfo (misma fila, dos puertas), y el portal no se entera.
-- Vocabulario: diario · laborables · semanal · mensual · cada:N (N días).
-- Al completar una tarea con regla, la capa de datos crea la SIGUIENTE ocurrencia; aquí
-- sólo se guarda la regla y se expone en la vista (columna nueva AL FINAL: `create or
-- replace view` sólo admite añadir por la cola).

alter table public.hoy_capa
  add column if not exists repetir text
  check (repetir is null or repetir ~ '^(diario|laborables|semanal|mensual|cada:[1-9][0-9]{0,2})$');

create or replace view public.hoy_todas with (security_invoker = on) as
  select t.id, 'hoy'::text as origen, t.titulo, t.descripcion,
         t.proyecto_id, null::text as client_id, t.categoria,
         t.pipeline_id, t.etapa_id, t.estado, t.inicio, t.vence,
         t.responsable_id, '{}'::uuid[] as participantes,
         t.hecha, t.hecha_en, t.archivado_at, t.created_at, t.updated_at, t.posicion,
         c.cuadrante, c.hoy_para, coalesce(c.orden, 0) as orden, c.hora_inicio, c.hora_fin,
         coalesce(c.seguida, false) as seguida, coalesce(c.notas, '') as notas,
         null::text as prioridad_portal, null::text as fase,
         c.repetir
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
         k.priority, k.fase,
         c.repetir
    from public.tasks k
    left join public.hoy_capa c on c.tarea_id = k.id and c.owner_id = auth.uid()
   where k.assignee_id = public.hoy_mi_ficha()
      or public.hoy_mi_ficha() = any (k.assignees)
      or k.created_by = auth.uid()
      or coalesce(c.seguida, false);

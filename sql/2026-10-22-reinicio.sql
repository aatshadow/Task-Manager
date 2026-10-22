-- 2026-10-22 · Reinicio a cero (Alex): «no lo he usado mucho, lo quiero a 0 a partir de ahora».
-- No se borra nada. Para deshacer: inicio 2026-09-23 · fin 2026-12-21 y stats_desde = null.

-- 1) Stats cuentan desde esta fecha (null = desde siempre). LOGICA §5.3
alter table public.hoy_ajustes add column if not exists stats_desde date;
update public.hoy_ajustes set stats_desde = date '2026-10-22'
 where owner_id = 'e0b4c8d6-3799-43fe-a334-022bb3d8a839';

-- 2) El Zero Agent Challenge vuelve a empezar hoy: Día 1 / 90 (22-10-2026 → 19-01-2027)
update public.hoy_retos set inicio = date '2026-10-22', fin = date '2027-01-19'
 where id = '97e2dfde-2662-42ad-bb56-3830225738ae';

-- 2026-10-23 · Gantt (LOGICA §5.4): un hito puede durar. `inicio` opcional; `fecha` sigue siendo el final
-- (o el día, si no tiene inicio). Idempotente.
alter table public.hoy_hitos add column if not exists inicio date;

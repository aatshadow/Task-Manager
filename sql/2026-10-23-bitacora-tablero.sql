-- 2026-10-23 · Tablero de Claude (LOGICA §14.4): la terminal que está trabajando ahora mismo.
alter table public.hoy_cc_sesiones add column if not exists activo_desde timestamptz;
alter table public.hoy_cc_sesiones add column if not exists activo_pedido text not null default '';

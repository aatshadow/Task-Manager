-- 2026-10-24 · EOD (LOGICA §16.3): la lectura IA del día. La app la pide (`lectura_estado = 'pedido'`);
-- el Mac la escribe con `claude -p` (bitacora/eod_lectura.py, en el LaunchAgent) y la deja en 'listo' o 'error'.
begin;
alter table public.hoy_eod add column if not exists lectura jsonb;
alter table public.hoy_eod add column if not exists lectura_estado text check (lectura_estado in ('pedido','listo','error'));
alter table public.hoy_eod add column if not exists lectura_en timestamptz;
alter table public.hoy_eod add column if not exists lectura_error text;
commit;

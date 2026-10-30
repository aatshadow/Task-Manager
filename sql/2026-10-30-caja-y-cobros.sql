-- 2day · Finanzas: efectivo, cobros esperados y calendario de deudas (LOGICA §17.9). En SYSTEMA. Idempotente.

-- Cobros (y pagos) esperados con su grado de certeza: «confirmado» cuenta para el día y la
-- autonomía; «probable», sólo en el escenario con probables; «posible», en ninguno.
alter table public.fin_previstos
  add column if not exists certeza text not null default 'confirmado' check (certeza in ('confirmado', 'probable', 'posible')),
  -- un previsto recurrente deja de repetirse en `hasta` (las cuotas de una deuda se acaban)
  add column if not exists hasta date,
  -- las cuotas o el vencimiento de una deuda son previstos colgados de su partida
  add column if not exists partida_id uuid references public.fin_partidas(id) on delete cascade;

-- Cómo se paga una deuda: una cuota cada X desde una fecha, o todo de una vez al vencer.
alter table public.fin_partidas
  add column if not exists cuota numeric,
  add column if not exists cuota_recurrencia text check (cuota_recurrencia in ('semanal', 'mensual', 'trimestral', 'anual')),
  add column if not exists primera_cuota date;

-- La caja física: una cuenta de efectivo. Las retiradas en cajero desde su apertura entran aquí
-- (traspaso banco → caja) y cada gasto en efectivo sale de aquí con su destino.
insert into public.fin_cuentas (banco, nombre, moneda, tipo, saldo, saldo_en, orden)
select 'manual', 'Efectivo', 'EUR', 'efectivo', 0, now(), 90
where not exists (select 1 from public.fin_cuentas where tipo = 'efectivo');

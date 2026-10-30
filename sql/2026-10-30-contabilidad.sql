-- 2day · Finanzas: balance contable, Whop y caja (LOGICA §17.7–17.8). En SYSTEMA. Idempotente.

-- Whop es una cuenta más de tesorería (caja y bancos); «efectivo» es la caja física (570).
alter table public.fin_cuentas drop constraint if exists fin_cuentas_banco_check;
alter table public.fin_cuentas add constraint fin_cuentas_banco_check check (banco in ('mercury', 'wise', 'whop', 'manual'));
alter table public.fin_cuentas drop constraint if exists fin_cuentas_tipo_check;
alter table public.fin_cuentas add constraint fin_cuentas_tipo_check check (tipo in ('operativa', 'pocket', 'impuestos', 'colchon', 'ahorro', 'inversion', 'efectivo'));

-- Lo que no es tesorería ni sale de un banco: el inmovilizado (a valor de mercado) y las deudas.
-- `valor_origen` es el valor con el que entró en el balance; si `valor` baja, la diferencia es
-- amortización/deterioro (681 contra 2817). Las deudas se reducen con los pagos (categoría «Pago de deuda»).
create table if not exists public.fin_partidas (
  id uuid primary key default gen_random_uuid(),
  lado text not null check (lado in ('activo', 'pasivo')),
  plazo text not null default 'no_corriente' check (plazo in ('no_corriente', 'corriente')),
  cuenta text not null,
  nombre text not null,
  valor numeric not null default 0,
  valor_origen numeric,
  moneda text not null default 'EUR',
  fecha date not null default current_date,
  vencimiento date,
  fuente text,
  nota text,
  activa boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.fin_partidas enable row level security;

insert into public.fin_partidas (lado, plazo, cuenta, nombre, valor, valor_origen, fecha, fuente, orden)
select * from (values
  ('activo', 'no_corriente', '217', 'iPhone 18 Pro Max', 1100, 1100, date '2026-10-30',
   'Mercado de segunda mano a 30-10-2026: reacondicionado desde 1.055 $ (Back Market EE. UU.), particulares 1.200–1.650 € (Wallapop). Ajustar con la capacidad real.', 1),
  ('activo', 'no_corriente', '217', 'MacBook Air M4', 950, 950, date '2026-10-30',
   'Mercado de segunda mano a 30-10-2026: reacondicionado 16 GB/512 GB 1.089–1.280 € en España (RefurbMe); la base 16/256 vale menos y el M5 ya está a la venta. Ajustar con la configuración real.', 2),
  ('pasivo', 'no_corriente', '170', 'Deuda a largo plazo', 25000, 25000, date '2026-10-30', null, 3),
  ('pasivo', 'corriente', '520', 'Deuda a corto plazo', 1700, 1700, date '2026-10-30', null, 4)
) as v(lado, plazo, cuenta, nombre, valor, valor_origen, fecha, fuente, orden)
where not exists (select 1 from public.fin_partidas);

-- 2day · Finanzas: clasificación automática y panel (LOGICA §17.5).
-- Va en la Supabase de SYSTEMA, como sql/2026-10-30-finanzas.sql. Idempotente.

-- Quién puso la clase de cada movimiento y, si la IA dudó, qué propone.
alter table public.fin_movimientos
  add column if not exists clasificado_por text check (clasificado_por in ('regla', 'ia', 'alex')),
  add column if not exists sugerencia jsonb;

-- Las reglas que aprende 2day cuando Alex clasifica «siempre igual»: si el texto del
-- movimiento (contraparte + concepto) contiene `patron`, se le pone esa clase y categoría.
create table if not exists public.fin_reglas (
  id uuid primary key default gen_random_uuid(),
  patron text not null,
  sentido text check (sentido in ('gasto', 'ingreso')),
  clase text check (clase in ('ingreso', 'obligatorio', 'recortable', 'libre', 'inversion', 'interno')),
  categoria text,
  negocio text,
  aplicada int not null default 0,
  created_at timestamptz not null default now(),
  unique (patron, sentido)
);
alter table public.fin_reglas enable row level security;

-- Los positivos ya no se dan por ingreso al sincronizar (un reembolso no es un cobro): lo
-- que entró así y nadie tocó vuelve a la cola para que lo clasifique la IA.
update public.fin_movimientos set clase = null
where origen = 'banco' and clase = 'ingreso' and clasificado_por is null and categoria is null;

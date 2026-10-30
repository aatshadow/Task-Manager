-- 2day · Finanzas (LOGICA §17) — se aplica en la Supabase de SYSTEMA (xvogrnykotqhcglgdvmy),
-- NO en la de GrowthInfo. RLS activada y sin políticas: sólo entra la service key de /api/finanzas.
-- Idempotente: se puede volver a pasar sin duplicar la semilla.

create table if not exists public.fin_ajustes (
  id int primary key default 1 check (id = 1),
  moneda_base text not null default 'EUR',
  sueldo_dueno numeric not null default 0,
  colchon_meses numeric not null default 3,
  impuestos_pct numeric not null default 10,
  tasas jsonb not null default '{}'::jsonb,
  sync jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.fin_cuentas (
  id uuid primary key default gen_random_uuid(),
  banco text not null default 'manual' check (banco in ('mercury', 'wise', 'manual')),
  externo_id text unique,
  nombre text not null,
  moneda text not null default 'EUR',
  tipo text not null default 'operativa' check (tipo in ('operativa', 'pocket', 'impuestos', 'colchon', 'ahorro', 'inversion')),
  saldo numeric not null default 0,
  saldo_en timestamptz,
  pct_reparto numeric,
  activa boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.fin_previstos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'gasto' check (tipo in ('gasto', 'ingreso')),
  titulo text not null,
  importe numeric,
  moneda text not null default 'EUR',
  fecha date,
  recurrencia text check (recurrencia in ('semanal', 'mensual', 'trimestral', 'anual')),
  clase text not null default 'obligatorio' check (clase in ('ingreso', 'obligatorio', 'recortable', 'libre', 'inversion', 'interno')),
  categoria text,
  negocio text,
  suscripcion boolean not null default false,
  provisionado numeric not null default 0,
  estado text not null default 'previsto' check (estado in ('previsto', 'pagado', 'cancelado')),
  nota text,
  created_at timestamptz not null default now()
);

create table if not exists public.fin_movimientos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid references public.fin_cuentas(id) on delete set null,
  externo_id text unique,
  fecha date not null,
  importe numeric not null,
  moneda text not null default 'EUR',
  descripcion text,
  contraparte text,
  clase text check (clase in ('ingreso', 'obligatorio', 'recortable', 'libre', 'inversion', 'interno')),
  categoria text,
  negocio text,
  origen text not null default 'manual' check (origen in ('banco', 'manual')),
  estado text not null default 'hecho' check (estado in ('pendiente', 'hecho', 'cancelado')),
  emparejado_id uuid references public.fin_movimientos(id) on delete set null,
  previsto_id uuid references public.fin_previstos(id) on delete set null,
  nota text,
  created_at timestamptz not null default now()
);
create index if not exists fin_movimientos_fecha on public.fin_movimientos (fecha desc);

create table if not exists public.fin_objetivos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  importe numeric,
  moneda text not null default 'EUR',
  fecha date,
  tipo text not null default 'caja' check (tipo in ('caja', 'colchon', 'compra', 'inversion')),
  principal boolean not null default false,
  nota text,
  created_at timestamptz not null default now()
);

create table if not exists public.fin_acciones (
  id uuid primary key default gen_random_uuid(),
  area text not null default 'finanzas' check (area in ('fiscal', 'residencia', 'bancos', 'finanzas', 'inversion')),
  titulo text not null,
  detalle text,
  prioridad int not null default 2 check (prioridad between 1 and 3),
  fecha date,
  importe_estimado numeric,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'hecha')),
  origen text not null default 'alex' check (origen in ('alex', 'asesor')),
  orden int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.fin_documentos (
  id uuid primary key default gen_random_uuid(),
  movimiento_id uuid references public.fin_movimientos(id) on delete cascade,
  previsto_id uuid references public.fin_previstos(id) on delete cascade,
  ruta text not null,
  nombre text not null,
  tipo text,
  created_at timestamptz not null default now()
);

create table if not exists public.fin_partes (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  parte jsonb not null,
  modelo text,
  created_at timestamptz not null default now()
);

create table if not exists public.fin_chat (
  id uuid primary key default gen_random_uuid(),
  rol text not null check (rol in ('alex', 'asesor')),
  texto text not null,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['fin_ajustes','fin_cuentas','fin_previstos','fin_movimientos','fin_objetivos','fin_acciones','fin_documentos','fin_partes','fin_chat'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

insert into storage.buckets (id, name, public) values ('finanzas', 'finanzas', false) on conflict (id) do nothing;

/* ── semilla: sólo lo que Alex ha dicho (sin inventar importes) ─────────────── */
insert into public.fin_ajustes (id) values (1) on conflict (id) do nothing;

insert into public.fin_objetivos (titulo, importe, fecha, tipo, principal, nota)
select 'La Misión', 520424.26, '2027-09-16', 'caja', true, 'Lo que habrá en la cuenta de la empresa el 16-09-2027. Punto de partida dicho por Alex: 500 € a 05-10-2026.'
where not exists (select 1 from public.fin_objetivos where principal);
insert into public.fin_objetivos (titulo, importe, tipo, nota)
select 'Colchón', null, 'colchon', 'Sale solo: colchon_meses × gasto fijo mensual. Intocable.'
where not exists (select 1 from public.fin_objetivos where tipo = 'colchon');

insert into public.fin_previstos (tipo, titulo, importe, moneda, fecha, clase, categoria, negocio, nota)
select * from (values
  ('gasto', 'Residencia Paraguay (gestora, básica)', 3500::numeric, 'EUR', '2027-01-15'::date, 'obligatorio', 'Residencia', 'Personal', 'Básica 3.500 € · premium 6.000 € · luego 750–1.000 €/año. PDF «Info Paraguay». No usar nunca sus facturas «a tu nombre».'),
  ('gasto', 'Viaje a Paraguay', null, 'EUR', '2027-01-10'::date, 'obligatorio', 'Viajes', 'Personal', 'Vuelo + alojamiento de ~120 días reales. Falta el importe.'),
  ('gasto', 'Regularización España (2025 y anteriores)', null, 'EUR', '2026-12-31'::date, 'obligatorio', 'Impuestos', 'Personal', 'Recargos 1 % + 1 %/mes (tope 15 %) + intereses si va por delante. Importe: lo dirá el asesor.')
) v(tipo, titulo, importe, moneda, fecha, clase, categoria, negocio, nota)
where not exists (select 1 from public.fin_previstos);

insert into public.fin_previstos (tipo, titulo, importe, moneda, fecha, recurrencia, clase, categoria, negocio, suscripcion, nota)
select 'gasto', 'Mac mini de producción (rentamac)', 119, 'USD', '2026-11-25', 'mensual', 'obligatorio', 'Infraestructura', 'Izibizz', true, 'M4 en Chipre, contratado el 25-10.'
where not exists (select 1 from public.fin_previstos where suscripcion);

insert into public.fin_acciones (area, titulo, detalle, prioridad, origen, orden)
select * from (values
  ('fiscal', 'Asesor de regularizaciones en España, con TODO delante', 'Años, importes, sociedades de Dubái y cuentas. Ir por delante: recargos (≤15 %) frente a sanciones del 50–150 %. Va PRIMERO.', 1, 'asesor', 1),
  ('fiscal', 'Comprobar la declaración de 2025 y si tocaba el 720/721', '2025 fue año de residencia española (el año no se parte).', 1, 'asesor', 2),
  ('fiscal', 'No presentar el 030 antes de regularizar', 'Declarar residencia fuera con ejercicios sin declarar señala el periodo.', 1, 'asesor', 3),
  ('residencia', 'Certificado de residencia fiscal de la НАП (Bulgaria, 2026)', 'Es el único papel que sirve frente a España.', 1, 'asesor', 4),
  ('residencia', 'Confirmar con el asesor búlgaro el cruce 2026 → 2027 y la baja', '183 días en cualquier periodo de 12 meses + domicilio permanente.', 2, 'asesor', 5),
  ('residencia', 'Registro propio de días por país', 'Schengen Bulgaria↔España no deja sello. Objetivo ~120 días reales en Paraguay.', 2, 'asesor', 6),
  ('residencia', 'Paraguay: residencia básica con la gestora', 'Sí como plan B y residencia 2027. Nada de pruebas fabricadas ni «mover efectivo».', 2, 'asesor', 7),
  ('bancos', 'Dejar de usar la dirección de Alicante en todo registro', 'La factura de Whop del 09-09 salió con domicilio en Alicante.', 1, 'asesor', 8),
  ('bancos', 'Conectar Mercury y Wise a 2day (tokens de sólo lectura)', 'MERCURY_API_TOKEN y WISE_API_TOKEN en Vercel.', 1, 'asesor', 9),
  ('bancos', 'ITIN (formulario W-7)', 'EIN → banco → ITIN → D-U-N-S → Amex Global Transfer. Es el paso que casi todos se saltan.', 2, 'asesor', 10),
  ('bancos', 'D-U-N-S de la LLC', 'Para construir crédito empresarial en EE. UU.', 3, 'asesor', 11),
  ('finanzas', 'Fijar el sueldo del dueño', 'Una cantidad fija al mes a un pocket propio: el gasto personal sale de ahí y no se come la Misión.', 1, 'asesor', 12),
  ('finanzas', 'Abrir los pockets en Mercury', 'Operación · Impuestos · Colchón · Sueldo · Misión, con su % de reparto.', 2, 'asesor', 13)
) v(area, titulo, detalle, prioridad, origen, orden)
where not exists (select 1 from public.fin_acciones);

-- 2day · Finanzas: listas propias y suscripciones detectadas (LOGICA §17.6). En SYSTEMA. Idempotente.

-- Categorías y negocios que Alex crea a mano: {gasto: [...], ingreso: [...], negocios: [...]}.
-- Se suman a las de serie y a las que ya se usan en los datos.
alter table public.fin_ajustes add column if not exists listas jsonb not null default '{}'::jsonb;

-- Una suscripción es un previsto recurrente con suscripcion = true. `patron` es el texto con el
-- que se reconocen sus cargos en el banco (el mismo que usan las reglas).
alter table public.fin_previstos add column if not exists patron text;

-- Una regla puede decir además que esos cargos son una suscripción.
alter table public.fin_reglas
  add column if not exists suscripcion boolean not null default false,
  add column if not exists recurrencia text check (recurrencia in ('semanal', 'mensual', 'trimestral', 'anual'));

-- 2026-10-24 · EOD (LOGICA §16): el cierre del día. Una fila por día lógico (el de la hora de reinicio).
-- Sueño y peso NO van aquí: son las marcas de los hábitos «Horas de sueño» y «Peso» (una sola fuente
-- para Hábitos, Stats y la ficha). Aquí sólo las respuestas a las preguntas y si el EOD se cerró.
begin;
create table if not exists public.hoy_eod (
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha       date not null,
  respuestas  jsonb not null default '{}'::jsonb,   -- { "<pregunta>": "<texto>" }
  cerrado_en  timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (owner_id, fecha)
);
alter table public.hoy_eod enable row level security;
drop policy if exists hoy_eod_propias on public.hoy_eod;
create policy hoy_eod_propias on public.hoy_eod
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.hoy_eod from anon;
grant select, insert, update, delete on public.hoy_eod to authenticated;

-- Las preguntas son de Alex: editables desde la propia pantalla EOD.
alter table public.hoy_ajustes add column if not exists eod_preguntas jsonb not null default
  '["¿Qué ha salido bien hoy?", "¿Qué no ha salido y por qué?", "¿Qué he aprendido?", "¿Qué es lo único que tiene que pasar mañana?"]'::jsonb;

-- «Dientes lavados»: un hábito más del Apagado (cuenta en la adherencia, como los demás).
insert into public.hoy_habitos (owner_id, nombre, icono, tipo, grupo, hora, bloque_id, posicion)
select h.owner_id, 'Dientes lavados', '🪥', 'hacer', 'Apagado', '21:50', h.bloque_id, h.posicion
from public.hoy_habitos h
where h.nombre = 'En la cama a las 22:00'
  and not exists (select 1 from public.hoy_habitos x where x.owner_id = h.owner_id and x.nombre = 'Dientes lavados');
commit;

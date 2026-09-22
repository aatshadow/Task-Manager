-- ═══════════════════════════════════════════════════════════════════════════════
-- 2day — el Protocolo: bloques del día, hábitos con hora y tipo, el reto, los hitos
-- 22-09-2026 · decide Alex · ver ~/CORE/2day/LOGICA.md (§10)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- QUÉ ES. La rutina de los próximos 90 días (Zero Agent Challenge, 23-09 → 21-12) NO son
-- tareas: es un raíl fijo de bloques con hora (`hoy_bloques`) sobre el que se arrastran
-- las tareas, un checklist de hábitos con hora/grupo/tipo, y un marcador (`hoy_retos`).
-- Los lanzamientos de los frentes de GrowthInfo son `hoy_hitos`.
--
-- IDEMPOTENTE: se puede aplicar dos veces. La siembra (`hoy_sembrar_protocolo`) nunca
-- duplica y, sin `p_restaurar`, nunca pisa lo que Alex haya editado.
--
-- Misma regla de siempre: `owner_id = auth.uid()` en los cuatro verbos, `revoke` a anon.

begin;

-- ── ① BLOQUES: el raíl del día ───────────────────────────────────────────────
-- Un bloque cuyo `fin` es menor que su `inicio` cruza medianoche (Sueño 22:00–04:30).
create table if not exists public.hoy_bloques (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid(),
  nombre       text not null,
  fase         text not null check (fase in ('calibracion','nutricion','cuerpo','ofensiva','reuniones','consolidacion','apagado')),
  inicio       time not null,
  fin          time not null,
  dias         smallint[] not null default '{1,2,3,4,5,6,7}',
  icono        text not null default '',
  color        text not null default '',
  posicion     integer not null default 0,
  activo       boolean not null default true,
  archivado_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (owner_id, nombre)
);
create index if not exists idx_hoy_bloques_owner on public.hoy_bloques(owner_id, posicion);

-- ── ② EL RETO ────────────────────────────────────────────────────────────────
create table if not exists public.hoy_retos (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid(),
  nombre      text not null,
  descripcion text not null default '',
  inicio      date not null,
  fin         date not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, nombre),
  check (fin >= inicio)
);

-- ── ③ HITOS DE LOS FRENTES ───────────────────────────────────────────────────
-- `client_id` es texto suelto (sin FK): Alfredo aún no existe en `clients` y un hito no
-- debe esperar a que exista.
create table if not exists public.hoy_hitos (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  nombre     text not null,
  frente     text not null default '',
  fecha      date,
  client_id  text,
  hecho      boolean not null default false,
  posicion   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, frente, nombre)
);

-- ── ④ HÁBITOS: hora, grupo, tipo, medida, bloque, plan ───────────────────────
alter table public.hoy_habitos add column if not exists hora        time;
alter table public.hoy_habitos add column if not exists grupo       text not null default '';
alter table public.hoy_habitos add column if not exists tipo        text not null default 'hacer';
alter table public.hoy_habitos add column if not exists unidad      text not null default '';
alter table public.hoy_habitos add column if not exists objetivo    numeric;
alter table public.hoy_habitos add column if not exists bloque_id   uuid references public.hoy_bloques(id) on delete set null;
alter table public.hoy_habitos add column if not exists plan        jsonb not null default '{}'::jsonb;
alter table public.hoy_habitos add column if not exists descripcion text not null default '';
alter table public.hoy_habitos drop constraint if exists hoy_habitos_tipo_check;
alter table public.hoy_habitos add constraint hoy_habitos_tipo_check check (tipo in ('hacer','evitar','medir'));
-- La siembra es idempotente por nombre: un hábito vivo no se llama como otro vivo.
create unique index if not exists ux_hoy_habitos_nombre on public.hoy_habitos(owner_id, nombre) where archivado_at is null;

-- ── ⑤ MARCAS: lo que se mide ─────────────────────────────────────────────────
alter table public.hoy_marcas add column if not exists valor numeric;

-- ── ⑥ EL DÍA: la adherencia ──────────────────────────────────────────────────
alter table public.hoy_dias add column if not exists habitos_tocaban integer not null default 0;
alter table public.hoy_dias add column if not exists habitos_hechos  integer not null default 0;

-- ── ⑦ updated_at en las tablas nuevas ────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['hoy_bloques','hoy_retos','hoy_hitos'] loop
    execute format('drop trigger if exists trg_%1$s_touch on public.%1$I', t);
    execute format('create trigger trg_%1$s_touch before update on public.%1$I for each row execute function public.hoy_touch()', t);
  end loop;
end $$;

-- ── ⑧ ¿CUÁNTOS HÁBITOS TOCABAN Y CUÁNTOS SE HICIERON EN UNA FECHA? ───────────
-- Toca = existía ese día (created_at ≤ fecha), no estaba archivado, y por cadencia:
-- `diario` siempre · `dias` si el día ISO está en la lista · `semana` sólo cuenta si se
-- marcó (a solas, 22-09: un «3 veces por semana» no puede penalizar cada día).
create or replace function public.hoy_adherencia_dia(p_fecha date)
returns table (tocaban integer, hechos integer) language sql stable security invoker set search_path to '' as $$
  with h as (
    select h.id,
           case h.cadencia
             when 'diario' then true
             when 'dias'   then extract(isodow from p_fecha)::smallint = any (h.dias)
             else m.habito_id is not null
           end as toca,
           (m.habito_id is not null) as marcado
      from public.hoy_habitos h
      left join public.hoy_marcas m on m.habito_id = h.id and m.fecha = p_fecha
     where h.owner_id = auth.uid()
       and h.created_at::date <= p_fecha
       and (h.archivado_at is null or h.archivado_at::date > p_fecha)
  )
  select count(*) filter (where toca)::int, count(*) filter (where toca and marcado)::int from h
$$;

-- ── ⑨ REINICIAR EL DÍA (reescrita: apunta también la adherencia) ─────────────
-- Cierra cada día anterior a `p_hoy` que tenga tareas planificadas O marcas de hábitos:
-- apunta planificadas/hechas y habitos_tocaban/hechos en `hoy_dias`, y quita `hoy_para`
-- a las tareas NO hechas (vuelven a «Siguiente»). Un día ya cerrado no se reescribe,
-- salvo que se cerrara antes de existir la adherencia (0/0): entonces se completa.
create or replace function public.hoy_reiniciar_dia(p_hoy date)
returns setof public.hoy_dias language plpgsql security invoker set search_path to '' as $$
declare f record; a record;
begin
  for f in
    with fechas as (
      select c.hoy_para as fecha from public.hoy_capa c where c.owner_id = auth.uid() and c.hoy_para < p_hoy
      union
      select m.fecha from public.hoy_marcas m join public.hoy_habitos h on h.id = m.habito_id
       where h.owner_id = auth.uid() and m.fecha < p_hoy
         and not exists (select 1 from public.hoy_dias d where d.owner_id = auth.uid() and d.fecha = m.fecha)
      union
      -- días cerrados antes de existir la adherencia (0/0): se completan una vez
      select d.fecha from public.hoy_dias d
       where d.owner_id = auth.uid() and d.fecha < p_hoy and d.habitos_tocaban = 0 and d.habitos_hechos = 0
    )
    select x.fecha,
           (select count(*)::int from public.hoy_capa c where c.owner_id = auth.uid() and c.hoy_para = x.fecha) as planificadas,
           (select count(*)::int from public.hoy_capa c
              left join public.hoy_tareas t on t.id = c.tarea_id and c.origen = 'hoy'
              left join public.tasks k on k.id = c.tarea_id and c.origen = 'portal'
             where c.owner_id = auth.uid() and c.hoy_para = x.fecha
               and coalesce(t.hecha, k.completed, false)) as hechas
      from fechas x
     order by x.fecha
  loop
    select * into a from public.hoy_adherencia_dia(f.fecha);
    insert into public.hoy_dias (owner_id, fecha, planificadas, hechas, habitos_tocaban, habitos_hechos)
    values (auth.uid(), f.fecha, f.planificadas, f.hechas, a.tocaban, a.hechos)
    on conflict (owner_id, fecha) do update
      set habitos_tocaban = excluded.habitos_tocaban, habitos_hechos = excluded.habitos_hechos
      where public.hoy_dias.habitos_tocaban = 0 and public.hoy_dias.habitos_hechos = 0;
    update public.hoy_capa c set hoy_para = null
     where c.owner_id = auth.uid() and c.hoy_para = f.fecha
       and not coalesce(
         (select t.hecha from public.hoy_tareas t where t.id = c.tarea_id),
         (select k.completed from public.tasks k where k.id = c.tarea_id),
         false);
    return query select * from public.hoy_dias d where d.owner_id = auth.uid() and d.fecha = f.fecha;
  end loop;
end $$;

-- ── ⑩ SEMBRAR EL PROTOCOLO (idempotente por nombre) ──────────────────────────
-- Sin `p_restaurar`: crea lo que falte y sólo rellena lo que esté vacío; no pisa nada
-- editado. Con `p_restaurar = true` («Restaurar el protocolo» en Ajustes): vuelve a dejar
-- los bloques y los hábitos como dicta §10 (las marcas no se tocan nunca).
create or replace function public.hoy_sembrar_protocolo(p_restaurar boolean default false)
returns void language plpgsql security invoker set search_path to '' as $$
declare
  v_yo uuid := auth.uid();
  v_personal uuid; v_pipe uuid; v_todo uuid; v_domingo date; v_tarea uuid;
  b record; h record;
  v_bloque uuid;
begin
  if v_yo is null then raise exception 'sin sesión'; end if;

  -- ⑩.1 los 22 bloques (§10.1)
  for b in select * from (values
    ( 0,'calibracion',  'Activación del Emperador (agua con sal, luz roja, «Soberanía Inmutable»)', '04:30','04:45','{1,2,3,4,5,6,7}','👑'),
    ( 1,'calibracion',  'Meditación de No-Mente (20'') + Visualización del día (25'')',             '04:45','05:30','{1,2,3,4,5,6,7}','🧘'),
    ( 2,'nutricion',    'Comida 1 — combustible (huevos, aguacate, salmón, MCT, café)',              '05:30','06:15','{1,2,3,4,5,6,7}','🍳'),
    ( 3,'cuerpo',       'Preparación y tránsito al gimnasio',                                        '06:15','06:40','{1,2,4,5}',      '🎒'),
    ( 4,'cuerpo',       'Entrenamiento de alta intensidad',                                          '06:40','07:30','{1,2,4,5}',      '🥊'),
    ( 5,'cuerpo',       'Caminata rápida sin música',                                                '06:40','07:10','{6}',            '🚶'),
    ( 6,'cuerpo',       'Regeneración: ducha de hielo 2'' + café',                                   '07:30','08:00','{1,2,3,4,5,6,7}','🧊'),
    ( 7,'ofensiva',     'Inmersión total — Lanzamiento 1',                                           '08:00','11:00','{1,2,3,4,5}',    '🎯'),
    ( 8,'ofensiva',     'Recarga cerebral (Ojo de la Tormenta)',                                     '11:00','11:15','{1,2,3,4,5}',    '🌀'),
    ( 9,'ofensiva',     'Inmersión — tareas críticas y métricas',                                    '11:15','12:00','{1,2,3,4,5}',    '📈'),
    (10,'nutricion',    'Comida 2 + calibración (sauna rápida o ducha de contraste)',                '12:00','13:00','{1,2,3,4,5,6,7}','🍗'),
    (11,'reuniones',    'Daily con el Socio',                                                        '13:00','14:00','{1,2,3,4,5}',    '🤝'),
    (12,'reuniones',    'Pausa estratégica',                                                         '14:00','14:15','{1,2,3,4,5}',    '⏸'),
    (13,'reuniones',    'Daily con el Director Comercial',                                           '14:15','15:15','{1,2,3,4,5}',    '📞'),
    (14,'nutricion',    'Comida 3 — Nutrición del General (última ingesta, empieza el ayuno)',       '15:15','16:00','{1,2,3,4,5,6,7}','🥗'),
    (15,'consolidacion','Ejecución de tareas críticas',                                              '16:00','18:30','{1,2,3,4,5}',    '⚙️'),
    (16,'cuerpo',       'Movilidad y estiramientos profundos',                                       '16:00','16:30','{6}',            '🧎'),
    (17,'nutricion',    'Meal prep de la semana',                                                    '16:00','18:00','{7}',            '🍱'),
    (18,'cuerpo',       'Protocolo de Spa (miércoles: completo, 3 ciclos)',                          '18:30','19:30','{1,2,3,4,5,6,7}','🔥'),
    (19,'consolidacion','Planificación del mañana',                                                  '19:30','20:00','{1,2,3,4,5,6,7}','🗓'),
    (20,'apagado',      'Desconexión total',                                                         '20:00','22:00','{1,2,3,4,5,6,7}','🌙'),
    (21,'apagado',      'Sueño de alta performance',                                                 '22:00','04:30','{1,2,3,4,5,6,7}','😴')
  ) as x(pos, fase, nombre, inicio, fin, dias, icono)
  loop
    insert into public.hoy_bloques (owner_id, nombre, fase, inicio, fin, dias, icono, posicion)
    values (v_yo, b.nombre, b.fase, b.inicio::time, b.fin::time, b.dias::smallint[], b.icono, b.pos)
    on conflict (owner_id, nombre) do update
      set fase = excluded.fase, inicio = excluded.inicio, fin = excluded.fin, dias = excluded.dias,
          icono = excluded.icono, posicion = excluded.posicion, activo = true, archivado_at = null
      where p_restaurar;
  end loop;

  -- ⑩.2 los hábitos (§10.2). Primero los cuatro que ya existían (decisión 11).
  update public.hoy_habitos set nombre = 'Entreno'
   where owner_id = v_yo and nombre = '45 min training' and archivado_at is null
     and not exists (select 1 from public.hoy_habitos e where e.owner_id = v_yo and e.nombre = 'Entreno' and e.archivado_at is null);

  for h in select * from (values
    -- pos, grupo, nombre, tipo, hora, cadencia, dias, unidad, objetivo, bloque, icono, descripcion
    ( 0,'Calibración','Levantarse a las 04:30',                 'hacer', '04:30','diario','{}',        '',  null, 'Activación del Emperador (agua con sal, luz roja, «Soberanía Inmutable»)','⏰',''),
    ( 1,'Calibración','Agua con sal del Himalaya',              'hacer', '04:30','diario','{}',        '',  null, 'Activación del Emperador (agua con sal, luz roja, «Soberanía Inmutable»)','💧','Un vaso. Nada más. Rehidrata y activa el sistema.'),
    ( 2,'Calibración','Luz roja + «Soberanía Inmutable»',       'hacer', '04:35','diario','{}',        '',  null, 'Activación del Emperador (agua con sal, luz roja, «Soberanía Inmutable»)','🔴','El comando de estado.'),
    ( 3,'Calibración','Leer protocolo',                         'hacer', '04:40','diario','{}',        '',  null, 'Activación del Emperador (agua con sal, luz roja, «Soberanía Inmutable»)','📜',''),
    ( 4,'Calibración','Peso',                                   'medir', '04:40','diario','{}',        'kg',null, 'Activación del Emperador (agua con sal, luz roja, «Soberanía Inmutable»)','⚖️','En ayunas, después del agua.'),
    ( 5,'Calibración','Horas de sueño',                         'medir', '04:40','diario','{}',        'h', 6.5,  'Activación del Emperador (agua con sal, luz roja, «Soberanía Inmutable»)','🛏','22:00 → 04:30 = 6,5 h. Se mide, no se juzga.'),
    ( 6,'Calibración','Meditación 20''',                        'hacer', '04:45','diario','{}',        '',  null, 'Meditación de No-Mente (20'') + Visualización del día (25'')','🧘','Anclar al Observador.'),
    ( 7,'Calibración','Visualización del día 25''',             'hacer', '05:05','diario','{}',        '',  null, 'Meditación de No-Mente (20'') + Visualización del día (25'')','👁','No el objetivo final: la ejecución perfecta de HOY, reunión a reunión.'),
    ( 8,'Cuerpo',     'Entreno',                                'hacer', '06:40','dias',  '{1,2,4,5}', '',  null, 'Entrenamiento de alta intensidad','🥊','50 minutos. Sin charlas ni pausas largas: una operación quirúrgica.'),
    ( 9,'Cuerpo',     'Caminata 30'' sin música',               'hacer', '06:40','dias',  '{6}',       '',  null, 'Caminata rápida sin música','🚶','Solo el sonido de la respiración y los pasos. Es movimiento, no entrenamiento.'),
    (10,'Cuerpo',     'Ducha de hielo 2''',                     'hacer', '07:30','diario','{}',        '',  null, 'Regeneración: ducha de hielo 2'' + café','🧊','Reseteo del sistema nervioso.'),
    (11,'Cuerpo',     'Movilidad 30''',                         'hacer', '16:00','dias',  '{6}',       '',  null, 'Movilidad y estiramientos profundos','🧎','Caderas y espalda. Prepara el cuerpo para el lunes.'),
    (12,'Cuerpo',     'Spa (miércoles: completo, 3 ciclos)',    'hacer', '18:30','diario','{}',        '',  null, 'Protocolo de Spa (miércoles: completo, 3 ciclos)','🔥','Mantenimiento de alto rendimiento. Miércoles: 3× (sauna 10'' · hielo 1'' · jacuzzi 5'') + sauna de hierbas 10''.'),
    (13,'Nutrición',  'Comida 1',                               'hacer', '05:30','diario','{}',        '',  null, 'Comida 1 — combustible (huevos, aguacate, salmón, MCT, café)','🍳','4 huevos revueltos con espinacas, medio aguacate, 2 lonchas de salmón ahumado, café negro con MCT o mantequilla. Alternativa: tortilla de 3 huevos con espinacas y ajo + medio aguacate.'),
    (14,'Nutrición',  'Comida 2',                               'hacer', '12:00','diario','{}',        '',  null, 'Comida 2 + calibración (sauna rápida o ducha de contraste)','🍗','Pechuga a la plancha 200 g o 2 muslos al horno + brócoli al vapor o salteado con AOVE y ajo + 20 g de macadamias.'),
    (15,'Nutrición',  'Sin azúcar ni carbohidratos',            'evitar','12:00','diario','{}',        '',  null, 'Comida 2 + calibración (sauna rápida o ducha de contraste)','🚫','Son el combustible del esclavo, no del operador. Se cortan de raíz.'),
    (16,'Nutrición',  'No redbull',                             'evitar','12:00','diario','{}',        '',  null, 'Comida 2 + calibración (sauna rápida o ducha de contraste)','🥫',''),
    (17,'Nutrición',  'Comida 3',                               'hacer', '15:15','diario','{}',        '',  null, 'Comida 3 — Nutrición del General (última ingesta, empieza el ayuno)','🥗','Lomo de cerdo 150 g a la plancha o el resto del pollo + ensalada grande (puerro crudo, espinacas, aguacate, AOVE, limón, sal) + 20 g de almendras si falta energía.'),
    (18,'Nutrición',  'Ayuno cerrado desde las 16:00',          'evitar','16:00','diario','{}',        '',  null, 'Comida 3 — Nutrición del General (última ingesta, empieza el ayuno)','⏳','De 16:00 a 05:30 sólo agua, café o té sin azúcar.'),
    (19,'Trabajo',    'Inmersión 3 h sin distracciones',        'hacer', '08:00','dias',  '{1,2,3,4,5}','', null, 'Inmersión total — Lanzamiento 1','🎯','Sin distracciones. Ejecución pura.'),
    (20,'Trabajo',    'Daily con el Socio',                     'hacer', '13:00','dias',  '{1,2,3,4,5}','', null, 'Daily con el Socio','🤝',''),
    (21,'Trabajo',    'Daily con el Director Comercial',        'hacer', '14:15','dias',  '{1,2,3,4,5}','', null, 'Daily con el Director Comercial','📞',''),
    (22,'Trabajo',    'Planificar el mañana',                   'hacer', '19:30','diario','{}',        '',  null, 'Planificación del mañana','🗓','Qué entra en cada bloque de mañana. La comida no se decide cada día, se sirve; el día tampoco.'),
    (23,'Trabajo',    'Journal process to 520424,26$',          'hacer', '19:45','diario','{}',        '',  null, 'Planificación del mañana','✍️',''),
    (24,'Apagado',    'Desconexión total a las 20:00',          'evitar','20:00','diario','{}',        '',  null, 'Desconexión total','🌙','Sin pantallas de trabajo.'),
    (25,'Apagado',    'En la cama a las 22:00',                 'hacer', '22:00','diario','{}',        '',  null, 'Sueño de alta performance','😴','')
  ) as x(pos, grupo, nombre, tipo, hora, cadencia, dias, unidad, objetivo, bloque, icono, descripcion)
  loop
    select id into v_bloque from public.hoy_bloques where owner_id = v_yo and nombre = h.bloque;
    insert into public.hoy_habitos (owner_id, nombre, icono, cadencia, dias, posicion, hora, grupo, tipo, unidad, objetivo, bloque_id, descripcion)
    values (v_yo, h.nombre, h.icono, h.cadencia, h.dias::smallint[], h.pos, h.hora::time, h.grupo, h.tipo, h.unidad, h.objetivo::numeric, v_bloque, h.descripcion)
    on conflict (owner_id, nombre) where archivado_at is null do update
      set hora        = case when p_restaurar then excluded.hora        else coalesce(public.hoy_habitos.hora, excluded.hora) end,
          grupo       = case when p_restaurar or public.hoy_habitos.grupo = ''  then excluded.grupo  else public.hoy_habitos.grupo end,
          tipo        = case when p_restaurar or public.hoy_habitos.tipo = 'hacer' then excluded.tipo else public.hoy_habitos.tipo end,
          unidad      = case when p_restaurar or public.hoy_habitos.unidad = '' then excluded.unidad else public.hoy_habitos.unidad end,
          objetivo    = case when p_restaurar then excluded.objetivo    else coalesce(public.hoy_habitos.objetivo, excluded.objetivo) end,
          bloque_id   = case when p_restaurar then excluded.bloque_id   else coalesce(public.hoy_habitos.bloque_id, excluded.bloque_id) end,
          descripcion = case when p_restaurar or public.hoy_habitos.descripcion = '' then excluded.descripcion else public.hoy_habitos.descripcion end,
          icono       = case when p_restaurar or public.hoy_habitos.icono = '' then excluded.icono else public.hoy_habitos.icono end,
          cadencia    = case when p_restaurar then excluded.cadencia    else public.hoy_habitos.cadencia end,
          dias        = case when p_restaurar then excluded.dias        else public.hoy_habitos.dias end,
          posicion    = case when p_restaurar then excluded.posicion    else public.hoy_habitos.posicion end;
  end loop;

  -- Los cuatro heredados llegaban con cadencia `diario` + dias {1..5} (que `tocaHoy` ignora):
  -- se dejan como dicta §10.2 aunque no se restaure, porque su forma anterior era un resto.
  update public.hoy_habitos set cadencia = 'dias', dias = '{1,2,4,5}'
   where owner_id = v_yo and nombre = 'Entreno' and archivado_at is null and cadencia = 'diario';
  update public.hoy_habitos set dias = '{}'
   where owner_id = v_yo and archivado_at is null and cadencia = 'diario' and dias <> '{}';

  -- ⑩.3 el plan de entreno (§10.3): se escribe si está vacío o si se restaura
  update public.hoy_habitos set plan = '{
    "1": {"titulo": "Leopardo — explosividad", "lineas": ["Calentamiento 5'': cuerda + movilidad articular", "4 rondas: saco 3'' explosivo · burpees 12 · kettlebell swings 15 · descanso 90''''", "Enfriamiento 10'': estiramientos dinámicos"]},
    "2": {"titulo": "Tanque — fuerza bruta", "lineas": ["Calentamiento 5''", "Press de banca 4×6-8 (peso máximo con forma perfecta)", "Sentadilla con barra 4×6-8", "Peso muerto rumano 4×8-10", "Descanso 2'' entre series · enfriamiento 5''"]},
    "3": {"titulo": "Arma biológica — recuperación", "lineas": ["Sin gimnasio", "Por la tarde, spa completo: 3× (sauna finlandesa 10'' · hielo 1'' · jacuzzi 5'')", "Sauna de hierbas 10'' final"]},
    "4": {"titulo": "Gacela — velocidad", "lineas": ["Calentamiento 5''", "HIIT 30'' en cinta o elíptica: 10× (1'' al 80 % · 2'' al 40 %)", "Core 10'': plancha 3× al fallo · elevaciones de piernas colgado 3×15", "Enfriamiento 5''"]},
    "5": {"titulo": "León — dominio total", "lineas": ["Circuito ×4 sin descanso:", "Dominadas al fallo (máx 10)", "Flexiones al fallo (máx 25)", "Zancadas con mancuernas 10 por pierna", "Remo con barra 10, pesado", "90'''' al final de cada ronda. La mente se rinde antes que el cuerpo: no la dejes."]},
    "6": {"titulo": "Recuperación activa", "lineas": ["Mañana: caminata rápida 30'' sin música", "Tarde: estiramientos profundos y movilidad 30'' (caderas y espalda)"]},
    "7": {"titulo": "Descanso total", "lineas": ["Nada intenso. El cuerpo se reconstruye en el descanso.", "Caminar, sin forzar."]}
  }'::jsonb
   where owner_id = v_yo and nombre = 'Entreno' and archivado_at is null and (p_restaurar or plan = '{}'::jsonb);

  -- ⑩.4 el reto (§10.0-4)
  insert into public.hoy_retos (owner_id, nombre, descripcion, inicio, fin)
  values (v_yo, 'Zero Agent Challenge', '90 días de Protocolo. Arranca el 23-09-2026 a las 04:30.', '2026-09-23', '2026-12-21')
  on conflict (owner_id, nombre) do update set inicio = excluded.inicio, fin = excluded.fin, activo = true where p_restaurar;

  -- ⑩.5 los hitos (§10.5)
  insert into public.hoy_hitos (owner_id, frente, nombre, fecha, client_id, posicion)
  select v_yo, x.frente, x.nombre, x.fecha::date, x.client_id, x.pos from (values
    ('Alberto Chan',        'Lanzamiento afiliados de trading',                 '2026-09-25', 'money', 0),
    ('Alfredo Valenzuela',  'Lanzamiento afiliados de trading (meeting 23-09)', '2026-09-25', null,    1),
    ('Elena / Amira Girls', 'Ads en vivo',                                      '2026-09-29', null,    2),
    ('Zona Gemelos',        'Volver a llamar a la lista de leads',              null,         null,    3),
    ('Jonathan',            'Revisión legal de la landing antes de tráfico',    null,         null,    4)
  ) as x(frente, nombre, fecha, client_id, pos)
  on conflict (owner_id, frente, nombre) do nothing;

  -- ⑩.6 las dos tareas semanales (§10.4): proyecto Personal, tablero Principal, etapa todo
  select id into v_personal from public.hoy_proyectos where owner_id = v_yo and nombre = 'Personal' and archivado_at is null order by created_at limit 1;
  if v_personal is null then
    insert into public.hoy_proyectos (owner_id, nombre, icono, posicion) values (v_yo, 'Personal', '🙂', 0) returning id into v_personal;
  end if;
  select id into v_pipe from public.hoy_pipelines where owner_id = v_yo and es_default limit 1;
  select id into v_todo from public.hoy_etapas where pipeline_id = v_pipe and clave = 'todo' limit 1;
  v_domingo := current_date + ((7 - extract(isodow from current_date)::int) % 7);

  if not exists (select 1 from public.hoy_tareas where owner_id = v_yo and archivado_at is null and titulo = 'Compra semanal cetogénica (80–100 €)') then
    insert into public.hoy_tareas (owner_id, titulo, descripcion, proyecto_id, categoria, pipeline_id, etapa_id, estado, vence)
    values (v_yo, 'Compra semanal cetogénica (80–100 €)',
      E'CARNES Y PESCADOS\n· Pollo entero 1,5 kg\n· Salmón ahumado 200 g\n· 12 huevos L\n· Chorizo ibérico de tabla 300 g\n· Lomo embuchado 300 g\n\nVERDURAS\n· Espinacas frescas 500 g\n· Brócoli 500 g\n· Puerros (1 manojo)\n· 5 aguacates Hass\n· Ajo (1 cabeza)\n· 4 limones\n\nGRASAS\n· AOVE 750 ml\n· Mantequilla sin sal 250 g\n· Nata 35 % 1 L\n\nFRUTOS SECOS\n· Macadamias 150 g\n· Almendras crudas 250 g\n\nMISCELÁNEA\n· Sal del Himalaya\n· Café en grano o molido (intenso)\n· Agua con gas ×6\n\nTotal estimado: 80–100 €.',
      v_personal, 'general', v_pipe, v_todo, 'todo', v_domingo)
    returning id into v_tarea;
    insert into public.hoy_capa (tarea_id, owner_id, origen, cuadrante, repetir) values (v_tarea, v_yo, 'hoy', 'q2', 'semanal')
    on conflict (tarea_id) do nothing;
  end if;

  if not exists (select 1 from public.hoy_tareas where owner_id = v_yo and archivado_at is null and titulo = 'Meal prep de la semana (2 h)') then
    insert into public.hoy_tareas (owner_id, titulo, descripcion, proyecto_id, categoria, pipeline_id, etapa_id, estado, vence)
    values (v_yo, 'Meal prep de la semana (2 h)',
      E'Todo el pollo cocinado, verduras cortadas, aguacates listos. La comida no se decide cada día, se sirve: es logística, no cocina.',
      v_personal, 'general', v_pipe, v_todo, 'todo', v_domingo)
    returning id into v_tarea;
    insert into public.hoy_capa (tarea_id, owner_id, origen, cuadrante, repetir, hora_inicio, hora_fin) values (v_tarea, v_yo, 'hoy', 'q2', 'semanal', '16:00', '18:00')
    on conflict (tarea_id) do nothing;
  end if;

  -- ⑩.7 los dailies pasan a bloques (decisión 10): se archivan las tareas vivas, no se borran
  update public.hoy_tareas set archivado_at = now()
   where owner_id = v_yo and archivado_at is null and not hecha
     and titulo in ('Daily con Pere', 'Daily con Adri');
end $$;

-- ── ⑪ RLS + EL MURO en lo nuevo ──────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['hoy_bloques','hoy_retos','hoy_hitos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists p_%1$s_owner on public.%1$I', t);
    execute format('create policy p_%1$s_owner on public.%1$I for all
                      using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
revoke all on function public.hoy_adherencia_dia(date) from public, anon;
revoke all on function public.hoy_sembrar_protocolo(boolean) from public, anon;
revoke all on function public.hoy_reiniciar_dia(date) from public, anon;
grant execute on function public.hoy_adherencia_dia(date) to authenticated;
grant execute on function public.hoy_sembrar_protocolo(boolean) to authenticated;
grant execute on function public.hoy_reiniciar_dia(date) to authenticated;

commit;

-- ── COMPROBACIÓN (tests/forma.mjs · tests/protocolo-siembra.mjs) ─────────────
--   select count(*) from hoy_bloques;                                   -- 22 con la sesión de Alex
--   select grantee from information_schema.role_table_grants
--    where table_name in ('hoy_bloques','hoy_retos','hoy_hitos') and grantee='anon';  -- 0 filas

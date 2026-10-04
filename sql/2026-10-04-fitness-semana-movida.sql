-- ═══════════════════════════════════════════════════════════════════════════════
-- 2day — Fitness: la semana de medición se mueve al 04-10 → 10-10-2026
-- 04-10-2026 · Alex: «ni el viernes ni el sábado, he empezado hoy» (test de combate el D 04 por la mañana)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Nuevo orden. El descanso pasa al final: Alex ya descansó V y S, y el día de medidas
-- (ayunas, sin gimnasio, spa) hace de recuperación antes de la pierna.
--   D 04 combate · L 05 marcha · M 06 medidas · X 07 potencia+pierna · J 08 militar
--   V 09 tirón+empuje · S 10 descanso
-- V 02 y S 03 quedan como «Sin entreno», sólo con el pulso en reposo (el 54 del 02 es real).
-- La nota que Alex escribió el 04 a las 08:05 cayó en la sesión del 02 y viaja con ella al 04.
-- Las marcas (hoy_fit_marcas) no se tocan. Aplicar una sola vez.

begin;

-- 1) aparcar las 7 sesiones lejos (la unique es owner_id+fecha)
update public.hoy_fit_sesiones set fecha = fecha + 10000
where fecha between '2026-10-02' and '2026-10-08'
  and owner_id = (select id from auth.users where email = 'alex@growthinfo.io');

-- 2) bajarlas a su fecha nueva
update public.hoy_fit_sesiones s set fecha = m.nueva
from (values ('2026-10-02'::date, '2026-10-04'::date),  -- combate (con su nota)
             ('2026-10-03'::date, '2026-10-05'::date),  -- marcha
             ('2026-10-07'::date, '2026-10-06'::date),  -- medidas
             ('2026-10-05'::date, '2026-10-07'::date),  -- potencia + pierna
             ('2026-10-06'::date, '2026-10-08'::date),  -- militar
             ('2026-10-08'::date, '2026-10-09'::date),  -- tirón + empuje
             ('2026-10-04'::date, '2026-10-10'::date)   -- descanso
     ) m(vieja, nueva)
where s.fecha = m.vieja + 10000
  and s.owner_id = (select id from auth.users where email = 'alex@growthinfo.io');

-- 3) textos que nombraban el día siguiente
update public.hoy_fit_sesiones
set lineas = '["Nada intenso. Caminar sin forzar", "Mañana empieza el plan de verdad, construido sobre estas marcas"]'::jsonb
where fecha = '2026-10-10' and titulo = 'Descanso'
  and owner_id = (select id from auth.users where email = 'alex@growthinfo.io');

-- 4) V 02 y S 03: sin entreno, sólo el pulso
insert into public.hoy_fit_sesiones (owner_id, fecha, titulo, lineas, pruebas)
select u.id, d, 'Sin entreno', '["La semana de medición empezó el domingo 04"]'::jsonb,
  '[{"clave": "pulso_reposo", "nombre": "Pulso en reposo al despertar", "unidad": "lpm", "formato": "numero", "ref": "normal 60–70 · bueno 52–58 · alto menos de 50", "opcional": true}]'::jsonb
from auth.users u, unnest(array['2026-10-02'::date, '2026-10-03'::date]) d
where u.email = 'alex@growthinfo.io';

commit;

-- ── COMPROBACIÓN ─────────────────────────────────────────────────────────────
--   select fecha, titulo, left(nota, 30) from hoy_fit_sesiones order by fecha;  -- 9 filas, 02→10

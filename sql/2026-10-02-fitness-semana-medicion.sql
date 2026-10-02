-- ═══════════════════════════════════════════════════════════════════════════════
-- 2day — Fitness: la semana de medición, 02-10 → 08-10-2026
-- 02-10-2026 · decide Alex · ver ~/CORE/2day/LOGICA.md (§11.4)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Siete sesiones, una por fecha, con sus ejercicios y lo que se mide. Se puede aplicar
-- dos veces: una sesión que ya existe se reescribe (título, líneas y pruebas) SIN tocar
-- su nota ni ninguna medida.
--
-- Sin press de banca (los hombros de Alex): el empuje se mide con flexiones y landmine.
-- Las referencias («normal · bueno · alto») son para 25 años, 184 cm y 77 kg.

begin;

with yo as (select id from auth.users where email = 'alex@growthinfo.io'),
semana (fecha, titulo, lineas, pruebas) as (values

  -- ── viernes 02-10 ──────────────────────────────────────────────────────────
  ('2026-10-02'::date, 'Test de combate', $j$[
    "Calentamiento 8': comba, sombra y saco de cabeceo",
    "Frecuencia de golpeo: 3 × 30'' de rectos (1-2) a tope al saco pesado, con 30'' de descanso. Grábalo y cuenta los golpes de cada serie",
    "Descanso 5'",
    "5 asaltos de 3' con 1' de descanso, a ritmo de pelea",
    "Pulso justo al acabar el asalto 1 y el 5, y otra vez al terminar el minuto de descanso. Sin reloj: cuenta 15'' en el cuello y multiplica por 4"
  ]$j$::jsonb, $j$[
    {"clave": "golpes_30s_1", "nombre": "Golpes en 30'' · serie 1", "unidad": "golpes", "formato": "numero", "ref": "sin tabla: tu referencia es tu número"},
    {"clave": "golpes_30s_2", "nombre": "Golpes en 30'' · serie 2", "unidad": "golpes", "formato": "numero", "ref": ""},
    {"clave": "golpes_30s_3", "nombre": "Golpes en 30'' · serie 3", "unidad": "golpes", "formato": "numero", "ref": "objetivo: caer menos del 10 % respecto a la serie 1"},
    {"clave": "pulso_asalto_1", "nombre": "Pulso al acabar el asalto 1", "unidad": "lpm", "formato": "numero", "ref": ""},
    {"clave": "pulso_asalto_1_min", "nombre": "Pulso tras 1' de descanso (asalto 1)", "unidad": "lpm", "formato": "numero", "ref": "caída en 1': normal 20–25 · bueno 30–35 · alto 40+"},
    {"clave": "pulso_asalto_5", "nombre": "Pulso al acabar el asalto 5", "unidad": "lpm", "formato": "numero", "ref": ""},
    {"clave": "pulso_asalto_5_min", "nombre": "Pulso tras 1' de descanso (asalto 5)", "unidad": "lpm", "formato": "numero", "ref": "caída en 1': normal 20–25 · bueno 30–35 · alto 40+"},
    {"clave": "pulso_reposo", "nombre": "Pulso en reposo al despertar", "unidad": "lpm", "formato": "numero", "ref": "normal 60–70 · bueno 52–58 · alto menos de 50", "opcional": true}
  ]$j$::jsonb),

  -- ── sábado 03-10 ───────────────────────────────────────────────────────────
  ('2026-10-03'::date, 'Marcha con carga', $j$[
    "5 km con 15 kg en la mochila, cronometrados. Marcha rápida; se puede trotar",
    "Tarde: movilidad 30' de caderas, espalda y hombros"
  ]$j$::jsonb, $j$[
    {"clave": "marcha_5km_15kg", "nombre": "Marcha 5 km con 15 kg", "unidad": "min:s", "formato": "tiempo", "ref": "normal 50–55' · bueno 45' · alto menos de 40'"},
    {"clave": "pulso_reposo", "nombre": "Pulso en reposo al despertar", "unidad": "lpm", "formato": "numero", "ref": "normal 60–70 · bueno 52–58 · alto menos de 50", "opcional": true}
  ]$j$::jsonb),

  -- ── domingo 04-10 ──────────────────────────────────────────────────────────
  ('2026-10-04'::date, 'Descanso', $j$[
    "Nada intenso. Caminar sin forzar",
    "Duerme: mañana hay saltos y sentadilla a 5 repeticiones máximas"
  ]$j$::jsonb, $j$[
    {"clave": "pulso_reposo", "nombre": "Pulso en reposo al despertar", "unidad": "lpm", "formato": "numero", "ref": "normal 60–70 · bueno 52–58 · alto menos de 50", "opcional": true}
  ]$j$::jsonb),

  -- ── lunes 05-10 ────────────────────────────────────────────────────────────
  ('2026-10-05'::date, 'Potencia + pierna', $j$[
    "Calentamiento 8': movilidad de cadera y tobillo, sentadillas sin peso, 3 saltos suaves",
    "Salto vertical ×3: marca en la pared tu alcance de pie y tu alcance saltando; la diferencia es el salto. Vale el mejor",
    "Salto horizontal ×3 a pies juntos: de la línea al talón más atrasado. Vale el mejor",
    "Lanzamiento rotacional de balón medicinal de 4 kg, ×3 por lado. Vale el mejor de cada lado",
    "Sentadilla 5RM: series de 5 subiendo (40 · 60 · 75 · 85 %), luego +5–10 kg por intento y máximo 3 intentos pesados. Cadera por debajo de la rodilla. Graba los pesados"
  ]$j$::jsonb, $j$[
    {"clave": "salto_vertical", "nombre": "Salto vertical", "unidad": "cm", "formato": "numero", "ref": "normal 40–45 · bueno 55 · alto 65+"},
    {"clave": "salto_horizontal", "nombre": "Salto horizontal", "unidad": "cm", "formato": "numero", "ref": "normal 210–230 · bueno 250 · alto 275+"},
    {"clave": "balon_4kg_dcha", "nombre": "Balón 4 kg · lado derecho", "unidad": "m", "formato": "numero", "ref": "sin tabla: tu referencia es tu número"},
    {"clave": "balon_4kg_izda", "nombre": "Balón 4 kg · lado izquierdo", "unidad": "m", "formato": "numero", "ref": ""},
    {"clave": "sentadilla_5rm", "nombre": "Sentadilla 5RM", "unidad": "kg", "formato": "numero", "ref": "normal 65–80 · bueno 100 · alto 125"},
    {"clave": "pulso_reposo", "nombre": "Pulso en reposo al despertar", "unidad": "lpm", "formato": "numero", "ref": "normal 60–70 · bueno 52–58 · alto menos de 50", "opcional": true}
  ]$j$::jsonb),

  -- ── martes 06-10 ───────────────────────────────────────────────────────────
  ('2026-10-06'::date, 'Test militar', $j$[
    "Calentamiento 8'",
    "Flexiones máximas en 2': pecho a un puño del suelo y codos bloqueados arriba. Se puede parar arriba; no se apoyan las rodillas",
    "Descanso 10'",
    "2,4 km cronometrados (6 vueltas a una pista de 400 m, o cinta al 1 %). Pulso al acabar y al minuto",
    "Descanso 8'",
    "Plancha máxima sobre antebrazos: se acaba cuando la cadera cae o sube"
  ]$j$::jsonb, $j$[
    {"clave": "flexiones_2min", "nombre": "Flexiones en 2'", "unidad": "rep", "formato": "numero", "ref": "normal 30–40 · bueno 55–60 · alto 75+"},
    {"clave": "carrera_2400m", "nombre": "2,4 km", "unidad": "min:s", "formato": "tiempo", "ref": "normal 12:00–13:00 · bueno 10:30 · alto menos de 9:30"},
    {"clave": "pulso_carrera_fin", "nombre": "Pulso al acabar la carrera", "unidad": "lpm", "formato": "numero", "ref": ""},
    {"clave": "pulso_carrera_min", "nombre": "Pulso al minuto de acabar", "unidad": "lpm", "formato": "numero", "ref": "caída en 1': normal 20–25 · bueno 30–35 · alto 40+"},
    {"clave": "plancha", "nombre": "Plancha", "unidad": "min:s", "formato": "tiempo", "ref": "normal 1:30–2:00 · bueno 3:00 · alto 3:40+"},
    {"clave": "pulso_reposo", "nombre": "Pulso en reposo al despertar", "unidad": "lpm", "formato": "numero", "ref": "normal 60–70 · bueno 52–58 · alto menos de 50", "opcional": true}
  ]$j$::jsonb),

  -- ── miércoles 07-10 ────────────────────────────────────────────────────────
  ('2026-10-07'::date, 'Medidas del cuerpo', $j$[
    "En ayunas, al levantarte y después de ir al baño",
    "Cintura: cinta a la altura del ombligo, sin meter barriga, al soltar el aire",
    "Cuello: justo por debajo de la nuez",
    "Fotos de frente, perfil y espalda: misma luz, mismo sitio, misma distancia",
    "El peso se apunta en su hábito, como cada día",
    "Sin gimnasio. Por la tarde, spa completo (3 ciclos)"
  ]$j$::jsonb, $j$[
    {"clave": "cintura", "nombre": "Cintura", "unidad": "cm", "formato": "numero", "ref": "sano menos de 92 · bueno 82–85 · alto 78–82"},
    {"clave": "cuello", "nombre": "Cuello", "unidad": "cm", "formato": "numero", "ref": "con cintura y altura sale el % de grasa"},
    {"clave": "pulso_reposo", "nombre": "Pulso en reposo al despertar", "unidad": "lpm", "formato": "numero", "ref": "normal 60–70 · bueno 52–58 · alto menos de 50", "opcional": true}
  ]$j$::jsonb),

  -- ── jueves 08-10 ───────────────────────────────────────────────────────────
  ('2026-10-08'::date, 'Tirón + empuje', $j$[
    "Calentamiento 8': movilidad de hombro y cadera, 2 series suaves de remo y de bisagra de cadera",
    "Dominadas estrictas máximas: desde brazos estirados hasta barbilla sobre la barra, sin balanceo",
    "Descanso 8'",
    "Peso muerto 5RM: series de 5 subiendo y máximo 3 intentos pesados. Espalda neutra; si se redondea, el intento no vale",
    "Press landmine a una mano, 5RM por lado: apunta los kg en discos, sin contar la barra",
    "Si el press militar con barra no te molesta, mide también su 5RM",
    "Suspensión en barra máxima, al final",
    "Si el hombro molesta en cualquier prueba, paras y lo apuntas en la nota"
  ]$j$::jsonb, $j$[
    {"clave": "dominadas", "nombre": "Dominadas estrictas", "unidad": "rep", "formato": "numero", "ref": "normal 5–8 · bueno 12–15 · alto 20+"},
    {"clave": "peso_muerto_5rm", "nombre": "Peso muerto 5RM", "unidad": "kg", "formato": "numero", "ref": "normal 80–100 · bueno 130 · alto 165"},
    {"clave": "press_landmine_5rm_dcha", "nombre": "Press landmine 5RM · derecho", "unidad": "kg", "formato": "numero", "ref": "sin tabla: tu referencia es tu número"},
    {"clave": "press_landmine_5rm_izda", "nombre": "Press landmine 5RM · izquierdo", "unidad": "kg", "formato": "numero", "ref": ""},
    {"clave": "press_militar_5rm", "nombre": "Press militar 5RM", "unidad": "kg", "formato": "numero", "ref": "normal 35–40 · bueno 50 · alto 60–65", "opcional": true},
    {"clave": "suspension", "nombre": "Suspensión en barra", "unidad": "min:s", "formato": "tiempo", "ref": "normal 0:45–1:00 · bueno 1:30 · alto 2:00+"},
    {"clave": "pulso_reposo", "nombre": "Pulso en reposo al despertar", "unidad": "lpm", "formato": "numero", "ref": "normal 60–70 · bueno 52–58 · alto menos de 50", "opcional": true}
  ]$j$::jsonb)
)
insert into public.hoy_fit_sesiones (owner_id, fecha, titulo, lineas, pruebas)
select yo.id, s.fecha, s.titulo, s.lineas, s.pruebas from semana s, yo
on conflict (owner_id, fecha) do update
  set titulo = excluded.titulo, lineas = excluded.lineas, pruebas = excluded.pruebas;

commit;

-- ── COMPROBACIÓN ─────────────────────────────────────────────────────────────
--   select fecha, titulo, jsonb_array_length(pruebas) from hoy_fit_sesiones order by fecha;  -- 7 filas
